import type { Camera } from '../camera.ts'
import {
  boxContainsBox,
  boxContainsPoint,
  boxFromPoints,
  boxTranslate,
  boxUnionAll,
  type Box,
} from '../geometry/box.ts'
import { simplifyPolyline } from '../geometry/simplify.ts'
import { dist, type Vec } from '../geometry/vec.ts'
import type { History } from '../history.ts'
import type { Board } from '../model/board.ts'
import { arrowEndpoints, boxOf, resizePatch, translatePatch } from '../model/geometry.ts'
import type { Shape } from '../model/shapes.ts'
import { cursorForHandle, handleAt, resizeBox, type HandlePosition } from './handles.ts'
import {
  bindableAt,
  frameOf,
  geometryOf,
  restore,
  snapTargets,
  withFrameContents,
} from './queries.ts'
import { resizeEdges, snapBox, type Guide } from './snap.ts'
import type { ArrowHandle, CursorKind, PointerInput, ResizeHandle } from './types.ts'

export type GestureKind =
  | 'idle'
  | 'panning'
  | 'pinching'
  | 'pointing-shape'
  | 'pointing-canvas'
  | 'translating'
  | 'marquee'
  | 'resizing'
  | 'moving-arrow-end'
  | 'creating'
  | 'drawing-arrow'
  | 'drawing-pen'

export interface Gesture {
  readonly kind: GestureKind
  move(e: PointerInput, world: Vec): void
  up(e: PointerInput): void
  cancel(): void
}

export interface Overlay {
  readonly marquee: Box | null
  readonly bindTarget: string | null
  readonly guides: readonly Guide[]
}

export const NO_OVERLAY: Overlay = { marquee: null, bindTarget: null, guides: [] }

export interface Host {
  readonly board: Board
  readonly history: History
  readonly camera: Camera
  readonly view: Box
  readonly selection: readonly string[]
  readonly readOnly: boolean
  readonly precision: 'fine' | 'coarse'
  now(): number
  begin(gesture: Gesture): void
  pan(dx: number, dy: number): void
  select(ids: readonly string[]): void
  selectedShapes(): Shape[]
  selectionFrame(): Box | null
  handles(): HandlePosition[]
  overlay(patch: Partial<Overlay>): void
  cursor(kind: CursorKind | null): void
  finishTool(): void
  duplicateInPlace(): void
}

export const DRAG_THRESHOLD = { fine: 3, coarse: 8 }
export const HIT_TOLERANCE = { fine: 4, coarse: 12 }
export const HANDLE_RADIUS = { fine: 8, coarse: 18 }
const DEFAULT_BOX = { w: 160, h: 100 }
const DEFAULT_FRAME = { w: 640, h: 420 }
const PEN_FLUSH_MS = 32
const SNAP_DISTANCE = 6

const noop = () => {}

export const gesture = (
  kind: GestureKind,
  handlers: Partial<Omit<Gesture, 'kind'>> = {},
): Gesture => ({
  kind,
  move: noop,
  up: noop,
  cancel: noop,
  ...handlers,
})

export const IDLE = gesture('idle')

export const tolerance = (host: Host) => HIT_TOLERANCE[host.precision] / host.camera.z

const pastThreshold = (host: Host, a: Vec, b: Vec) => dist(a, b) >= DRAG_THRESHOLD[host.precision]

const switchTo = (host: Host, next: Gesture, e: PointerInput, world: Vec) => {
  host.begin(next)
  next.move(e, world)
}

const settle = (host: Host) => {
  host.history.stopCapturing()
  host.cursor(null)
}

export function panning(host: Host, start: Vec): Gesture {
  let last = start
  host.cursor('grabbing')
  return gesture('panning', {
    move(e) {
      host.pan(e.point.x - last.x, e.point.y - last.y)
      last = e.point
    },
    up: () => host.cursor(null),
  })
}

