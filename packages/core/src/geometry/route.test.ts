import { describe, expect, it } from 'vitest'
import { boxFromRect, type Box } from './box.ts'
import { elbowRoute } from './route.ts'
import type { Vec } from './vec.ts'

const end = (box: Box) => ({ point: { x: 0, y: 0 }, box })

const crosses = (a: Vec, b: Vec, box: Box) =>
  Math.max(a.x, b.x) > box.minX &&
  Math.min(a.x, b.x) < box.maxX &&
  Math.max(a.y, b.y) > box.minY &&
  Math.min(a.y, b.y) < box.maxY

const segments = (points: Vec[]) => points.slice(1).map((p, i) => [points[i]!, p] as const)

describe('elbowRoute', () => {
  it('draws a straight line between facing sides', () => {
    const route = elbowRoute(
      end(boxFromRect(0, 0, 100, 100)),
      end(boxFromRect(300, 0, 100, 100)),
      6,
      28,
    )
    expect(route).toEqual([
      { x: 106, y: 50 },
      { x: 294, y: 50 },
    ])
  })

  it('turns once or twice for diagonal neighbours', () => {
    const route = elbowRoute(
      end(boxFromRect(0, 0, 100, 100)),
      end(boxFromRect(300, 300, 100, 100)),
      6,
      28,
    )
    expect(route.length).toBeGreaterThanOrEqual(3)
    expect(route.length).toBeLessThanOrEqual(4)
  })

  it('routes to a free point', () => {
    const route = elbowRoute(
      end(boxFromRect(0, 0, 100, 100)),
      { point: { x: 300, y: 400 }, box: null },
      6,
      28,
    )
    expect(route.at(-1)).toEqual({ x: 300, y: 400 })
  })

  it('stays orthogonal and never cuts through either shape', () => {
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 600
    for (let i = 0; i < 200; i++) {
      const a = boxFromRect(random(), random(), 40 + random() / 4, 40 + random() / 4)
      const b = boxFromRect(random(), random(), 40 + random() / 4, 40 + random() / 4)
      const route = elbowRoute(end(a), end(b), 6, 28)
      for (const [p, q] of segments(route)) {
        expect(p.x === q.x || p.y === q.y).toBe(true)
        if (!crosses({ x: a.minX - 60, y: a.minY - 60 }, { x: a.maxX + 60, y: a.maxY + 60 }, b)) {
          expect(crosses(p, q, a)).toBe(false)
          expect(crosses(p, q, b)).toBe(false)
        }
      }
    }
  })
})
