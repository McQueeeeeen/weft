import { cameraToFit, panBy, screenToWorld, viewportBox, zoomAt, type Camera } from '../camera.ts'
import {
  boxContainsBox,
  boxContainsPoint,
  boxExpand,
  boxFromPoints,
  boxUnionAll,
  type Box,
} from '../geometry/box.ts'
import { simplifyPolyline } from '../geometry/simplify.ts'
import { dist, mid, type Vec } from '../geometry/vec.ts'
import { History } from '../history.ts'
import type { Board } from '../model/board.ts'
import { arrowEndpoints, boxOf, resizePatch, translatePatch } from '../model/geometry.ts'
import {
  FONT_SIZE,
  STICKY_SIZE,
  hasFill,
  hasText,
  type Shape,
  type ShapePatch,
} from '../model/shapes.ts'
import type { Presence } from '../presence.ts'
import { deserializeShapes, serializeShapes } from './clipboard.ts'
import {
  cursorForHandle,
  handleAt,
  resizeBox,
  selectionHandles,
  type HandlePosition,
} from './handles.ts'
import {
  DEFAULT_STYLE,
  TOOL_SHORTCUTS,
  type ArrowHandle,
  type CursorKind,
  type KeyInput,
  type PointerInput,
  type ResizeHandle,
  type Style,
  type ToolId,
  type WheelInput,
} from './types.ts'

type Gesture =
  | { kind: 'idle' }
  | { kind: 'panning'; last: Vec }
  | { kind: 'pinching'; startDistance: number; startZoom: number; anchorWorld: Vec }
  | {
      kind: 'pointing-shape'
      startScreen: Vec
      startWorld: Vec
      id: string
      toggleOnUp: boolean
      clearOnClick: boolean
      duplicate: boolean
    }
  | { kind: 'pointing-canvas'; startScreen: Vec; startWorld: Vec; additive: boolean }
  | { kind: 'translating'; startWorld: Vec; origins: Shape[] }
  | { kind: 'marquee'; startWorld: Vec; base: readonly string[] }
  | { kind: 'resizing'; handle: ResizeHandle; startWorld: Vec; startFrame: Box; origins: Shape[] }
  | { kind: 'moving-arrow-end'; id: string; which: ArrowHandle; origin: Shape }
  | { kind: 'creating'; id: string; startWorld: Vec }
  | { kind: 'drawing-arrow'; id: string; startWorld: Vec }
  | { kind: 'drawing-pen'; id: string; points: number[]; lastFlush: number }

const IDLE: Gesture = { kind: 'idle' }

const DRAG_THRESHOLD = { fine: 3, coarse: 8 }
const HIT_TOLERANCE = { fine: 4, coarse: 12 }
const HANDLE_RADIUS = { fine: 8, coarse: 18 }

const DEFAULT_BOX = { w: 160, h: 100 }
const PEN_FLUSH_MS = 32
const NUDGE = 1
const NUDGE_LARGE = 10
const ZOOM_STEP = 1.25
const PASTE_OFFSET = 24

export interface EditorOptions {
  readonly board: Board
  readonly presence?: Presence | null
  readonly now?: () => number
}

export class Editor {
  readonly board: Board
  readonly history: History
  readonly presence: Presence | null

  private _camera: Camera = { x: 0, y: 0, z: 1 }
  private _viewport = { width: 0, height: 0 }
  private _tool: ToolId = 'select'
  private _selection: readonly string[] = []
  private _hovered: string | null = null
  private _editing: string | null = null
  private _marquee: Box | null = null
  private _bindTarget: string | null = null
  private _style: Style = DEFAULT_STYLE
  private _spaceHeld = false
  private _cursor: CursorKind = 'default'
  private _version = 0

  private gesture: Gesture = IDLE
  private readonly touches = new Map<number, Vec>()
  private pointerType: PointerInput['pointerType'] = 'mouse'
  private pasteCount = 0
  private readonly now: () => number
  private readonly listeners = new Set<() => void>()
  private readonly disposers: (() => void)[] = []

