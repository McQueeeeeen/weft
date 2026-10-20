import { moveToward } from '../geometry/intersect.ts'
import { dist, type Vec } from '../geometry/vec.ts'
import type { PenShape } from '../model/shapes.ts'
import { ARROWHEAD_SIZE } from '../model/geometry.ts'

const r = (n: number) => Math.round(n * 100) / 100

export function penPathData(shape: Pick<PenShape, 'x' | 'y' | 'points'>): string {
  const { x, y, points } = shape
  const n = points.length / 2
  if (n === 0) return ''
  const px = (i: number) => r(x + points[i * 2]!)
  const py = (i: number) => r(y + points[i * 2 + 1]!)
  if (n === 1) return `M${px(0)} ${py(0)}l0.01 0`
  if (n === 2) return `M${px(0)} ${py(0)}L${px(1)} ${py(1)}`

  let d = `M${px(0)} ${py(0)}`
  for (let i = 1; i < n - 1; i++) {
    const mx = r((x + points[i * 2]! + x + points[(i + 1) * 2]!) / 2)
    const my = r((y + points[i * 2 + 1]! + y + points[(i + 1) * 2 + 1]!) / 2)
    d += `Q${px(i)} ${py(i)} ${mx} ${my}`
  }
  d += `L${px(n - 1)} ${py(n - 1)}`
  return d
}

export function arrowHead(start: Vec, end: Vec, strokeWidth: number): [Vec, Vec] {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const length = Math.min(
    ARROWHEAD_SIZE + strokeWidth * 1.5,
    Math.hypot(end.x - start.x, end.y - start.y) * 0.6,
  )
  const spread = Math.PI / 7
  return [
    { x: end.x - length * Math.cos(angle - spread), y: end.y - length * Math.sin(angle - spread) },
    { x: end.x - length * Math.cos(angle + spread), y: end.y - length * Math.sin(angle + spread) },
  ]
}

const CORNER = 12

export function arrowPathData(points: readonly Vec[]): string {
  let d = `M${r(points[0]!.x)} ${r(points[0]!.y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const p = points[i]!
    const next = points[i + 1]!
    const radius = Math.min(CORNER, dist(prev, p) / 2, dist(p, next) / 2)
    const a = moveToward(p, prev, radius)
    const b = moveToward(p, next, radius)
    d += `L${r(a.x)} ${r(a.y)}Q${r(p.x)} ${r(p.y)} ${r(b.x)} ${r(b.y)}`
  }
  const last = points[points.length - 1]!
  return d + `L${r(last.x)} ${r(last.y)}`
}
