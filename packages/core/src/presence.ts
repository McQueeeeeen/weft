import type { Awareness } from 'y-protocols/awareness'
import type { Box } from './geometry/box.ts'
import type { Vec } from './geometry/vec.ts'

export interface PresenceUser {
  readonly name: string
  readonly color: number
}

export interface PresenceState {
  readonly user: PresenceUser
  readonly cursor: Vec | null
  readonly selection: readonly string[]
  readonly view: Box | null
}

export interface Peer extends PresenceState {
  readonly clientId: number
}

export const PRESENCE_COLOR_COUNT = 8
export const MAX_NAME_LENGTH = 32

const CURSOR_INTERVAL_MS = 40

export class Presence {
  private peerCache: Peer[] | null = null
  private pending: Partial<Pick<PresenceState, 'cursor' | 'view'>> = {}
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastSent = 0
  private readonly listeners = new Set<() => void>()

  readonly awareness: Awareness

  constructor(awareness: Awareness, user: PresenceUser) {
    this.awareness = awareness
    awareness.setLocalState({
      user,
      cursor: null,
      selection: [],
      view: null,
    } satisfies PresenceState)
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
    this.queue({ cursor })
  }

  setView(view: Box | null): void {
    this.queue({ view })
  }

  private queue(patch: Partial<Pick<PresenceState, 'cursor' | 'view'>>): void {
    this.pending = { ...this.pending, ...patch }
    if (this.timer !== null) return
    const wait = Math.max(0, this.lastSent + CURSOR_INTERVAL_MS - Date.now())
    this.timer = setTimeout(() => {
      this.timer = null
      this.lastSent = Date.now()
      this.awareness.setLocalState({ ...this.localState(), ...this.pending })
      this.pending = {}
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
    if (this.timer !== null) clearTimeout(this.timer)
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
  const { user, cursor, selection, view } = state as Record<string, unknown>
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
  const box = view as Box | null | undefined
  const validView =
    box === null ||
    box === undefined ||
    [box.minX, box.minY, box.maxX, box.maxY].every((n) => Number.isFinite(n))
  return {
    user: {
      name: name.slice(0, MAX_NAME_LENGTH),
      color: ((color % PRESENCE_COLOR_COUNT) + PRESENCE_COLOR_COUNT) % PRESENCE_COLOR_COUNT,
    },
    cursor: cursor as Vec | null,
    selection: selection,
    view: validView ? (box ?? null) : null,
  }
}
