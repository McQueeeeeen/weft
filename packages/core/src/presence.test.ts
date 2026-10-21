import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { Presence, parsePresence } from './presence.ts'

function relay(from: Awareness, to: Awareness) {
  from.on('update', ({ added, updated, removed }: Record<string, number[]>) => {
    const changed = [...added!, ...updated!, ...removed!]
    applyAwarenessUpdate(to, encodeAwarenessUpdate(from, changed), 'remote')
  })
}

describe('Presence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function pair() {
    const a = new Awareness(new Y.Doc())
    const b = new Awareness(new Y.Doc())
    relay(a, b)
    relay(b, a)
    const alice = new Presence(a, { name: 'Alice', color: 1 })
    const bob = new Presence(b, { name: 'Bob', color: 2 })
    return { alice, bob }
  }

  it('lists other people but not ourselves', () => {
    const { alice, bob } = pair()
    expect(alice.peers().map((p) => p.user.name)).toEqual(['Bob'])
    expect(bob.peers().map((p) => p.user.name)).toEqual(['Alice'])
  })

  it('shares selections immediately', () => {
    const { alice, bob } = pair()
    alice.setSelection(['x', 'y'])
    expect(bob.peers()[0]!.selection).toEqual(['x', 'y'])
  })

  it('throttles cursor updates but always sends the last position', () => {
    const { alice, bob } = pair()
    for (let i = 0; i < 10; i++) alice.setCursor({ x: i, y: i })
    vi.advanceTimersByTime(0)
    expect(bob.peers()[0]!.cursor).toEqual({ x: 9, y: 9 })
    alice.setCursor({ x: 100, y: 100 })
    alice.setCursor({ x: 200, y: 200 })
    expect(bob.peers()[0]!.cursor).toEqual({ x: 9, y: 9 })
    vi.advanceTimersByTime(50)
    expect(bob.peers()[0]!.cursor).toEqual({ x: 200, y: 200 })
  })

  it('shares the viewport for follow mode', () => {
    const { alice, bob } = pair()
    alice.setView({ minX: 0, minY: 0, maxX: 800, maxY: 600 })
    alice.setCursor({ x: 5, y: 5 })
    vi.advanceTimersByTime(50)
    expect(bob.peers()[0]).toMatchObject({ view: { maxX: 800 }, cursor: { x: 5 } })
  })

  it('shares where someone is typing and drops malformed carets', () => {
    const { alice, bob } = pair()
    alice.setCaret({ id: 'note', anchor: { assoc: 0 }, head: { assoc: 0 } })
    vi.advanceTimersByTime(50)
    expect(bob.peers()[0]!.caret).toMatchObject({ id: 'note' })
    expect(
      parsePresence({
        user: { name: 'x', color: 1 },
        cursor: null,
        selection: [],
        caret: { id: 3 },
      })?.caret,
    ).toBeNull()
  })

  it('trims names', () => {
    const { alice, bob } = pair()
    alice.setUser({ name: `  ${'A'.repeat(100)}  `, color: 3 })
    expect(bob.peers()[0]!.user.name).toHaveLength(32)
  })
})

describe('parsePresence', () => {
  it('rejects malformed states', () => {
    expect(parsePresence(null)).toBeNull()
    expect(parsePresence({ user: { name: 1, color: 0 }, cursor: null, selection: [] })).toBeNull()
    expect(
      parsePresence({ user: { name: 'a', color: 0 }, cursor: { x: 'a' }, selection: [] }),
    ).toBeNull()
    expect(
      parsePresence({ user: { name: 'a', color: 0 }, cursor: null, selection: [1] }),
    ).toBeNull()
  })

  it('wraps out-of-range colors into the palette', () => {
    expect(
      parsePresence({ user: { name: 'a', color: -1 }, cursor: null, selection: [] })?.user.color,
    ).toBe(7)
  })
})
