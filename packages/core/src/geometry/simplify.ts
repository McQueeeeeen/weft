/**
 * Ramer-Douglas-Peucker simplification over a flat [x0, y0, x1, y1, ...] array.
 * Freehand strokes arrive at pointer-event rate; most of those points are redundant
 * once the stroke is finished, and every point is synced to every peer.
 */
export function simplifyPolyline(points: readonly number[], tolerance: number): number[] {
  const count = points.length / 2
  if (count <= 2) return points.slice()

  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const toleranceSq = tolerance * tolerance

  // Iterative to avoid deep recursion on long strokes.
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDistSq = 0
    let index = -1
    const ax = points[first * 2]!
    const ay = points[first * 2 + 1]!
    const bx = points[last * 2]!
    const by = points[last * 2 + 1]!
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistanceSq(points[i * 2]!, points[i * 2 + 1]!, ax, ay, bx, by)
      if (d > maxDistSq) {
        maxDistSq = d
        index = i
      }
    }
    if (index !== -1 && maxDistSq > toleranceSq) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const result: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) result.push(points[i * 2]!, points[i * 2 + 1]!)
  }
  return result
}

function segmentDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  const ex = px - (ax + t * dx)
  const ey = py - (ay + t * dy)
  return ex * ex + ey * ey
}
