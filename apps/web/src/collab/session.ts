import { Board, Editor, Presence, type PresenceUser } from '@weft/core'
import type { BoardTarget } from '../app/routing.ts'
import { IndexeddbPersistence } from 'y-indexeddb'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

export type Connection = 'connecting' | 'online' | 'offline'

export interface SessionStatus {
  readonly loaded: boolean
  readonly connection: Connection
  readonly synced: boolean
}

function syncUrl(readOnly: boolean): string {
  const configured = import.meta.env.VITE_SYNC_URL as string | undefined
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = configured ?? `${protocol}//${location.host}`
  return `${base}/${readOnly ? 'ws-view' : 'ws'}`
}

export class Session {
  readonly doc = new Y.Doc()
  readonly board: Board
  readonly presence: Presence
  readonly editor: Editor
  private readonly network: WebsocketProvider
  private readonly local: IndexeddbPersistence | null
  private _status: SessionStatus = { loaded: false, connection: 'connecting', synced: false }
  private readonly listeners = new Set<() => void>()
  private offlineTimer: ReturnType<typeof setTimeout> | null = null

  readonly room: string
  readonly readOnly: boolean

  constructor({ id, readOnly }: BoardTarget, user: PresenceUser) {
    this.room = id
    this.readOnly = readOnly
    this.board = new Board(this.doc)
    this.network = new WebsocketProvider(syncUrl(readOnly), id, this.doc, { maxBackoffTime: 5000 })
    this.presence = new Presence(this.network.awareness, user)
    this.editor = new Editor({ board: this.board, presence: this.presence, readOnly })

    this.local = readOnly ? null : openLocalReplica(id, this.doc)
    if (this.local) {
      this.local.whenSynced.then(
        () => this.update({ loaded: true }),
        () => this.update({ loaded: true }),
      )
    } else {
      this.update({ loaded: true })
    }

    this.offlineTimer = setTimeout(() => {
      if (this._status.connection === 'connecting') this.update({ connection: 'offline' })
    }, 4000)

    this.network.on('status', ({ status }: { status: string }) => {
      if (status === 'connected') this.update({ connection: 'online' })
      else if (status === 'disconnected') this.update({ connection: 'offline', synced: false })
    })
    this.network.on('sync', (synced: boolean) =>
      this.update({ synced, ...(synced && { loaded: true }) }),
    )
  }

  get status(): SessionStatus {
    return this._status
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    if (this.offlineTimer) clearTimeout(this.offlineTimer)
    this.editor.destroy()
    this.presence.destroy()
    this.network.destroy()
    void this.local?.destroy()
    this.board.destroy()
    this.doc.destroy()
    this.listeners.clear()
  }

  private update(patch: Partial<SessionStatus>): void {
    const next = { ...this._status, ...patch }
    if (
      next.loaded === this._status.loaded &&
      next.connection === this._status.connection &&
      next.synced === this._status.synced
    ) {
      return
    }
    this._status = next
    for (const listener of this.listeners) listener()
  }
}

function openLocalReplica(room: string, doc: Y.Doc): IndexeddbPersistence | null {
  try {
    if (typeof indexedDB === 'undefined') return null
    return new IndexeddbPersistence(`weft:${room}`, doc)
  } catch {
    return null
  }
}
