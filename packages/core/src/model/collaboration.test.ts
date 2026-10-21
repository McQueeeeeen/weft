import { describe, expect, it } from 'vitest'
import type * as Y from 'yjs'
import { connectedPair, partitionedPair, rect } from '../test-utils.ts'

describe('collaboration', () => {
  it('relays edits between connected replicas', () => {
    const [a, b] = connectedPair()
    const id = a.create(rect(0, 0, 10, 10))
    expect(b.get(id)).toEqual(a.get(id))
    b.update(id, { x: 99 })
    expect(a.get(id)).toMatchObject({ x: 99 })
  })

  it('marks peer changes as remote', () => {
    const [a, b] = connectedPair()
    const flags: boolean[] = []
    b.subscribe((change) => flags.push(change.local))
    a.create(rect(0, 0, 10, 10))
    expect(flags).toEqual([false])
  })

  it('merges concurrent edits to different fields of the same shape', () => {
    const { a, b, sync } = partitionedPair()
    const id = a.create(rect(0, 0, 10, 10))
    sync()
    a.update(id, { x: 100, y: 100 })
    b.update(id, { color: 'red', fill: 'tint' })
    sync()
    const expected = { x: 100, y: 100, color: 'red', fill: 'tint' }
    expect(a.get(id)).toMatchObject(expected)
    expect(b.get(id)).toEqual(a.get(id))
  })

  it('agrees on one winner for concurrent edits to the same field', () => {
    const { a, b, sync } = partitionedPair()
    const id = a.create(rect(0, 0, 10, 10))
    sync()
    a.update(id, { x: 1 })
    b.update(id, { x: 2 })
    sync()
    expect(a.get(id)!).toEqual(b.get(id)!)
  })

  it('produces the same paint order when shapes are created concurrently', () => {
    const { a, b, sync } = partitionedPair()
    for (let i = 0; i < 5; i++) {
      a.create(rect(i, 0, 10, 10))
      b.create(rect(i, 100, 10, 10))
    }
    sync()
    const order = a.all().map((s) => s.id)
    expect(order).toHaveLength(10)
    expect(b.all().map((s) => s.id)).toEqual(order)
  })

  it('lets a delete win over a concurrent move', () => {
    const { a, b, sync } = partitionedPair()
    const id = a.create(rect(0, 0, 10, 10))
    sync()
    a.delete([id])
    b.update(id, { x: 500 })
    sync()
    expect(a.has(id)).toBe(false)
    expect(b.has(id)).toBe(false)
  })

  it('keeps spatial indexes in sync with remote edits', () => {
    const [a, b] = connectedPair()
    const id = a.create(rect(0, 0, 10, 10))
    a.update(id, { x: 1000, y: 1000 })
    expect(b.shapeAt({ x: 5, y: 5 }, 0)).toBeUndefined()
    expect(b.shapeAt({ x: 1005, y: 1005 }, 0)?.id).toBe(id)
  })

  it('merges two people typing in the same note', () => {
    const { a, b, sync } = partitionedPair()
    const id = a.create({
      type: 'sticky',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      text: 'Ship on Friday',
      color: 'yellow',
    })
    sync()
    a.update(id, { text: 'Ship it on Friday' })
    b.update(id, { text: 'Ship on Friday!' })
    sync()
    expect(a.get(id)).toMatchObject({ text: 'Ship it on Friday!' })
    expect(b.get(id)).toEqual(a.get(id))
  })

  it('upgrades notes saved with plain strings on their first edit', () => {
    const { a, b, sync } = partitionedPair()
    const id = a.create(rect(0, 0, 10, 10))
    a.doc.getMap<Y.Map<unknown>>('shapes').get(id)!.set('type', 'sticky')
    a.doc.getMap<Y.Map<unknown>>('shapes').get(id)!.set('text', 'old')
    sync()
    b.update(id, { text: 'older' })
    sync()
    expect(a.get(id)).toMatchObject({ type: 'sticky', text: 'older' })
  })

  it('keeps a shared caret on the same character while others type before it', () => {
    const { a, b, sync } = partitionedPair()
    const id = a.create({
      type: 'sticky',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      text: 'Hello world',
      color: 'yellow',
    })
    sync()
    const caret = a.relativeCaret(id, 6)
    b.update(id, { text: 'Oh, Hello world' })
    sync()
    expect(a.absoluteCaret(id, caret)).toBe(10)
    expect(b.absoluteCaret(id, JSON.parse(JSON.stringify(caret)))).toBe(10)
    expect(b.absoluteCaret(id, { item: 'nonsense' })).toBeNull()
  })
})
