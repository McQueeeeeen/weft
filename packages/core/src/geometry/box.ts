import type { Vec } from './vec.ts'

export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export const boxFromRect = (x: number, y: number, w: number, h: number): Box => ({
  minX: Math.min(x, x + w),
  minY: Math.min(y, y + h),
  maxX: Math.max(x, x + w),
  maxY: Math.max(y, y + h),
})

export const boxFromPoints = (a: Vec, b: Vec): Box => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
})

export const boxWidth = (b: Box): number => b.maxX - b.minX

export const boxHeight = (b: Box): number => b.maxY - b.minY

export const boxCenter = (b: Box): Vec => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })

export const boxIntersects = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

export const boxContainsBox = (outer: Box, inner: Box): boolean =>
  inner.minX >= outer.minX &&
  inner.maxX <= outer.maxX &&
  inner.minY >= outer.minY &&
  inner.maxY <= outer.maxY

export const boxContainsPoint = (b: Box, p: Vec): boolean =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY

export const boxExpand = (b: Box, by: number): Box => ({
  minX: b.minX - by,
  minY: b.minY - by,
  maxX: b.maxX + by,
  maxY: b.maxY + by,
})

export const boxUnion = (a: Box, b: Box): Box => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
})

export const boxUnionAll = (boxes: Iterable<Box>): Box | null => {
  let result: Box | null = null
  for (const b of boxes) result = result ? boxUnion(result, b) : b
  return result
}
