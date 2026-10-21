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
import type { Bus } from './bus.ts'
import { compactLog, encodeEntries, logDir, seedLog, type LogEntry } from './log.ts'
import type { Logger } from './logger.ts'
import type { Persistence } from './persistence.ts'

export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
export const MESSAGE_QUERY_AWARENESS = 3

const PERSISTENCE_ORIGIN = 'persistence'
const BUS_ORIGIN = 'bus'
const MERGE_MS = 50

export interface RoomOptions {
  readonly name: string
  readonly persistence: Persistence
  readonly logger: Logger
  readonly saveDebounceMs: number
  readonly saveMaxWaitMs: number
  readonly versionIntervalMs: number
  readonly maxVersions: number
  readonly maxLogChunks: number
  readonly bus?: Bus
  readonly onDisconnect?: (room: Room) => void
}

export class Room {
  readonly name: string
  private readonly channel: string
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)

  private readonly options: RoomOptions
  private readonly connections = new Map<WebSocket, Set<number>>()
  private readonly readers = new WeakSet<WebSocket>()
  private saveTimer: NodeJS.Timeout | null = null
  private firstUnsavedAt: number | null = null
  private saving: Promise<void> = Promise.resolve()
  private unsubscribe: (() => void) | null = null
  private log: LogEntry[] = []

  private constructor(options: RoomOptions) {
    this.options = options
    this.name = options.name
    this.channel = `weft:room:${options.name}`
    this.awareness.setLocalState(null)
  }

  static async load(options: RoomOptions): Promise<Room> {
    const room = new Room(options)
    const state = await options.persistence.get(`rooms/${options.name}`)
    if (state) {
      Y.applyUpdate(room.doc, state, PERSISTENCE_ORIGIN)
      await seedLog(options.persistence, options.name, state)
    }
    room.doc.on('update', room.onDocUpdate)
    room.awareness.on('update', room.onAwarenessUpdate)
    if (options.bus) {
      room.unsubscribe = options.bus.subscribe(room.channel, room.onBusMessage)
      room.publish(room.syncStep1())
      room.publish(new Uint8Array([MESSAGE_QUERY_AWARENESS]))
    }
    return room
  }

  get connectionCount(): number {
    return this.connections.size
  }

  connect(ws: WebSocket, buffered: readonly Uint8Array[] = [], readOnly = false): void {
    this.connections.set(ws, new Set())
    if (readOnly) this.readers.add(ws)
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => this.onMessage(ws, toBytes(data)))
    ws.on('close', () => this.disconnect(ws))
    ws.on('error', () => this.disconnect(ws))

    this.send(ws, this.syncStep1())
    this.sendAwarenessSnapshot(ws)

    for (const message of buffered) this.onMessage(ws, message)
  }

  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.firstUnsavedAt === null) return this.saving
    this.firstUnsavedAt = null
    this.saving = this.saving
      .then(() => this.save())
      .catch((error: unknown) => {
        this.options.logger.error('snapshot failed', { room: this.name, error: String(error) })
      })
    return this.saving
  }

  private async save(): Promise<void> {
    const { persistence, versionIntervalMs, maxVersions } = this.options
    const key = `rooms/${this.name}`
    const entries = this.log.splice(0)
    const stored = await persistence.get(key)
    if (stored) Y.applyUpdate(this.doc, stored, PERSISTENCE_ORIGIN)
    const state = Y.encodeStateAsUpdate(this.doc)
    await persistence.put(key, state)
    if (entries.length > 0) {
      const chunk = `${logDir(this.name)}/${entries[0]![0]}-${this.doc.clientID}`
      await persistence.put(chunk, encodeEntries(entries))
      await compactLog(persistence, this.name, this.options.maxLogChunks)
    }
    const dir = `versions/${this.name}`
    const versions = (await persistence.list(dir)).map(Number).sort((a, b) => b - a)
    const now = Date.now()
    if (now - (versions[0] ?? 0) < versionIntervalMs) return
    await persistence.put(`${dir}/${now}`, state)
    const stale = versions.slice(maxVersions - 1)
    await Promise.all(stale.map((at) => persistence.delete(`${dir}/${at}`)))
  }

  closeAll(code: number, reason: string): void {
    for (const ws of this.connections.keys()) ws.close(code, reason)
  }

  destroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.unsubscribe?.()
    this.awareness.destroy()
    this.doc.destroy()
  }

  private onMessage(ws: WebSocket, message: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(message)
      const type = decoding.readVarUint(decoder)
      switch (type) {
        case MESSAGE_SYNC: {
          if (
            this.readers.has(ws) &&
            decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1
          ) {
            break
          }
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_SYNC)
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws)
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
      this.options.logger.warn('rejected message', { room: this.name, error: String(error) })
      ws.close(1007, 'invalid message')
    }
  }

  private readonly onBusMessage = (message: Uint8Array) => {
    try {
      const decoder = decoding.createDecoder(message)
      if (decoding.readVarUint(decoder) === this.doc.clientID) return
      switch (decoding.readVarUint(decoder)) {
        case MESSAGE_SYNC: {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_SYNC)
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, BUS_ORIGIN)
          if (encoding.length(encoder) > 1) this.publish(encoding.toUint8Array(encoder))
          break
        }
        case MESSAGE_AWARENESS:
          applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), BUS_ORIGIN)
          break
        case MESSAGE_QUERY_AWARENESS: {
          const clients = [...this.awareness.getStates().keys()]
          if (clients.length > 0) this.publish(this.awarenessMessage(clients))
        }
      }
    } catch (error) {
      this.options.logger.warn('rejected bus message', { room: this.name, error: String(error) })
    }
  }

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    this.broadcast(message)
    if (origin !== BUS_ORIGIN) this.publish(message)
    if (origin !== BUS_ORIGIN && origin !== PERSISTENCE_ORIGIN) this.record(update)
    this.scheduleSave()
  }

  private record(update: Uint8Array): void {
    const at = Date.now()
    const last = this.log.at(-1)
    if (last && at - last[0] < MERGE_MS) last[1] = Y.mergeUpdates([last[1], update])
    else this.log.push([at, update])
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
    const message = this.awarenessMessage([...added, ...updated, ...removed])
    this.broadcast(message)
    if (origin !== BUS_ORIGIN) this.publish(message)
  }

  private sendAwarenessSnapshot(ws: WebSocket): void {
    const clients = [...this.awareness.getStates().keys()]
    if (clients.length > 0) this.send(ws, this.awarenessMessage(clients))
  }

  private awarenessMessage(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(this.awareness, clients))
    return encoding.toUint8Array(encoder)
  }

  private syncStep1(): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, this.doc)
    return encoding.toUint8Array(encoder)
  }

  private publish(message: Uint8Array): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, this.doc.clientID)
    encoding.writeUint8Array(encoder, message)
    this.options.bus?.publish(this.channel, encoding.toUint8Array(encoder))
  }

  private disconnect(ws: WebSocket): void {
    const controlled = this.connections.get(ws)
    if (!controlled) return
    this.connections.delete(ws)
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
