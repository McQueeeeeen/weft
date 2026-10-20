import { describe, expect, it } from 'vitest'
import { boxFromRect } from '../geometry/box.ts'
import { resizeEdges, snapBox } from './snap.ts'

describe('snapBox', () => {
  const others = [boxFromRect(0, 0, 100, 100), boxFromRect(0, 300, 200, 50)]

  it('pulls the nearest edge or center onto a neighbour within the threshold', () => {
    const snap = snapBox(boxFromRect(204, 4, 50, 50), others, 6)
    expect(snap).toMatchObject({ dx: -4, dy: -4 })
  })

  it('leaves the box alone when nothing is close', () => {
    expect(snapBox(boxFromRect(140, 140, 20, 20), others, 6)).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('draws one guide per aligned line spanning both boxes', () => {
    const { guides } = snapBox(boxFromRect(2, 150, 60, 60), others, 6)
    expect(guides).toEqual([{ axis: 'x', at: 0, from: 0, to: 350 }])
  })

  it('only snaps the edges a resize handle moves', () => {
    const snap = snapBox(boxFromRect(30, 30, 72, 40), others, 6, resizeEdges('e'))
    expect(snap.dx).toBe(-2)
    expect(snap.dy).toBe(0)
  })
})
