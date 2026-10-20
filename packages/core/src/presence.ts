import type { Awareness } from 'y-protocols/awareness'
import type { Vec } from './geometry/vec.ts'

export interface PresenceUser {
  readonly name: string
  readonly color: number
}

export interface PresenceState {
  readonly user: PresenceUser
  readonly cursor: Vec | null
  readonly selection: readonly string[]
}

export interface Peer extends PresenceState {
  readonly clientId: number
}

export const PRESENCE_COLOR_COUNT = 8
export const MAX_NAME_LENGTH = 32

const CURSOR_INTERVAL_MS = 40

export class Presence {
  private peerCache: Peer[] | null = null
  private pendingCursor: Vec | null | undefined
  private cursorTimer: ReturnType<typeof setTimeout> | null = null
  private lastCursorSent = 0
  private readonly listeners = new Set<() => void>()

  readonly awareness: Awareness

  constructor(awareness: Awareness, user: PresenceUser) {
    this.awareness = awareness
    awareness.setLocalState({ user, cursor: null, selection: [] } satisfies PresenceState)
    awareness.on('change', this.onChange)
  }

  get clientId(): number {
    return this.awareness.clientID
  }

  get user(): PresenceUser {
    return this.localState().user
  }

  setUser(user: PresenceUser): void {
    this.awareness.setLocalStateField('user', {
      name: user.name.trim().slice(0, MAX_NAME_LENGTH),
      color: user.color,
    })
  }

  setSelection(ids: readonly string[]): void {
    const current = this.localState().selection
    if (current.length === ids.length && current.every((id, i) => id === ids[i])) return
    this.awareness.setLocalStateField('selection', [...ids])
  }

  setCursor(cursor: Vec | null): void {
    this.pendingCursor = cursor
    if (this.cursorTimer !== null) return
    const wait = Math.max(0, this.lastCursorSent + CURSOR_INTERVAL_MS - Date.now())
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null
      this.lastCursorSent = Date.now()
      if (this.pendingCursor !== undefined) {
        this.awareness.setLocalStateField('cursor', this.pendingCursor)
        this.pendingCursor = undefined
      }
    }, wait)
  }

  peers(): readonly Peer[] {
    if (this.peerCache) return this.peerCache
    const peers: Peer[] = []
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue
      const parsed = parsePresence(state)
      if (parsed) peers.push({ ...parsed, clientId })
    }
    this.peerCache = peers.sort((a, b) => a.clientId - b.clientId)
    return this.peerCache
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    if (this.cursorTimer !== null) clearTimeout(this.cursorTimer)
    this.awareness.off('change', this.onChange)
    this.listeners.clear()
  }

  private localState(): PresenceState {
    return this.awareness.getLocalState() as PresenceState
  }

  private readonly onChange = () => {
    this.peerCache = null
    for (const listener of this.listeners) listener()
  }
}

export function parsePresence(state: unknown): PresenceState | null {
  if (typeof state !== 'object' || state === null) return null
  const { user, cursor, selection } = state as Record<string, unknown>
  if (typeof user !== 'object' || user === null) return null
  const { name, color } = user as Record<string, unknown>
  if (typeof name !== 'string' || typeof color !== 'number' || !Number.isInteger(color)) return null
  const validCursor =
    cursor === null ||
    (typeof cursor === 'object' &&
      Number.isFinite((cursor as Vec).x) &&
      Number.isFinite((cursor as Vec).y))
  if (!validCursor) return null
  if (!Array.isArray(selection) || !selection.every((id) => typeof id === 'string')) return null
  return {
    user: {
      name: name.slice(0, MAX_NAME_LENGTH),
      color: ((color % PRESENCE_COLOR_COUNT) + PRESENCE_COLOR_COUNT) % PRESENCE_COLOR_COUNT,
    },
    cursor: cursor as Vec | null,
    selection: selection,
  }
}
