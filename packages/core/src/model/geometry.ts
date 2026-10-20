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
  distanceToSegment,
  moveToward,
  pointInEllipse,
} from '../geometry/intersect.ts'
import { elbowRoute } from '../geometry/route.ts'
import type { Vec } from '../geometry/vec.ts'
import {
  FRAME_TITLE_GAP,
  FRAME_TITLE_SIZE,
  STROKE_WIDTH,
  type FrameShape,
  type ArrowShape,
  type BoxShape,
  type Shape,
  type ShapePatch,
} from './shapes.ts'

export type ShapeLookup = (id: string) => Shape | undefined

export const ARROW_GAP = 6
export const ARROWHEAD_SIZE = 14
export const ELBOW_MARGIN = 28

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

const routes = new WeakMap<ArrowShape, { key: string; points: Vec[] }>()

export function arrowPoints(arrow: ArrowShape, lookup: ShapeLookup): Vec[] {
  if (arrow.route === 'straight') {
    const { start, end } = straightEndpoints(arrow, lookup)
    return [start, end]
  }
  const startShape = boundTarget(arrow.start, lookup)
  const endShape = boundTarget(arrow.end, lookup)
  const a = { point: { x: arrow.x1, y: arrow.y1 }, box: startShape ? boxOf(startShape) : null }
  const b = { point: { x: arrow.x2, y: arrow.y2 }, box: endShape ? boxOf(endShape) : null }
  const key = JSON.stringify([a, b])
  const cached = routes.get(arrow)
  if (cached?.key === key) return cached.points
  const points = elbowRoute(a, b, ARROW_GAP, ELBOW_MARGIN)
  routes.set(arrow, { key, points })
  return points
}

export function arrowEndpoints(arrow: ArrowShape, lookup: ShapeLookup): { start: Vec; end: Vec } {
  const points = arrowPoints(arrow, lookup)
  return { start: points[0]!, end: points[points.length - 1]! }
}

function straightEndpoints(arrow: ArrowShape, lookup: ShapeLookup): { start: Vec; end: Vec } {
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
      const points = arrowPoints(shape, lookup)
      return boxExpand(boxOfPoints(points), ARROWHEAD_SIZE + STROKE_WIDTH[shape.size])
    }
    case 'pen':
      return boxExpand(boxOf(shape), STROKE_WIDTH[shape.size] / 2)
    case 'rect':
    case 'ellipse':
      return boxExpand(boxOf(shape), STROKE_WIDTH[shape.size] / 2)
    case 'sticky':
    case 'text':
    case 'image':
      return boxOf(shape)
    case 'frame':
      return { ...boxOf(shape), minY: shape.y - frameTitleHeight() }
  }
}

export const frameTitleHeight = () => FRAME_TITLE_SIZE * 1.4 + FRAME_TITLE_GAP

export function frameTitleBox(frame: FrameShape): Box {
  return boxFromRect(frame.x, frame.y - frameTitleHeight(), frame.w, frameTitleHeight())
}

export function hitTestShape(
  shape: Shape,
  p: Vec,
  tolerance: number,
  lookup: ShapeLookup,
): boolean {
  switch (shape.type) {
    case 'sticky':
    case 'text':
    case 'rect':
    case 'image':
      return boxContainsPoint(boxExpand(boxOf(shape), tolerance), p)
    case 'frame': {
      const box = boxOf(shape)
      if (boxContainsPoint(frameTitleBox(shape), p)) return true
      return (
        boxContainsPoint(boxExpand(box, tolerance), p) &&
        !boxContainsPoint(boxExpand(box, -tolerance), p)
      )
    }
    case 'ellipse':
      return pointInEllipse(p, boxExpand(boxOf(shape), tolerance))
    case 'arrow': {
      const points = arrowPoints(shape, lookup)
      const reach = tolerance + STROKE_WIDTH[shape.size] / 2
      return points.some((a, i) => i > 0 && distanceToSegment(p, points[i - 1]!, a) <= reach)
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

export function translatePatch(shape: Shape, dx: number, dy: number): ShapePatch {
  if (shape.type === 'arrow') {
    return { x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
  }
  return { x: shape.x + dx, y: shape.y + dy }
}

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
    case 'image':
    case 'frame':
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

export const boxOfPoints = (points: readonly Vec[]): Box =>
  points.reduce((b, p) => boxUnionPoint(b, p), boxFromPoints(points[0]!, points[0]!))

const boxUnionPoint = (b: Box, p: Vec): Box => ({
  minX: Math.min(b.minX, p.x),
  minY: Math.min(b.minY, p.y),
  maxX: Math.max(b.maxX, p.x),
  maxY: Math.max(b.maxY, p.y),
})
