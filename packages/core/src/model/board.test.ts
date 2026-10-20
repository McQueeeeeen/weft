import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { rect } from '../test-utils.ts'
import { Board, type BoardChange } from './board.ts'
import { arrowEndpoints } from './geometry.ts'

describe('Board', () => {
  it('creates shapes with ids and paint order', () => {
    const board = new Board()
    const a = board.create(rect(0, 0, 10, 10))
    const b = board.create(rect(5, 5, 10, 10))
    expect(board.size).toBe(2)
    expect(board.all().map((s) => s.id)).toEqual([a, b])
    expect(board.get(a)).toMatchObject({ type: 'rect', x: 0, y: 0, w: 10, h: 10 })
  })

  it('patches only the given fields', () => {
    const board = new Board()
    const id = board.create(rect(0, 0, 10, 10))
    board.update(id, { x: 50 })
    expect(board.get(id)).toMatchObject({ x: 50, y: 0, w: 10 })
  })

  it('ignores updates to unknown ids', () => {
    const board = new Board()
    expect(() => board.update('missing', { x: 1 })).not.toThrow()
    expect(board.size).toBe(0)
  })

  it('reorders with bringToFront and sendToBack, keeping relative order', () => {
    const board = new Board()
    const [a, b, c, d] = [0, 1, 2, 3].map((i) => board.create(rect(i, 0, 10, 10)))
    board.bringToFront([b!, a!])
    expect(board.all().map((s) => s.id)).toEqual([c, d, a, b])
    board.sendToBack([d!])
    expect(board.all().map((s) => s.id)).toEqual([d, c, a, b])
  })

  it('finds the top-most shape under a point', () => {
    const board = new Board()
    board.create(rect(0, 0, 100, 100))
    const top = board.create(rect(50, 50, 100, 100))
    expect(board.shapeAt({ x: 75, y: 75 }, 0)?.id).toBe(top)
    expect(board.shapeAt({ x: 500, y: 500 }, 0)).toBeUndefined()
  })

  it('queries by box in paint order', () => {
    const board = new Board()
    const a = board.create(rect(0, 0, 10, 10))
    board.create(rect(1000, 1000, 10, 10))
    const c = board.create(rect(5, 5, 10, 10))
    expect(board.queryBox({ minX: -1, minY: -1, maxX: 20, maxY: 20 }).map((s) => s.id)).toEqual([
      a,
      c,
    ])
  })

  it('emits incremental changes', () => {
    const board = new Board()
    const listener = vi.fn<(change: BoardChange) => void>()
    board.subscribe(listener)
    const id = board.create(rect(0, 0, 10, 10))
    board.update(id, { x: 5 })
    board.delete([id])
    const changes = listener.mock.calls.map(([c]) => ({
      added: [...c.added],
      updated: [...c.updated],
      removed: [...c.removed],
      local: c.local,
    }))
    expect(changes).toEqual([
      { added: [id], updated: [], removed: [], local: true },
      { added: [], updated: [id], removed: [], local: true },
      { added: [], updated: [], removed: [id], local: true },
    ])
  })

  it('skips malformed records written by a misbehaving peer', () => {
    const doc = new Y.Doc()
    const board = new Board(doc)
    const valid = board.create(rect(0, 0, 10, 10))
    doc.transact(() => {
      const root = doc.getMap<Y.Map<unknown>>('shapes')
      root.set(
        'bad-type',
        new Y.Map(Object.entries({ type: 'hexagon', index: 'a5', color: 'ink' })),
      )
      root.set(
        'bad-number',
        new Y.Map(Object.entries({ ...rect(0, 0, 10, 10), x: 'NaN', index: 'a6' })),
      )
      root.set('not-a-map', 'oops' as unknown as Y.Map<unknown>)
    })
    expect(board.all().map((s) => s.id)).toEqual([valid])
  })

  it('materializes existing content when attached to a populated doc', () => {
    const source = new Board()
    const id = source.create(rect(0, 0, 10, 10))
    const copy = new Board(new Y.Doc())
    Y.applyUpdate(copy.doc, Y.encodeStateAsUpdate(source.doc))
    expect(copy.get(id)).toEqual(source.get(id))
    const late = new Board(source.doc)
    expect(late.get(id)).toEqual(source.get(id))
  })

  describe('arrow bindings', () => {
    function boardWithArrow() {
      const board = new Board()
      const from = board.create(rect(0, 0, 100, 100))
      const to = board.create(rect(300, 0, 100, 100))
      const arrow = board.create({
        type: 'arrow',
        x1: 50,
        y1: 50,
        x2: 350,
        y2: 50,
        start: from,
        end: to,
        color: 'ink',
        size: 'm',
      })
      return { board, from, to, arrow }
    }

    it('attaches arrow ends to shape outlines', () => {
      const { board, arrow } = boardWithArrow()
      const shape = board.get(arrow)
      if (shape?.type !== 'arrow') throw new Error('expected arrow')
      const { start, end } = arrowEndpoints(shape, board.lookup)
      expect(start.x).toBeCloseTo(106)
      expect(end.x).toBeCloseTo(294)
      expect(start.y).toBeCloseTo(50)
    })

    it('refreshes the arrow when its target moves', () => {
      const { board, to, arrow } = boardWithArrow()
      const listener = vi.fn<(change: BoardChange) => void>()
      board.subscribe(listener)
      board.update(to, { y: 400 })
      expect([...listener.mock.calls[0]![0].updated].sort()).toEqual([arrow, to].sort())
      const bounds = board.boundsOf(arrow)!
      expect(bounds.maxY).toBeGreaterThan(400)
    })

    it('freezes the arrow in place when its target is deleted', () => {
      const { board, to, arrow } = boardWithArrow()
      const before = board.get(arrow)
      if (before?.type !== 'arrow') throw new Error('expected arrow')
      const drawnEnd = arrowEndpoints(before, board.lookup).end
      board.delete([to])
      const after = board.get(arrow)
      expect(after).toMatchObject({ end: null, x2: drawnEnd.x, y2: drawnEnd.y })
      expect(board.arrowsBoundTo(to).size).toBe(0)
    })
  })
})
