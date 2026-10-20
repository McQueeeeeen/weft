import { describe, expect, it } from 'vitest'
import { boxContainsBox, boxFromRect, boxIntersects, boxUnionAll } from './box.ts'
import {
  clipToBoxOutline,
  clipToEllipseOutline,
  distanceToSegment,
  moveToward,
  pointInEllipse,
} from './intersect.ts'
import { simplifyPolyline } from './simplify.ts'

describe('box', () => {
  it('normalizes negative sizes', () => {
    expect(boxFromRect(10, 10, -5, -5)).toEqual({ minX: 5, minY: 5, maxX: 10, maxY: 10 })
  })

  it('treats touching edges as intersecting', () => {
    expect(boxIntersects(boxFromRect(0, 0, 10, 10), boxFromRect(10, 0, 10, 10))).toBe(true)
    expect(boxIntersects(boxFromRect(0, 0, 10, 10), boxFromRect(10.01, 0, 10, 10))).toBe(false)
  })

  it('checks full containment', () => {
    const outer = boxFromRect(0, 0, 100, 100)
    expect(boxContainsBox(outer, boxFromRect(10, 10, 20, 20))).toBe(true)
    expect(boxContainsBox(outer, boxFromRect(90, 90, 20, 20))).toBe(false)
  })

  it('unions any number of boxes', () => {
    expect(boxUnionAll([])).toBeNull()
    expect(boxUnionAll([boxFromRect(0, 0, 1, 1), boxFromRect(5, -5, 1, 1)])).toEqual({
      minX: 0,
      minY: -5,
      maxX: 6,
      maxY: 1,
    })
  })
})

describe('intersections', () => {
  it('measures distance to a segment, clamped to its ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(distanceToSegment({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(
      Math.SQRT2,
    )
  })

  it('clips a ray from the box center to its outline', () => {
    const box = boxFromRect(0, 0, 100, 50)
    expect(clipToBoxOutline(box, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 })
    expect(clipToBoxOutline(box, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 })
  })

  it('clips a ray from the ellipse center to its outline', () => {
    const box = boxFromRect(0, 0, 100, 50)
    const p = clipToEllipseOutline(box, { x: 200, y: 200 })
    const nx = (p.x - 50) / 50
    const ny = (p.y - 25) / 25
    expect(nx * nx + ny * ny).toBeCloseTo(1)
  })

  it('tests ellipse membership', () => {
    const box = boxFromRect(0, 0, 100, 50)
    expect(pointInEllipse({ x: 50, y: 25 }, box)).toBe(true)
    expect(pointInEllipse({ x: 2, y: 2 }, box)).toBe(false)
  })

  it('moves toward a point without overshooting', () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 })
    expect(moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 40)).toEqual({ x: 10, y: 0 })
  })
})

describe('simplifyPolyline', () => {
  it('drops collinear points but keeps the ends', () => {
    expect(simplifyPolyline([0, 0, 1, 0, 2, 0, 3, 0, 10, 0], 0.5)).toEqual([0, 0, 10, 0])
  })

  it('keeps corners', () => {
    expect(simplifyPolyline([0, 0, 5, 0.1, 10, 0, 10, 10], 0.5)).toEqual([0, 0, 10, 0, 10, 10])
  })

  it('handles degenerate input', () => {
    expect(simplifyPolyline([], 1)).toEqual([])
    expect(simplifyPolyline([1, 2], 1)).toEqual([1, 2])
  })

  it('never moves the stroke further than the tolerance', () => {
    const points: number[] = []
    for (let i = 0; i < 400; i++) points.push(i, Math.sin(i / 20) * 40)
    const tolerance = 1
    const simplified = simplifyPolyline(points, tolerance)
    expect(simplified.length).toBeLessThan(points.length / 4)
    for (let i = 0; i < points.length; i += 2) {
      let best = Infinity
      for (let j = 0; j + 3 < simplified.length; j += 2) {
        best = Math.min(
          best,
          distanceToSegment(
            { x: points[i]!, y: points[i + 1]! },
            { x: simplified[j]!, y: simplified[j + 1]! },
            { x: simplified[j + 2]!, y: simplified[j + 3]! },
          ),
        )
      }
      expect(best).toBeLessThanOrEqual(tolerance + 1e-9)
    }
  })
})
