import type { Vec } from '../geometry/vec.ts'
import type { ColorToken, Fill, Size } from '../model/shapes.ts'

export const TOOLS = [
  'select',
  'hand',
  'rect',
  'ellipse',
  'sticky',
  'text',
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
  /** Ctrl on Windows and Linux, Cmd on macOS. */
  readonly mod: boolean
}

export interface PointerInput extends Modifiers {
  /** Screen coordinates relative to the board element. */
  readonly point: Vec
  readonly pointerId: number
  readonly pointerType: 'mouse' | 'pen' | 'touch'
  readonly button: number
}

export interface WheelInput {
  readonly point: Vec
  readonly deltaX: number
  readonly deltaY: number
  /** Trackpad pinch arrives as a wheel event with ctrlKey set. */
  readonly mod: boolean
}

export interface KeyInput extends Modifiers {
  readonly key: string
}

export interface Style {
  readonly color: ColorToken
  readonly fill: Fill
  readonly size: Size
}

export const DEFAULT_STYLE: Style = { color: 'ink', fill: 'none', size: 'm' }
