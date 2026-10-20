import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import type { WebSocket } from 'ws'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import type { Logger } from './logger.ts'
import type { Persistence } from './persistence.ts'

/** Message types of the y-websocket wire protocol. */
export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
export const MESSAGE_QUERY_AWARENESS = 3

const PERSISTENCE_ORIGIN = 'persistence'

export interface RoomOptions {
  readonly name: string
  readonly persistence: Persistence
  readonly logger: Logger
  /** Quiet period before a snapshot is written. */
  readonly saveDebounceMs: number
  /** Upper bound on how stale the snapshot can get during continuous editing. */
  readonly saveMaxWaitMs: number
  /** Called after a socket leaves; the owner decides whether to unload the room. */
  readonly onDisconnect?: (room: Room) => void
}

/**
 * One shared document and everyone connected to it.
 *
 * The server is a relay with memory: it merges every client's updates into its own
 * replica, so a client joining late (or reconnecting after being offline) syncs
 * against the server alone, and the replica is periodically snapshotted to disk.
 */
export class Room {
  readonly name: string
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)

  private readonly options: RoomOptions
  /** Socket -> awareness client ids it controls, removed when the socket goes away. */
  private readonly connections = new Map<WebSocket, Set<number>>()
  private saveTimer: NodeJS.Timeout | null = null
  private firstUnsavedAt: number | null = null
  private saving: Promise<void> = Promise.resolve()

  private constructor(options: RoomOptions) {
    this.options = options
    this.name = options.name
    // The server has no presence of its own.
    this.awareness.setLocalState(null)
  }

  static async load(options: RoomOptions): Promise<Room> {
    const room = new Room(options)
    const state = await options.persistence.load(options.name)
    if (state) Y.applyUpdate(room.doc, state, PERSISTENCE_ORIGIN)
    room.doc.on('update', room.onDocUpdate)
    room.awareness.on('update', room.onAwarenessUpdate)
    return room
  }

  get connectionCount(): number {
    return this.connections.size
  }

  /** Adds a socket and replays messages it sent while the room was loading. */
  connect(ws: WebSocket, buffered: readonly Uint8Array[] = []): void {
    this.connections.set(ws, new Set())
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => this.onMessage(ws, toBytes(data)))
    ws.on('close', () => this.disconnect(ws))
    ws.on('error', () => this.disconnect(ws))

    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, this.doc)
    this.send(ws, encoding.toUint8Array(encoder))
    this.sendAwarenessSnapshot(ws)

    for (const message of buffered) this.onMessage(ws, message)
  }

  /** Writes the snapshot now if there are unsaved changes. */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.firstUnsavedAt === null) return this.saving
    this.firstUnsavedAt = null
    const state = Y.encodeStateAsUpdate(this.doc)
    this.saving = this.saving
      .then(() => this.options.persistence.save(this.name, state))
      .catch((error: unknown) => {
        this.options.logger.error('snapshot failed', { room: this.name, error: String(error) })
      })
    return this.saving
  }

  closeAll(code: number, reason: string): void {
    for (const ws of this.connections.keys()) ws.close(code, reason)
  }

  destroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.awareness.destroy()
    this.doc.destroy()
  }

  private onMessage(ws: WebSocket, message: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(message)
      const type = decoding.readVarUint(decoder)
      switch (type) {
        case MESSAGE_SYNC: {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_SYNC)
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws)
          // Only step 1 produces a reply (step 2); updates are broadcast via onDocUpdate.
          if (encoding.length(encoder) > 1) this.send(ws, encoding.toUint8Array(encoder))
          break
        }
        case MESSAGE_AWARENESS:
          applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), ws)
          break
        case MESSAGE_QUERY_AWARENESS:
          this.sendAwarenessSnapshot(ws)
          break
        default:
          this.options.logger.debug('unknown message type', { room: this.name, type })
      }
    } catch (error) {
      // A malformed message is a broken or hostile client; drop it, keep the room.
      this.options.logger.warn('rejected message', { room: this.name, error: String(error) })
      ws.close(1007, 'invalid message')
    }
  }

  private readonly onDocUpdate = (update: Uint8Array) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.broadcast(encoding.toUint8Array(encoder))
    this.scheduleSave()
  }

  private readonly onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const controlled = this.connections.get(origin as WebSocket)
    if (controlled) {
      for (const id of [...added, ...updated]) controlled.add(id)
      for (const id of removed) controlled.delete(id)
    }
    const changed = [...added, ...updated, ...removed]
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, changed))
    this.broadcast(encoding.toUint8Array(encoder))
  }

  private sendAwarenessSnapshot(ws: WebSocket): void {
    const clients = [...this.awareness.getStates().keys()]
    if (clients.length === 0) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, clients))
    this.send(ws, encoding.toUint8Array(encoder))
  }

  private disconnect(ws: WebSocket): void {
    const controlled = this.connections.get(ws)
    if (!controlled) return
    this.connections.delete(ws)
    // Tell everyone the person left now, instead of waiting for awareness to time out.
    removeAwarenessStates(this.awareness, [...controlled], null)
    this.options.onDisconnect?.(this)
  }

  private scheduleSave(): void {
    const now = Date.now()
    this.firstUnsavedAt ??= now
    if (this.saveTimer) clearTimeout(this.saveTimer)
    const maxWaitLeft = this.firstUnsavedAt + this.options.saveMaxWaitMs - now
    const delay = Math.max(0, Math.min(this.options.saveDebounceMs, maxWaitLeft))
    this.saveTimer = setTimeout(() => void this.flush(), delay)
  }

  private broadcast(message: Uint8Array): void {
    for (const ws of this.connections.keys()) this.send(ws, message)
  }

  private send(ws: WebSocket, message: Uint8Array): void {
    if (ws.readyState !== ws.OPEN) {
      this.disconnect(ws)
      return
    }
    ws.send(message, (error) => {
      if (error) this.disconnect(ws)
    })
  }
}

function toBytes(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data)
}
