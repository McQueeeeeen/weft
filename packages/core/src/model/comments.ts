import * as Y from 'yjs'
import type { Vec } from '../geometry/vec.ts'
import type { ShapeLookup } from './geometry.ts'
import { createId } from './ids.ts'

export interface CommentAuthor {
  readonly name: string
  readonly color: number
}

export interface Message {
  readonly id: string
  readonly author: CommentAuthor
  readonly text: string
  readonly at: number
}

export interface CommentAnchor {
  readonly x: number
  readonly y: number
  readonly shape: string | null
  readonly dx: number
  readonly dy: number
}

export interface Thread extends CommentAnchor {
  readonly id: string
  readonly resolved: boolean
  readonly messages: readonly Message[]
}

export const MAX_COMMENT_LENGTH = 2000

const COMMENTS_KEY = 'comments'

export class Comments {
  private readonly root: Y.Map<Y.Map<unknown>>
  private readonly listeners = new Set<() => void>()
  private cache: Thread[] | null = null

  constructor(doc: Y.Doc) {
    this.root = doc.getMap(COMMENTS_KEY)
    this.root.observeDeep(this.onChange)
  }

  threads(): readonly Thread[] {
    this.cache ??= [...this.root.entries()]
      .flatMap(([id, y]) => {
        const thread = y instanceof Y.Map ? parseThread(id, y) : null
        return thread ? [thread] : []
      })
      .sort((a, b) => a.messages[0]!.at - b.messages[0]!.at)
    return this.cache
  }

  get(id: string): Thread | undefined {
    return this.threads().find((t) => t.id === id)
  }

  create(anchor: CommentAnchor, author: CommentAuthor, text: string, at: number): string {
    const id = createId()
    const messages = new Y.Array<Message>()
    messages.push([message(author, text, at)])
    this.root.set(
      id,
      new Y.Map<unknown>([...Object.entries(anchor), ['resolved', false], ['messages', messages]]),
    )
    return id
  }

  reply(id: string, author: CommentAuthor, text: string, at: number): void {
    const messages = this.root.get(id)?.get('messages')
    if (messages instanceof Y.Array) messages.push([message(author, text, at)])
  }

  resolve(id: string, resolved: boolean): void {
    this.root.get(id)?.set('resolved', resolved)
  }

  remove(id: string): void {
    this.root.delete(id)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.root.unobserveDeep(this.onChange)
    this.listeners.clear()
  }

  private readonly onChange = () => {
    this.cache = null
    for (const listener of this.listeners) listener()
  }
}

export function threadPosition(thread: CommentAnchor, lookup: ShapeLookup): Vec {
  const shape = thread.shape === null ? undefined : lookup(thread.shape)
  return shape && shape.type !== 'arrow'
    ? { x: shape.x + thread.dx, y: shape.y + thread.dy }
    : { x: thread.x, y: thread.y }
}

const message = (author: CommentAuthor, text: string, at: number): Message => ({
  id: createId(),
  author: { name: author.name, color: author.color },
  text: text.slice(0, MAX_COMMENT_LENGTH),
  at,
})

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseMessage(raw: unknown): Message | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { id, author, text, at } = raw as Record<string, unknown>
  if (typeof id !== 'string' || typeof text !== 'string' || !isNumber(at)) return null
  if (typeof author !== 'object' || author === null) return null
  const { name, color } = author as Record<string, unknown>
  if (typeof name !== 'string' || !Number.isInteger(color)) return null
  return {
    id,
    author: { name: name.slice(0, 32), color: color as number },
    text: text.slice(0, MAX_COMMENT_LENGTH),
    at,
  }
}

function parseThread(id: string, y: Y.Map<unknown>): Thread | null {
  const { x, y: top, shape, dx, dy, resolved } = Object.fromEntries(y.entries())
  const raw = y.get('messages')
  if (![x, top, dx, dy].every(isNumber) || !(raw instanceof Y.Array)) return null
  const messages = raw.toArray().flatMap((m) => parseMessage(m) ?? [])
  if (messages.length === 0) return null
  return {
    id,
    x: x as number,
    y: top as number,
    shape: typeof shape === 'string' ? shape : null,
    dx: dx as number,
    dy: dy as number,
    resolved: resolved === true,
    messages,
  }
}