export function selectDown(host: Host, e: PointerInput, world: Vec): Gesture {
  const handle = handleAt(host.handles(), e.point, HANDLE_RADIUS[host.precision])
  if (handle === 'start' || handle === 'end') return movingArrowEnd(host, handle)
  if (handle) return resizing(host, handle, world)

  const start = { screen: e.point, world }
  const hit = host.board.shapeAt(world, tolerance(host))
  if (hit) {
    const wasSelected = host.selection.includes(hit.id)
    if (!wasSelected) host.select(e.shift ? [...host.selection, hit.id] : [hit.id])
    return pointingShape(host, start, hit.id, wasSelected && e.shift ? 'toggle' : 'select', e.alt)
  }

  const frame = host.selection.length > 1 ? host.selectionFrame() : null
  if (frame && !e.shift && boxContainsPoint(frame, world)) {
    return pointingShape(host, start, host.selection[0]!, 'clear', e.alt)
  }

  if (!e.shift) host.select([])
  return pointingCanvas(host, start, e.shift)
}

function pointingShape(
  host: Host,
  start: { screen: Vec; world: Vec },
  id: string,
  onClick: 'select' | 'toggle' | 'clear',
  duplicate: boolean,
): Gesture {
  return gesture('pointing-shape', {
    move(e, world) {
      if (host.readOnly || !pastThreshold(host, start.screen, e.point)) return
      if (duplicate) host.duplicateInPlace()
      switchTo(host, translating(host, start.world), e, world)
    },
    up(e) {
      if (onClick === 'clear') host.select([])
      else if (onClick === 'toggle') host.select(host.selection.filter((s) => s !== id))
      else if (!e.shift) host.select([id])
    },
  })
}

function pointingCanvas(
  host: Host,
  start: { screen: Vec; world: Vec },
  additive: boolean,
): Gesture {
  return gesture('pointing-canvas', {
    move(e, world) {
      if (!pastThreshold(host, start.screen, e.point)) return
      switchTo(host, marquee(host, start.world, additive ? host.selection : []), e, world)
    },
    up() {
      if (!additive) host.select([])
    },
  })
}

function marquee(host: Host, start: Vec, base: readonly string[]): Gesture {
  return gesture('marquee', {
    move(_, world) {
      const box = boxFromPoints(start, world)
      const inside = host.board
        .queryBox(box)
        .filter((s) => boxContainsBox(box, frameOf(s, host.board.lookup)))
        .map((s) => s.id)
      host.select([...base, ...inside])
      host.overlay({ marquee: box })
    },
  })
}