  constructor({ board, presence = null, now = Date.now }: EditorOptions) {
    this.board = board
    this.presence = presence
    this.now = now
    this.history = new History(board, {
      get: () => this._selection,
      restore: (ids) => this.select(ids),
    })
    this.disposers.push(
      board.subscribe((change) => {
        if (change.removed.size > 0) {
          const kept = this._selection.filter((id) => !change.removed.has(id))
          if (kept.length !== this._selection.length) this.select(kept)
          if (this._editing && change.removed.has(this._editing)) this._editing = null
          if (this._hovered && change.removed.has(this._hovered)) this._hovered = null
        }
        this.changed()
      }),
      this.history.subscribe(() => this.changed()),
    )
  }

  get version(): number {
    return this._version
  }
  get camera(): Camera {
    return this._camera
  }
  get viewport(): { readonly width: number; readonly height: number } {
    return this._viewport
  }
  get tool(): ToolId {
    return this._tool
  }
  get selection(): readonly string[] {
    return this._selection
  }
  get hovered(): string | null {
    return this._hovered
  }
  get editingId(): string | null {
    return this._editing
  }
  get marquee(): Box | null {
    return this._marquee
  }
  get bindTarget(): string | null {
    return this._bindTarget
  }
  get cursor(): CursorKind {
    return this._cursor
  }
  get isInteracting(): boolean {
    return this.gesture.kind !== 'idle'
  }

  selectedShapes(): Shape[] {
    return this._selection.map((id) => this.board.get(id)).filter((s): s is Shape => !!s)
  }

  get style(): Style {
    const first = this.selectedShapes()[0]
    if (!first) return this._style
    return {
      color: first.color,
      fill: hasFill(first) ? first.fill : this._style.fill,
      size: 'size' in first ? first.size : this._style.size,
    }
  }

  selectionFrame(): Box | null {
    return boxUnionAll(this.selectedShapes().map((s) => this.frameOf(s)))
  }

  handles(): HandlePosition[] {
    if (this._tool !== 'select' || this._editing !== null) return []
    const kind = this.gesture.kind
    if (kind === 'translating' || kind === 'marquee') return []
    return selectionHandles(
      this.selectedShapes(),
      this.selectionFrame(),
      this._camera,
      this.board.lookup,
    )
  }

  visibleShapes(margin = 64): Shape[] {
    const { width, height } = this._viewport
    return this.board.queryBox(
      boxExpand(viewportBox(this._camera, width, height), margin / this._camera.z),
    )
  }

  screenToWorld(p: Vec): Vec {
    return screenToWorld(this._camera, p)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose()
    this.history.destroy()
    this.listeners.clear()
  }

  setViewport(width: number, height: number): void {
    const first = this._viewport.width === 0 && this._viewport.height === 0
    this._viewport = { width, height }
    if (first) this._camera = { x: -width / 2, y: -height / 2, z: 1 }
    this.changed()
  }

  setCamera(camera: Camera): void {
    this._camera = camera
    this.changed()
  }

  setTool(tool: ToolId): void {
    if (this._tool === tool) return
    this.cancel()
    this.stopEditing()
    this._tool = tool
    if (tool !== 'select') this.select([])
    this._hovered = null
    this._cursor = this.idleCursor()
    this.changed()
  }

  select(ids: readonly string[]): void {
    const next = [...new Set(ids)].filter((id) => this.board.has(id))
    const same =
      next.length === this._selection.length && next.every((id, i) => id === this._selection[i])
    if (same) return
    this._selection = next
    this.presence?.setSelection(next)
    this.changed()
  }

  selectAll(): void {
    this.setTool('select')
    this.select(this.board.all().map((s) => s.id))
  }

  setStyle(patch: Partial<Style>): void {
    this._style = { ...this._style, ...patch }
    const selected = this.selectedShapes()
    if (selected.length > 0) {
      this.history.stopCapturing()
      this.board.transact(() => {
        for (const shape of selected) this.board.update(shape.id, stylePatch(shape, patch))
      })
      this.history.stopCapturing()
    }
    this.changed()
  }

  deleteSelected(): void {
    if (this._selection.length === 0) return
    this.history.stopCapturing()
    this.board.delete(this._selection)
    this.history.stopCapturing()
  }

  duplicateSelected(): void {
    const text = this.copy()
    if (text) this.insertClipboard(text, { offset: { x: PASTE_OFFSET, y: PASTE_OFFSET } })
  }

  bringToFront(): void {
    this.history.stopCapturing()
    this.board.bringToFront(this._selection)
  }

  sendToBack(): void {
    this.history.stopCapturing()
    this.board.sendToBack(this._selection)
  }

