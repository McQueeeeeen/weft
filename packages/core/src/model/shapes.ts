/**
 * Colors are stored as tokens, not hex values, so each client can map them to a
 * palette that works for its own theme. A shape drawn in dark mode stays legible for
 * a collaborator in light mode.
 */
export const COLORS = ['ink', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'] as const
export type ColorToken = (typeof COLORS)[number]

export const FILLS = ['none', 'tint', 'solid'] as const
export type Fill = (typeof FILLS)[number]

export const SIZES = ['s', 'm', 'l'] as const
export type Size = (typeof SIZES)[number]

export const SHAPE_TYPES = ['rect', 'ellipse', 'sticky', 'text', 'arrow', 'pen'] as const
export type ShapeType = (typeof SHAPE_TYPES)[number]

interface ShapeBase {
  readonly id: string
  /** Fractional index, compared as a plain string. Defines paint order. */
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
  /** Id of the shape the tail is attached to. Coordinates are the fallback when unbound. */
  readonly start: string | null
  readonly end: string | null
  readonly size: Size
}

export interface PenShape extends BoxShapeBase {
  readonly type: 'pen'
  /** Flat [x0, y0, x1, y1, ...] relative to (x, y). */
  readonly points: readonly number[]
  readonly size: Size
}

export type Shape = RectShape | EllipseShape | StickyShape | TextShape | ArrowShape | PenShape
export type BoxShape = Exclude<Shape, ArrowShape>
export type ShapeOfType<T extends ShapeType> = Extract<Shape, { type: T }>

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What callers provide when creating a shape; id and paint order are assigned by the board. */
export type ShapeInput = DistributiveOmit<Shape, 'id' | 'index'>

/** Fields that may be patched. `type` is immutable, `id` is the key. Distributes over the union. */
export type ShapePatch<S extends Shape = Shape> = S extends unknown
  ? Partial<Omit<S, 'id' | 'type'>>
  : never

export const isBoxShape = (shape: Shape): shape is BoxShape => shape.type !== 'arrow'

export const hasFill = (shape: Shape): shape is RectShape | EllipseShape =>
  shape.type === 'rect' || shape.type === 'ellipse'

export const hasText = (shape: Shape): shape is StickyShape | TextShape =>
  shape.type === 'sticky' || shape.type === 'text'

export const STROKE_WIDTH: Record<Size, number> = { s: 2, m: 4, l: 8 }
export const FONT_SIZE: Record<Size, number> = { s: 18, m: 28, l: 48 }
export const STICKY_SIZE = 200
export const STICKY_FONT_SIZE = 20
