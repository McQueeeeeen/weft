import type { Vec } from '../geometry/vec.ts'
import type { ColorToken, Fill, Route, Size } from '../model/shapes.ts'

export const TOOLS = [
  'select',
  'hand',
  'rect',
  'ellipse',
  'sticky',
  'text',
  'frame',
  'arrow',
  'pen',
] as const
export type ToolId = (typeof TOOLS)[number]

export const TOOL_SHORTCUTS: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  r: 'rect',
  o: 'ellipse',
  s: 'sticky',
  t: 'text',
  f: 'frame',
  a: 'arrow',
  p: 'pen',
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type ArrowHandle = 'start' | 'end'
export type Handle = ResizeHandle | ArrowHandle

export type CursorKind =
  | 'default'
  | 'pointer'
  | 'grab'
  | 'grabbing'
  | 'crosshair'
  | 'move'
  | 'text'
  | 'nwse-resize'
  | 'nesw-resize'
  | 'ns-resize'
  | 'ew-resize'

export interface Modifiers {
  readonly shift: boolean
  readonly alt: boolean
  readonly mod: boolean
}

export interface PointerInput extends Modifiers {
  readonly point: Vec
  readonly pointerId: number
  readonly pointerType: 'mouse' | 'pen' | 'touch'
  readonly button: number
}

export interface WheelInput {
  readonly point: Vec
  readonly deltaX: number
  readonly deltaY: number
  readonly mod: boolean
}

export interface KeyInput extends Modifiers {
  readonly key: string
}

export interface Style {
  readonly color: ColorToken
  readonly fill: Fill
  readonly size: Size
  readonly route: Route
}

export const DEFAULT_STYLE: Style = { color: 'ink', fill: 'none', size: 'm', route: 'straight' }
