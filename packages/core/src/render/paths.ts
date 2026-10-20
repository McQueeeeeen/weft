import type { Vec } from '../geometry/vec.ts'
import type { PenShape } from '../model/shapes.ts'
import { ARROWHEAD_SIZE } from '../model/geometry.ts'

const r = (n: number) => Math.round(n * 100) / 100

/**
 * SVG path data for a freehand stroke, smoothed with quadratic curves through the
 * midpoints of consecutive samples. The same string drives the canvas renderer
 * (via Path2D) and SVG export, so both always look identical.
 */
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

/** The two barbs of an arrowhead pointing at `end`. */
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
