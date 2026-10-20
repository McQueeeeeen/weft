import { boxCenter, boxHeight, boxWidth, type Box } from './box.ts'
import { dist, type Vec } from './vec.ts'

export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distance from `p` to the outline of the ellipse inscribed in `b` (approximate, exact on axes). */
export function distanceToEllipseOutline(p: Vec, b: Box): number {
  const c = boxCenter(b)
  const rx = boxWidth(b) / 2
  const ry = boxHeight(b) / 2
  if (rx === 0 || ry === 0)
    return distanceToSegment(p, { x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY })
  const angle = Math.atan2((p.y - c.y) * rx, (p.x - c.x) * ry)
  const onOutline = { x: c.x + rx * Math.cos(angle), y: c.y + ry * Math.sin(angle) }
  return dist(p, onOutline)
}

export function pointInEllipse(p: Vec, b: Box): boolean {
  const c = boxCenter(b)
  const rx = boxWidth(b) / 2
  const ry = boxHeight(b) / 2
  if (rx === 0 || ry === 0) return false
  const nx = (p.x - c.x) / rx
  const ny = (p.y - c.y) / ry
  return nx * nx + ny * ny <= 1
}

/**
 * Where a ray from the center of `b` toward `target` leaves the box outline.
 * Used to attach arrow ends to the edge of rectangles and stickies.
 */
export function clipToBoxOutline(b: Box, target: Vec): Vec {
  const c = boxCenter(b)
  const dx = target.x - c.x
  const dy = target.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = boxWidth(b) / 2
  const hh = boxHeight(b) / 2
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx)
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy)
  const t = Math.min(tx, ty)
  return { x: c.x + dx * t, y: c.y + dy * t }
}

/** Where a ray from the center of the ellipse inscribed in `b` toward `target` meets the outline. */
export function clipToEllipseOutline(b: Box, target: Vec): Vec {
  const c = boxCenter(b)
  const dx = target.x - c.x
  const dy = target.y - c.y
  const rx = boxWidth(b) / 2
  const ry = boxHeight(b) / 2
  if ((dx === 0 && dy === 0) || rx === 0 || ry === 0) return c
  const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
  return { x: c.x + dx * t, y: c.y + dy * t }
}

/** Moves `from` toward `to` by `amount`, never past `to`. */
export function moveToward(from: Vec, to: Vec, amount: number): Vec {
  const d = dist(from, to)
  if (d === 0) return from
  const t = Math.min(1, amount / d)
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}
