import {
  boxCenter,
  boxContainsPoint,
  boxExpand,
  boxFromPoints,
  boxFromRect,
  boxHeight,
  boxWidth,
  type Box,
} from '../geometry/box.ts'
import {
  clipToBoxOutline,
  clipToEllipseOutline,
  distanceToEllipseOutline,
  distanceToSegment,
  moveToward,
  pointInEllipse,
} from '../geometry/intersect.ts'
import type { Vec } from '../geometry/vec.ts'
import {
  STROKE_WIDTH,
  type ArrowShape,
  type BoxShape,
  type Shape,
  type ShapePatch,
} from './shapes.ts'

export type ShapeLookup = (id: string) => Shape | undefined

/** Space between a bound arrow end and the outline it points at. */
export const ARROW_GAP = 6
/** Arrowhead length; bounds are padded by it so heads are never culled. */
export const ARROWHEAD_SIZE = 14

export const boxOf = (shape: BoxShape): Box => boxFromRect(shape.x, shape.y, shape.w, shape.h)

function boundTarget(id: string | null, lookup: ShapeLookup): BoxShape | undefined {
  if (id === null) return undefined
  const shape = lookup(id)
  return shape && shape.type !== 'arrow' ? shape : undefined
}

function clipToShapeOutline(shape: BoxShape, toward: Vec): Vec {
  const box = boxOf(shape)
  return shape.type === 'ellipse'
    ? clipToEllipseOutline(box, toward)
    : clipToBoxOutline(box, toward)
}

/**
 * Resolves where an arrow is actually drawn. A bound end follows its shape: it sits on
 * the shape outline, on the line toward the other end. The stored coordinates are only
 * used for unbound ends, or when the bound shape was deleted by a peer.
 */
export function arrowEndpoints(arrow: ArrowShape, lookup: ShapeLookup): { start: Vec; end: Vec } {
  const startShape = boundTarget(arrow.start, lookup)
  const endShape = boundTarget(arrow.end, lookup)
  const rawStart = { x: arrow.x1, y: arrow.y1 }
  const rawEnd = { x: arrow.x2, y: arrow.y2 }
  const startAim = startShape ? boxCenter(boxOf(startShape)) : rawStart
  const endAim = endShape ? boxCenter(boxOf(endShape)) : rawEnd

  const start = startShape
    ? moveToward(clipToShapeOutline(startShape, endAim), endAim, ARROW_GAP)
    : rawStart
  const end = endShape
    ? moveToward(clipToShapeOutline(endShape, startAim), startAim, ARROW_GAP)
    : rawEnd
  return { start, end }
}

export function shapeBounds(shape: Shape, lookup: ShapeLookup): Box {
  switch (shape.type) {
    case 'arrow': {
      const { start, end } = arrowEndpoints(shape, lookup)
      return boxExpand(boxFromPoints(start, end), ARROWHEAD_SIZE + STROKE_WIDTH[shape.size])
    }
    case 'pen':
      return boxExpand(boxOf(shape), STROKE_WIDTH[shape.size] / 2)
    case 'rect':
    case 'ellipse':
      return boxExpand(boxOf(shape), STROKE_WIDTH[shape.size] / 2)
    case 'sticky':
    case 'text':
      return boxOf(shape)
  }
}

/** Precise hit test. `tolerance` is in world units, so callers scale it by zoom. */
export function hitTestShape(
  shape: Shape,
  p: Vec,
  tolerance: number,
  lookup: ShapeLookup,
): boolean {
  switch (shape.type) {
    case 'sticky':
    case 'text':
      return boxContainsPoint(boxExpand(boxOf(shape), tolerance), p)
    case 'rect': {
      const box = boxOf(shape)
      if (shape.fill !== 'none') return boxContainsPoint(boxExpand(box, tolerance), p)
      return distanceToRectOutline(p, box) <= tolerance + STROKE_WIDTH[shape.size] / 2
    }
    case 'ellipse': {
      const box = boxOf(shape)
      if (shape.fill !== 'none' && pointInEllipse(p, box)) return true
      return distanceToEllipseOutline(p, box) <= tolerance + STROKE_WIDTH[shape.size] / 2
    }
    case 'arrow': {
      const { start, end } = arrowEndpoints(shape, lookup)
      return distanceToSegment(p, start, end) <= tolerance + STROKE_WIDTH[shape.size] / 2
    }
    case 'pen': {
      const reach = tolerance + STROKE_WIDTH[shape.size] / 2
      if (!boxContainsPoint(boxExpand(boxOf(shape), reach), p)) return false
      const local = { x: p.x - shape.x, y: p.y - shape.y }
      const pts = shape.points
      if (pts.length === 2) return Math.hypot(local.x - pts[0]!, local.y - pts[1]!) <= reach
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const a = { x: pts[i]!, y: pts[i + 1]! }
        const b = { x: pts[i + 2]!, y: pts[i + 3]! }
        if (distanceToSegment(local, a, b) <= reach) return true
      }
      return false
    }
  }
}

function distanceToRectOutline(p: Vec, b: Box): number {
  const tl = { x: b.minX, y: b.minY }
  const tr = { x: b.maxX, y: b.minY }
  const br = { x: b.maxX, y: b.maxY }
  const bl = { x: b.minX, y: b.maxY }
  return Math.min(
    distanceToSegment(p, tl, tr),
    distanceToSegment(p, tr, br),
    distanceToSegment(p, br, bl),
    distanceToSegment(p, bl, tl),
  )
}

export function translatePatch(shape: Shape, dx: number, dy: number): ShapePatch {
  if (shape.type === 'arrow') {
    return { x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
  }
  return { x: shape.x + dx, y: shape.y + dy }
}

/**
 * Maps a shape from one reference box to another. Resizing a multi-selection is the
 * same transform applied to every member against the selection bounds.
 */
export function resizePatch(shape: Shape, from: Box, to: Box): ShapePatch {
  const sx = boxWidth(from) === 0 ? 1 : boxWidth(to) / boxWidth(from)
  const sy = boxHeight(from) === 0 ? 1 : boxHeight(to) / boxHeight(from)
  const mapX = (x: number) => to.minX + (x - from.minX) * sx
  const mapY = (y: number) => to.minY + (y - from.minY) * sy

  switch (shape.type) {
    case 'arrow':
      return { x1: mapX(shape.x1), y1: mapY(shape.y1), x2: mapX(shape.x2), y2: mapY(shape.y2) }
    case 'pen': {
      const ax = Math.abs(sx)
      const ay = Math.abs(sy)
      return {
        ...normalizedBox(
          mapX(shape.x),
          mapY(shape.y),
          mapX(shape.x + shape.w),
          mapY(shape.y + shape.h),
        ),
        points: shape.points.map((v, i) =>
          i % 2 === 0 ? (sx < 0 ? shape.w - v : v) * ax : (sy < 0 ? shape.h - v : v) * ay,
        ),
      }
    }
    case 'rect':
    case 'ellipse':
    case 'sticky':
    case 'text':
      return normalizedBox(
        mapX(shape.x),
        mapY(shape.y),
        mapX(shape.x + shape.w),
        mapY(shape.y + shape.h),
      )
  }
}

function normalizedBox(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  }
}
