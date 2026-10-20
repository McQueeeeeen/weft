export const COLORS = ['ink', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'] as const
export type ColorToken = (typeof COLORS)[number]

export const FILLS = ['none', 'tint', 'solid'] as const
export type Fill = (typeof FILLS)[number]

export const SIZES = ['s', 'm', 'l'] as const
export type Size = (typeof SIZES)[number]

interface ShapeBase {
  readonly id: string
  readonly index: string
  readonly color: ColorToken
}

interface BoxShapeBase extends ShapeBase {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface RectShape extends BoxShapeBase {
  readonly type: 'rect'
  readonly fill: Fill
  readonly size: Size
}

export interface EllipseShape extends BoxShapeBase {
  readonly type: 'ellipse'
  readonly fill: Fill
  readonly size: Size
}

export interface StickyShape extends BoxShapeBase {
  readonly type: 'sticky'
  readonly text: string
}

export interface TextShape extends BoxShapeBase {
  readonly type: 'text'
  readonly text: string
  readonly size: Size
}

export interface ArrowShape extends ShapeBase {
  readonly type: 'arrow'
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly start: string | null
  readonly end: string | null
  readonly size: Size
}

export interface ImageShape extends BoxShapeBase {
  readonly type: 'image'
  readonly src: string
}

export interface FrameShape extends BoxShapeBase {
  readonly type: 'frame'
  readonly title: string
}

export interface PenShape extends BoxShapeBase {
  readonly type: 'pen'
  readonly points: readonly number[]
  readonly size: Size
}

export type Shape =
  | RectShape
  | EllipseShape
  | StickyShape
  | TextShape
  | ArrowShape
  | PenShape
  | ImageShape
  | FrameShape
export type BoxShape = Exclude<Shape, ArrowShape>

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type ShapeInput = DistributiveOmit<Shape, 'id' | 'index'>

export type ShapePatch<S extends Shape = Shape> = S extends unknown
  ? Partial<Omit<S, 'id' | 'type'>>
  : never

export const hasFill = (shape: Shape): shape is RectShape | EllipseShape =>
  shape.type === 'rect' || shape.type === 'ellipse'

export const hasText = (shape: Shape): shape is StickyShape | TextShape =>
  shape.type === 'sticky' || shape.type === 'text'

export const ASSET_SRC = /^\/assets\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/
export const FRAME_TITLE_SIZE = 16
export const FRAME_TITLE_GAP = 8

export const STROKE_WIDTH: Record<Size, number> = { s: 2, m: 4, l: 8 }
export const FONT_SIZE: Record<Size, number> = { s: 18, m: 28, l: 48 }
export const STICKY_SIZE = 200
export const STICKY_FONT_SIZE = 20