function translating(host: Host, start: Vec): Gesture {
  const origins = withFrameContents(host.board, host.selectedShapes())
  const startBox = boxUnionAll(origins.filter((o) => o.type !== 'arrow').map(boxOf))
  const targets = snapTargets(host.board, host.view, origins)
  host.cursor('move')
  return gesture('translating', {
    move(e, world) {
      let dx = world.x - start.x
      let dy = world.y - start.y
      if (e.shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      const snap =
        startBox && !e.shift && !e.mod
          ? snapBox(boxTranslate(startBox, dx, dy), targets, SNAP_DISTANCE / host.camera.z)
          : null
      dx += snap?.dx ?? 0
      dy += snap?.dy ?? 0
      host.board.transact(() => {
        for (const shape of origins) host.board.update(shape.id, translatePatch(shape, dx, dy))
      })
      host.overlay({ guides: snap?.guides ?? [] })
    },
    up: () => settle(host),
    cancel: () => restore(host.board, origins),
  })
}

function resizing(host: Host, handle: ResizeHandle, start: Vec): Gesture {
  const startFrame = host.selectionFrame()!
  const origins = host.selectedShapes()
  const targets = snapTargets(host.board, host.view, origins)
  host.cursor(cursorForHandle(handle))
  return gesture('resizing', {
    move(e, world) {
      let dx = world.x - start.x
      let dy = world.y - start.y
      const snap =
        e.shift || e.mod
          ? null
          : snapBox(
              resizeBox(startFrame, handle, dx, dy, false),
              targets,
              SNAP_DISTANCE / host.camera.z,
              resizeEdges(handle),
            )
      dx += snap?.dx ?? 0
      dy += snap?.dy ?? 0
      const frame = resizeBox(startFrame, handle, dx, dy, e.shift)
      host.board.transact(() => {
        for (const shape of origins)
          host.board.update(shape.id, resizePatch(shape, startFrame, frame))
      })
      host.overlay({ guides: snap?.guides ?? [] })
    },
    up: () => settle(host),
    cancel: () => restore(host.board, origins),
  })
}

function movingArrowEnd(host: Host, which: ArrowHandle): Gesture {
  const origin = host.selectedShapes()[0]!
  host.cursor('move')
  return gesture('moving-arrow-end', {
    move(_, world) {
      const arrow = host.board.get(origin.id)
      if (arrow?.type !== 'arrow') return
      const other = which === 'start' ? arrow.end : arrow.start
      const bindTarget = bindableAt(host.board, world, tolerance(host), other)?.id ?? null
      host.board.update(
        origin.id,
        which === 'start'
          ? { x1: world.x, y1: world.y, start: bindTarget }
          : { x2: world.x, y2: world.y, end: bindTarget },
      )
      host.overlay({ bindTarget })
    },
    up: () => settle(host),
    cancel: () => host.board.update(origin.id, geometryOf(origin)),
  })
}

export function creating(host: Host, id: string, start: Vec): Gesture {
  return gesture('creating', {
    move(e, world) {
      let w = world.x - start.x
      let h = world.y - start.y
      if (e.shift) {
        const side = Math.max(Math.abs(w), Math.abs(h))
        w = side * Math.sign(w || 1)
        h = side * Math.sign(h || 1)
      }
      host.board.update(id, {
        x: Math.min(start.x, start.x + w),
        y: Math.min(start.y, start.y + h),
        w: Math.abs(w),
        h: Math.abs(h),
      })
    },
    up() {
      const shape = host.board.get(id)
      const minSize = DRAG_THRESHOLD.fine / host.camera.z
      if (shape && shape.type !== 'arrow' && shape.w < minSize && shape.h < minSize) {
        const box = shape.type === 'frame' ? DEFAULT_FRAME : DEFAULT_BOX
        host.board.update(id, { x: start.x - box.w / 2, y: start.y - box.h / 2, ...box })
      }
      if (shape?.type === 'frame') host.board.sendToBack([id])
      host.history.stopCapturing()
      host.finishTool()
    },
    cancel: () => host.board.delete([id]),
  })
}

export function drawingArrow(host: Host, id: string): Gesture {
  return gesture('drawing-arrow', {
    move(_, world) {
      const arrow = host.board.get(id)
      if (arrow?.type !== 'arrow') return
      const bindTarget = bindableAt(host.board, world, tolerance(host), arrow.start)?.id ?? null
      host.board.update(id, { x2: world.x, y2: world.y, end: bindTarget })
      host.overlay({ bindTarget })
    },
    up() {
      const arrow = host.board.get(id)
      if (arrow?.type === 'arrow') {
        const { start, end } = arrowEndpoints(arrow, host.board.lookup)
        if (dist(start, end) < (DRAG_THRESHOLD.coarse * 2) / host.camera.z) host.board.delete([id])
      }
      host.history.stopCapturing()
      host.finishTool()
    },
    cancel: () => host.board.delete([id]),
  })
}

export function drawingPen(host: Host, id: string, start: Vec): Gesture {
  const points = [start.x, start.y]
  let lastFlush = host.now()
  return gesture('drawing-pen', {
    move(_, world) {
      points.push(world.x, world.y)
      if (host.now() - lastFlush < PEN_FLUSH_MS) return
      flushPen(host.board, id, points)
      lastFlush = host.now()
    },
    up() {
      flushPen(host.board, id, simplifyPolyline(points, 0.75 / host.camera.z))
      host.history.stopCapturing()
    },
    cancel: () => host.board.delete([id]),
  })
}

function flushPen(board: Board, id: string, absolute: readonly number[]): void {
  const xs = absolute.filter((_, i) => i % 2 === 0)
  const ys = absolute.filter((_, i) => i % 2 === 1)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const points = absolute.map((v, i) => (i % 2 === 0 ? v - minX : v - minY))
  board.update(id, {
    x: minX,
    y: minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
    points,
  })
}