  nudge(dx: number, dy: number): void {
    const selected = this.selectedShapes()
    if (selected.length === 0) return
    this.board.transact(() => {
      for (const shape of selected) this.board.update(shape.id, translatePatch(shape, dx, dy))
    })
  }

  undo(): void {
    this.cancel()
    this.stopEditing()
    this.history.undo()
  }

  redo(): void {
    this.cancel()
    this.stopEditing()
    this.history.redo()
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP)
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP)
  }

  resetZoom(): void {
    this.setCamera(zoomAt(this._camera, this.viewportCenter(), 1))
  }

  zoomToFit(): void {
    const bounds = this.board.boundsOfAll(this.board.all().map((s) => s.id))
    if (!bounds) return this.resetZoom()
    this.setCamera(cameraToFit(bounds, this._viewport.width, this._viewport.height))
  }

  zoomToSelection(): void {
    const bounds = this.board.boundsOfAll(this._selection)
    if (!bounds) return
    this.setCamera(cameraToFit(bounds, this._viewport.width, this._viewport.height, 64, 4))
  }

  startEditing(id: string): void {
    const shape = this.board.get(id)
    if (!shape || !hasText(shape)) return
    this.history.stopCapturing()
    this._tool = 'select'
    this._editing = id
    this.select([id])
    this.changed()
  }

  updateText(id: string, text: string, size?: { w: number; h: number }): void {
    this.board.update(id, { text, ...size })
  }

  stopEditing(): void {
    const id = this._editing
    if (id === null) return
    this._editing = null
    const shape = this.board.get(id)
    if (shape?.type === 'text' && shape.text.trim() === '') this.board.delete([id])
    this.history.stopCapturing()
    this.changed()
  }

  copy(): string | null {
    const selected = this.selectedShapes()
    if (selected.length === 0) return null
    this.pasteCount = 0
    return serializeShapes(
      this.board.sortByPaintOrder(selected.map((s) => s.id)).map((id) => this.board.get(id)!),
      this.board.lookup,
    )
  }

  cut(): string | null {
    const text = this.copy()
    if (text) this.deleteSelected()
    return text
  }

  paste(text: string, at?: Vec): boolean {
    this.pasteCount++
    const placement = at
      ? { center: this.screenToWorld(at) }
      : { offset: { x: PASTE_OFFSET * this.pasteCount, y: PASTE_OFFSET * this.pasteCount } }
    return this.insertClipboard(text, placement)
  }

  pointerDown(e: PointerInput): void {
    this.pointerType = e.pointerType
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, e.point)
      if (this.touches.size === 2) return this.startPinch()
      if (this.touches.size > 2) return
    }
    if (this._editing) this.stopEditing()

    const world = this.screenToWorld(e.point)
    this.presence?.setCursor(world)

    if (e.button === 1 || this._tool === 'hand' || this._spaceHeld) {
      this.gesture = { kind: 'panning', last: e.point }
      this._cursor = 'grabbing'
      return this.changed()
    }
    if (e.button !== 0) return

    this.history.stopCapturing()
    switch (this._tool) {
      case 'select':
        return this.selectPointerDown(e, world)
      case 'rect':
      case 'ellipse': {
        const { color, fill, size } = this._style
        const id = this.board.create({
          type: this._tool,
          x: world.x,
          y: world.y,
          w: 0,
          h: 0,
          color,
          fill,
          size,
        })
        this.select([id])
        this.gesture = { kind: 'creating', id, startWorld: world }
        return this.changed()
      }
      case 'sticky': {
        const color = this._style.color === 'ink' ? 'yellow' : this._style.color
        const half = STICKY_SIZE / 2
        const id = this.board.create({
          type: 'sticky',
          x: world.x - half,
          y: world.y - half,
          w: STICKY_SIZE,
          h: STICKY_SIZE,
          color,
          text: '',
        })
        return this.startEditing(id)
      }
      case 'text':
        return this.createText(world)
      case 'arrow': {
        const target = this.bindableAt(world)
        const { color, size } = this._style
        const id = this.board.create({
          type: 'arrow',
          x1: world.x,
          y1: world.y,
          x2: world.x,
          y2: world.y,
          start: target?.id ?? null,
          end: null,
          color,
          size,
        })
        this.select([id])
        this.gesture = { kind: 'drawing-arrow', id, startWorld: world }
        return this.changed()
      }
      case 'pen': {
        const { color, size } = this._style
        const id = this.board.create({
          type: 'pen',
          x: world.x,
          y: world.y,
          w: 0,
          h: 0,
          points: [0, 0],
          color,
          size,
        })
        this.gesture = {
          kind: 'drawing-pen',
          id,
          points: [world.x, world.y],
          lastFlush: this.now(),
        }
        return this.changed()
      }
    }
  }

  pointerMove(e: PointerInput): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, e.point)
      if (this.gesture.kind === 'pinching') return this.updatePinch()
    }
    const world = this.screenToWorld(e.point)
    this.presence?.setCursor(world)
    const g = this.gesture

    switch (g.kind) {
      case 'idle':
        return this.updateHover(e.point, world)
      case 'pinching':
        return
      case 'panning': {
        this._camera = panBy(this._camera, e.point.x - g.last.x, e.point.y - g.last.y)
        this.gesture = { kind: 'panning', last: e.point }
        return this.changed()
      }
      case 'pointing-shape': {
        if (!this.pastThreshold(g.startScreen, e.point)) return
        if (g.duplicate) this.duplicateInPlace()
        this.gesture = {
          kind: 'translating',
          startWorld: g.startWorld,
          origins: this.selectedShapes(),
        }
        this._cursor = 'move'
        return this.pointerMove(e)
      }
      case 'pointing-canvas': {
        if (!this.pastThreshold(g.startScreen, e.point)) return
        this.gesture = {
          kind: 'marquee',
          startWorld: g.startWorld,
          base: g.additive ? this._selection : [],
        }
        return this.pointerMove(e)
      }
      case 'translating': {
        let dx = world.x - g.startWorld.x
        let dy = world.y - g.startWorld.y
        if (e.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        this.board.transact(() => {
          for (const shape of g.origins) this.board.update(shape.id, translatePatch(shape, dx, dy))
        })
        return
      }
      case 'marquee': {
        const box = boxFromPoints(g.startWorld, world)
        this._marquee = box
        const inside = this.board
          .queryBox(box)
          .filter((s) => boxContainsBox(box, this.frameOf(s)))
          .map((s) => s.id)
        this.select([...g.base, ...inside])
        return this.changed()
      }
      case 'resizing': {
        const frame = resizeBox(
          g.startFrame,
          g.handle,
          world.x - g.startWorld.x,
          world.y - g.startWorld.y,
          e.shift,
        )
        this.board.transact(() => {
          for (const shape of g.origins)
            this.board.update(shape.id, resizePatch(shape, g.startFrame, frame))
        })
        return
      }
      case 'moving-arrow-end': {
        const arrow = this.board.get(g.id)
        if (arrow?.type !== 'arrow') return
        const other = g.which === 'start' ? arrow.end : arrow.start
        const target = this.bindableAt(world, other)
        this._bindTarget = target?.id ?? null
        this.board.update(
          g.id,
          g.which === 'start'
            ? { x1: world.x, y1: world.y, start: this._bindTarget }
            : { x2: world.x, y2: world.y, end: this._bindTarget },
        )
        return this.changed()
      }
      case 'creating': {
        let w = world.x - g.startWorld.x
        let h = world.y - g.startWorld.y
        if (e.shift) {
          const side = Math.max(Math.abs(w), Math.abs(h))
          w = side * Math.sign(w || 1)
          h = side * Math.sign(h || 1)
        }
        this.board.update(g.id, {
          x: Math.min(g.startWorld.x, g.startWorld.x + w),
          y: Math.min(g.startWorld.y, g.startWorld.y + h),
          w: Math.abs(w),
          h: Math.abs(h),
        })
        return
      }
      case 'drawing-arrow': {
        const arrow = this.board.get(g.id)
        if (arrow?.type !== 'arrow') return
        const target = this.bindableAt(world, arrow.start)
        this._bindTarget = target?.id ?? null
        this.board.update(g.id, { x2: world.x, y2: world.y, end: this._bindTarget })
        return this.changed()
      }
      case 'drawing-pen': {
        g.points.push(world.x, world.y)
        if (this.now() - g.lastFlush >= PEN_FLUSH_MS) {
          this.flushPen(g.id, g.points)
          g.lastFlush = this.now()
        }
        return
      }
    }
  }

  pointerUp(e: PointerInput): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId)
      if (this.gesture.kind === 'pinching') {
        if (this.touches.size === 0) this.gesture = IDLE
        return
      }
    }
    const g = this.gesture
    this.gesture = IDLE
    this._bindTarget = null

    switch (g.kind) {
      case 'idle':
      case 'pinching':
        return
      case 'panning':
        this._cursor = this.idleCursor()
        return this.changed()
      case 'pointing-shape':
        if (g.clearOnClick) this.select([])
        else if (g.toggleOnUp) this.select(this._selection.filter((id) => id !== g.id))
        else if (!e.shift) this.select([g.id])
        return this.changed()
      case 'pointing-canvas':
        if (!g.additive) this.select([])
        return this.changed()
      case 'marquee':
        this._marquee = null
        return this.changed()
      case 'translating':
      case 'resizing':
      case 'moving-arrow-end':
        this.history.stopCapturing()
        this._cursor = this.idleCursor()
        return this.changed()
      case 'creating': {
        const shape = this.board.get(g.id)
        const minSize = DRAG_THRESHOLD.fine / this._camera.z
        if (shape && shape.type !== 'arrow' && shape.w < minSize && shape.h < minSize) {
          this.board.update(g.id, {
            x: g.startWorld.x - DEFAULT_BOX.w / 2,
            y: g.startWorld.y - DEFAULT_BOX.h / 2,
            ...DEFAULT_BOX,
          })
        }
        this.history.stopCapturing()
        this._tool = 'select'
        this._cursor = 'default'
        return this.changed()
      }
      case 'drawing-arrow': {
        const arrow = this.board.get(g.id)
        if (arrow?.type === 'arrow') {
          const { start, end } = arrowEndpoints(arrow, this.board.lookup)
          if (dist(start, end) < (DRAG_THRESHOLD.coarse * 2) / this._camera.z)
            this.board.delete([g.id])
        }
        this.history.stopCapturing()
        this._tool = 'select'
        this._cursor = 'default'
        return this.changed()
      }
      case 'drawing-pen': {
        const simplified = simplifyPolyline(g.points, 0.75 / this._camera.z)
        this.flushPen(g.id, simplified)
        this.history.stopCapturing()
        return this.changed()
      }
    }
  }

  pointerLeave(): void {
    this.presence?.setCursor(null)
    if (this._hovered !== null) {
      this._hovered = null
      this.changed()
    }
  }

  doubleClick(e: PointerInput): void {
    if (this._tool !== 'select') return
    const world = this.screenToWorld(e.point)
    const hit = this.board.shapeAt(world, this.tolerance())
    if (hit && hasText(hit)) return this.startEditing(hit.id)
    if (!hit) this.createText(world)
  }

  cancel(): void {
    const g = this.gesture
    this.gesture = IDLE
    this._marquee = null
    this._bindTarget = null
    this.touches.clear()
    switch (g.kind) {
      case 'translating':
      case 'resizing':
        this.board.transact(() => {
          for (const shape of g.origins) this.board.update(shape.id, geometryOf(shape))
        })
        break
      case 'moving-arrow-end':
        this.board.update(g.id, geometryOf(g.origin))
        break
      case 'creating':
      case 'drawing-arrow':
      case 'drawing-pen':
        this.board.delete([g.id])
        break
      default:
        break
    }
    this.history.stopCapturing()
    this._cursor = this.idleCursor()
    this.changed()
  }

  wheel(e: WheelInput): void {
    if (e.mod) {
      const delta = Math.max(-50, Math.min(50, e.deltaY))
      this._camera = zoomAt(this._camera, e.point, this._camera.z * Math.exp(-delta * 0.01))
    } else {
      this._camera = panBy(this._camera, -e.deltaX, -e.deltaY)
    }
    this.changed()
  }

  keyDown(e: KeyInput): boolean {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (this._editing) {
      if (key === 'Escape') {
        this.stopEditing()
        return true
      }
      return false
    }

    if (e.mod) {
      switch (key) {
        case 'z':
          if (e.shift) this.redo()
          else this.undo()
          return true
        case 'y':
          this.redo()
          return true
        case 'a':
          this.selectAll()
          return true
        case 'd':
          this.duplicateSelected()
          return true
        case '=':
        case '+':
          this.zoomIn()
          return true
        case '-':
          this.zoomOut()
          return true
        case '0':
          this.resetZoom()
          return true
        default:
          return false
      }
    }

    switch (key) {
      case ' ':
        if (!this._spaceHeld) {
          this._spaceHeld = true
          this._cursor = 'grab'
          this.changed()
        }
        return true
      case 'Escape':
        if (this.gesture.kind !== 'idle') this.cancel()
        else if (this._tool !== 'select') this.setTool('select')
        else this.select([])
        return true
      case 'Delete':
      case 'Backspace':
        this.deleteSelected()
        return true
      case 'Enter': {
        const only = this.selectedShapes()
        if (only.length === 1 && hasText(only[0]!)) {
          this.startEditing(only[0].id)
          return true
        }
        return false
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (this._selection.length === 0) return false
        const step = e.shift ? NUDGE_LARGE : NUDGE
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
        this.nudge(dx, dy)
        return true
      }
      case ']':
        this.bringToFront()
        return true
      case '[':
        this.sendToBack()
        return true
      case '!':
      case '1':
        if (!e.shift) return false
        this.zoomToFit()
        return true
      case '@':
      case '2':
        if (!e.shift) return false
        this.zoomToSelection()
        return true
      default: {
        const tool = TOOL_SHORTCUTS[key]
        if (!tool || e.alt) return false
        this.setTool(tool)
        return true
      }
    }
  }

  keyUp(e: KeyInput): void {
    if (e.key === ' ' && this._spaceHeld) {
      this._spaceHeld = false
      if (this.gesture.kind !== 'panning') this._cursor = this.idleCursor()
      this.changed()
    }
  }

  private selectPointerDown(e: PointerInput, world: Vec): void {
    const handle = handleAt(this.handles(), e.point, HANDLE_RADIUS[this.precision()])
    if (handle === 'start' || handle === 'end') {
      const origin = this.selectedShapes()[0]!
      this.gesture = { kind: 'moving-arrow-end', id: origin.id, which: handle, origin }
      this._cursor = 'move'
      return this.changed()
    }
    if (handle) {
      this.gesture = {
        kind: 'resizing',
        handle,
        startWorld: world,
        startFrame: this.selectionFrame()!,
        origins: this.selectedShapes(),
      }
      this._cursor = cursorForHandle(handle)
      return this.changed()
    }

    const hit = this.board.shapeAt(world, this.tolerance())
    if (hit) {
      const wasSelected = this._selection.includes(hit.id)
      if (!wasSelected) this.select(e.shift ? [...this._selection, hit.id] : [hit.id])
      this.gesture = {
        kind: 'pointing-shape',
        startScreen: e.point,
        startWorld: world,
        id: hit.id,
        toggleOnUp: wasSelected && e.shift,
        clearOnClick: false,
        duplicate: e.alt,
      }
      return this.changed()
    }

    const frame = this._selection.length > 1 ? this.selectionFrame() : null
    if (frame && !e.shift && boxContainsPoint(frame, world)) {
      this.gesture = {
        kind: 'pointing-shape',
        startScreen: e.point,
        startWorld: world,
        id: this._selection[0]!,
        toggleOnUp: false,
        clearOnClick: true,
        duplicate: e.alt,
      }
      return this.changed()
    }

    if (!e.shift) this.select([])
    this.gesture = {
      kind: 'pointing-canvas',
      startScreen: e.point,
      startWorld: world,
      additive: e.shift,
    }
    this.changed()
  }

  private createText(world: Vec): void {
    const { color, size } = this._style
    const h = FONT_SIZE[size] * 1.3
    const id = this.board.create({
      type: 'text',
      x: world.x,
      y: world.y - h / 2,
      w: 1,
      h,
      color,
      size,
      text: '',
    })
    this.startEditing(id)
  }

  private duplicateInPlace(): void {
    const text = this.copy()
    if (text) this.insertClipboard(text, { offset: { x: 0, y: 0 } })
  }

  private insertClipboard(text: string, placement: { center: Vec } | { offset: Vec }): boolean {
    const inputs = deserializeShapes(text, placement)
    if (!inputs) return false
    this.history.stopCapturing()
    const ids = this.board.createMany(inputs)
    this.history.stopCapturing()
    this.setTool('select')
    this.select(ids)
    return true
  }

  private flushPen(id: string, absolute: readonly number[]): void {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < absolute.length; i += 2) {
      minX = Math.min(minX, absolute[i]!)
      maxX = Math.max(maxX, absolute[i]!)
      minY = Math.min(minY, absolute[i + 1]!)
      maxY = Math.max(maxY, absolute[i + 1]!)
    }
    const points = absolute.map((v, i) => (i % 2 === 0 ? v - minX : v - minY))
    this.board.update(id, { x: minX, y: minY, w: maxX - minX, h: maxY - minY, points })
  }

  private startPinch(): void {
    if (this.gesture.kind !== 'idle' && this.gesture.kind !== 'pinching') {
      const touches = new Map(this.touches)
      this.cancel()
      for (const [id, p] of touches) this.touches.set(id, p)
    }
    const [a, b] = [...this.touches.values()] as [Vec, Vec]
    this.gesture = {
      kind: 'pinching',
      startDistance: Math.max(1, dist(a, b)),
      startZoom: this._camera.z,
      anchorWorld: this.screenToWorld(mid(a, b)),
    }
    this.changed()
  }

  private updatePinch(): void {
    const g = this.gesture
    if (g.kind !== 'pinching' || this.touches.size < 2) return
    const [a, b] = [...this.touches.values()] as [Vec, Vec]
    const center = mid(a, b)
    const z = Math.min(8, Math.max(0.1, g.startZoom * (dist(a, b) / g.startDistance)))
    this._camera = { x: g.anchorWorld.x - center.x / z, y: g.anchorWorld.y - center.y / z, z }
    this.changed()
  }

  private updateHover(screen: Vec, world: Vec): void {
    let hovered: string | null = null
    let cursor = this.idleCursor()
    if (this._tool === 'select' && !this._spaceHeld) {
      const handle = handleAt(this.handles(), screen, HANDLE_RADIUS[this.precision()])
      if (handle) cursor = cursorForHandle(handle)
      else hovered = this.board.shapeAt(world, this.tolerance())?.id ?? null
      if (hovered) cursor = 'move'
    }
    if (hovered !== this._hovered || cursor !== this._cursor) {
      this._hovered = hovered
      this._cursor = cursor
      this.changed()
    }
  }

  private bindableAt(world: Vec, exclude?: string | null): Shape | undefined {
    return this.board.shapeAt(
      world,
      this.tolerance(),
      (s) => s.type !== 'arrow' && s.type !== 'pen' && s.id !== exclude,
    )
  }

  private frameOf(shape: Shape): Box {
    if (shape.type !== 'arrow') return boxOf(shape)
    const { start, end } = arrowEndpoints(shape, this.board.lookup)
    return boxFromPoints(start, end)
  }

  private idleCursor(): CursorKind {
    if (this._spaceHeld || this._tool === 'hand') return 'grab'
    if (this._tool === 'text') return 'text'
    if (this._tool === 'select') return 'default'
    return 'crosshair'
  }

  private precision(): 'fine' | 'coarse' {
    return this.pointerType === 'touch' ? 'coarse' : 'fine'
  }

  private tolerance(): number {
    return HIT_TOLERANCE[this.precision()] / this._camera.z
  }

  private pastThreshold(a: Vec, b: Vec): boolean {
    return dist(a, b) >= DRAG_THRESHOLD[this.precision()]
  }

  private viewportCenter(): Vec {
    return { x: this._viewport.width / 2, y: this._viewport.height / 2 }
  }

  private zoomBy(factor: number): void {
    this.setCamera(zoomAt(this._camera, this.viewportCenter(), this._camera.z * factor))
  }

  private changed(): void {
    this._version++
    for (const listener of this.listeners) listener()
  }
}

function stylePatch(shape: Shape, patch: Partial<Style>): ShapePatch {
  const out: Record<string, unknown> = {}
  if (patch.color) out.color = patch.color
  if (patch.fill && hasFill(shape)) out.fill = patch.fill
  if (patch.size && 'size' in shape && patch.size !== shape.size) {
    out.size = patch.size
    if (shape.type === 'text') {
      const k = FONT_SIZE[patch.size] / FONT_SIZE[shape.size]
      out.w = shape.w * k
      out.h = shape.h * k
    }
  }
  return out
}

function geometryOf(shape: Shape): ShapePatch {
  switch (shape.type) {
    case 'arrow':
      return {
        x1: shape.x1,
        y1: shape.y1,
        x2: shape.x2,
        y2: shape.y2,
        start: shape.start,
        end: shape.end,
      }
    case 'pen':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h, points: shape.points }
    default:
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
  }
}
