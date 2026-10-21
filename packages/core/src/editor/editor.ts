import {
  cameraToFit,
  clampZoom,
  panBy,
  screenToWorld,
  viewportBox,
  zoomAt,
  type Camera,
} from '../camera.ts'
import { boxExpand, boxUnionAll, type Box } from '../geometry/box.ts'
import { dist, mid, type Vec } from '../geometry/vec.ts'
import { History } from '../history.ts'
import type { Board } from '../model/board.ts'
import { translatePatch } from '../model/geometry.ts'
import { FONT_SIZE, hasFill, hasText, type Shape, type ShapePatch } from '../model/shapes.ts'
import type { Presence } from '../presence.ts'
import { deserializeShapes, serializeShapes } from './clipboard.ts'
import {
  HANDLE_RADIUS,
  IDLE,
  NO_OVERLAY,
  gesture,
  panning,
  selectDown,
  tolerance,
  type Gesture,
  type Overlay,
} from './gestures.ts'
import { cursorForHandle, handleAt, selectionHandles, type HandlePosition } from './handles.ts'
import { frameOf } from './queries.ts'
import { runShortcut } from './shortcuts.ts'
import type { Guide } from './snap.ts'
import { createText, startTool, type ToolHost } from './tools.ts'
import {
  DEFAULT_STYLE,
  type CursorKind,
  type KeyInput,
  type PointerInput,
  type Style,
  type ToolId,
  type WheelInput,
} from './types.ts'

interface Pinch {
  readonly startDistance: number
  readonly startZoom: number
  readonly anchorWorld: Vec
}

const PINCHING = gesture('pinching')
const ZOOM_STEP = 1.25
const PASTE_OFFSET = 24

export interface EditorOptions {
  readonly board: Board
  readonly presence?: Presence | null
  readonly now?: () => number
  readonly readOnly?: boolean
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
  private _overlay: Overlay = NO_OVERLAY
  private _style: Style = DEFAULT_STYLE
  private _spaceHeld = false
  private _cursor: CursorKind = 'default'
  private _version = 0

  private gesture: Gesture = IDLE
  private pinch: Pinch | null = null
  private readonly host: ToolHost
  private readonly touches = new Map<number, Vec>()
  private pointerType: PointerInput['pointerType'] = 'mouse'
  private pasteCount = 0
  private readonly now: () => number
  private readonly listeners = new Set<() => void>()
  private readonly disposers: (() => void)[] = []

  readonly readOnly: boolean

  constructor({ board, presence = null, now = Date.now, readOnly = false }: EditorOptions) {
    this.readOnly = readOnly
    this.board = board
    this.presence = presence
    this.now = now
    this.history = new History(board, {
      get: () => this._selection,
      restore: (ids) => this.select(ids),
    })
    this.host = Editor.createHost(this)
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
    return this._overlay.marquee
  }
  get bindTarget(): string | null {
    return this._overlay.bindTarget
  }
  get guides(): readonly Guide[] {
    return this._overlay.guides
  }
  get cursor(): CursorKind {
    return this._cursor
  }
  get isInteracting(): boolean {
    return this.gesture !== IDLE
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
      route: first.type === 'arrow' ? first.route : this._style.route,
    }
  }

  selectionFrame(): Box | null {
    return boxUnionAll(this.selectedShapes().map((s) => frameOf(s, this.board.lookup)))
  }

  handles(): HandlePosition[] {
    if (this.readOnly || this._tool !== 'select' || this._editing !== null) return []
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
    if (this._tool === tool || (this.readOnly && tool !== 'select' && tool !== 'hand')) return
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
    if (this.readOnly) return
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
    if (this.readOnly || this._selection.length === 0) return
    this.history.stopCapturing()
    this.board.delete(this._selection)
    this.history.stopCapturing()
  }

  duplicateSelected(): void {
    if (this.readOnly) return
    const text = this.copy()
    if (text) this.insertClipboard(text, { offset: { x: PASTE_OFFSET, y: PASTE_OFFSET } })
  }

  bringToFront(): void {
    if (this.readOnly) return
    this.history.stopCapturing()
    this.board.bringToFront(this._selection)
  }

  sendToBack(): void {
    if (this.readOnly) return
    this.history.stopCapturing()
    this.board.sendToBack(this._selection)
  }

  nudge(dx: number, dy: number): void {
    const selected = this.selectedShapes()
    if (this.readOnly || selected.length === 0) return
    this.board.transact(() => {
      for (const shape of selected) this.board.update(shape.id, translatePatch(shape, dx, dy))
    })
  }

  undo(): void {
    if (this.readOnly) return
    this.cancel()
    this.stopEditing()
    this.history.undo()
  }

  redo(): void {
    if (this.readOnly) return
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
    if (this.readOnly || !shape || !(hasText(shape) || shape.type === 'frame')) return
    this.history.stopCapturing()
    this._tool = 'select'
    this._editing = id
    this.select([id])
    this.changed()
  }

  updateText(id: string, text: string, size?: { w: number; h: number }): void {
    if (this.readOnly) return
    if (this.board.get(id)?.type === 'frame') return this.board.update(id, { title: text })
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
    if (this.readOnly) return false
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
      return this.host.begin(panning(this.host, e.point))
    }
    if (e.button !== 0) return

    this.history.hold()
    this.host.begin(
      this._tool === 'select'
        ? selectDown(this.host, e, world)
        : startTool(this.host, this._tool, world),
    )
  }

  pointerMove(e: PointerInput): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, e.point)
      if (this.pinch) return this.updatePinch(this.pinch)
    }
    const world = this.screenToWorld(e.point)
    this.presence?.setCursor(world)
    if (this.gesture === IDLE) this.updateHover(e.point, world)
    else this.gesture.move(e, world)
  }

  pointerUp(e: PointerInput): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId)
      if (this.pinch) {
        if (this.touches.size === 0) {
          this.pinch = null
          this.gesture = IDLE
        }
        return
      }
    }
    const g = this.gesture
    this.gesture = IDLE
    this._overlay = NO_OVERLAY
    g.up(e)
    this.history.stopCapturing()
    this.changed()
  }

  pointerLeave(): void {
    this.presence?.setCursor(null)
    if (this._hovered !== null) {
      this._hovered = null
      this.changed()
    }
  }

  doubleClick(e: PointerInput): void {
    if (this.readOnly || this._tool !== 'select') return
    const world = this.screenToWorld(e.point)
    const hit = this.board.shapeAt(world, tolerance(this.host))
    if (hit && (hasText(hit) || hit.type === 'frame')) return this.startEditing(hit.id)
    if (!hit) createText(this.host, world)
  }

  cancel(): void {
    const g = this.gesture
    this.gesture = IDLE
    this.pinch = null
    this._overlay = NO_OVERLAY
    this.touches.clear()
    g.cancel()
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
      if (key !== 'Escape') return false
      this.stopEditing()
      return true
    }
    if (key === ' ' && !e.mod) {
      if (!this._spaceHeld) {
        this._spaceHeld = true
        this._cursor = 'grab'
        this.changed()
      }
      return true
    }
    return runShortcut(this, e, key)
  }

  keyUp(e: KeyInput): void {
    if (e.key === ' ' && this._spaceHeld) {
      this._spaceHeld = false
      if (this.gesture.kind !== 'panning') this._cursor = this.idleCursor()
      this.changed()
    }
  }

  private static createHost(editor: Editor): ToolHost {
    return {
      board: editor.board,
      history: editor.history,
      get camera() {
        return editor._camera
      },
      get view() {
        return viewportBox(editor._camera, editor._viewport.width, editor._viewport.height)
      },
      get selection() {
        return editor._selection
      },
      get readOnly() {
        return editor.readOnly
      },
      get precision() {
        return editor.pointerType === 'touch' ? 'coarse' : 'fine'
      },
      get style() {
        return editor._style
      },
      now: () => editor.now(),
      begin: (gesture) => {
        editor.gesture = gesture
        editor.changed()
      },
      pan: (dx, dy) => editor.setCamera(panBy(editor._camera, dx, dy)),
      select: (ids) => editor.select(ids),
      selectedShapes: () => editor.selectedShapes(),
      selectionFrame: () => editor.selectionFrame(),
      handles: () => editor.handles(),
      overlay: (patch) => {
        editor._overlay = { ...editor._overlay, ...patch }
        editor.changed()
      },
      cursor: (kind) => {
        editor._cursor = kind ?? editor.idleCursor()
        editor.changed()
      },
      finishTool: () => {
        editor._tool = 'select'
        editor._cursor = 'default'
      },
      duplicateInPlace: () => {
        const text = editor.copy()
        if (text) editor.insertClipboard(text, { offset: { x: 0, y: 0 } })
      },
      startEditing: (id) => editor.startEditing(id),
    }
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

  private startPinch(): void {
    if (this.gesture !== IDLE) {
      const touches = new Map(this.touches)
      this.cancel()
      for (const [id, p] of touches) this.touches.set(id, p)
    }
    const [a, b] = [...this.touches.values()] as [Vec, Vec]
    this.gesture = PINCHING
    this.pinch = {
      startDistance: Math.max(1, dist(a, b)),
      startZoom: this._camera.z,
      anchorWorld: this.screenToWorld(mid(a, b)),
    }
    this.changed()
  }

  private updatePinch(pinch: Pinch): void {
    if (this.touches.size < 2) return
    const [a, b] = [...this.touches.values()] as [Vec, Vec]
    const center = mid(a, b)
    const z = clampZoom(pinch.startZoom * (dist(a, b) / pinch.startDistance))
    this._camera = {
      x: pinch.anchorWorld.x - center.x / z,
      y: pinch.anchorWorld.y - center.y / z,
      z,
    }
    this.changed()
  }

  private updateHover(screen: Vec, world: Vec): void {
    let hovered: string | null = null
    let cursor = this.idleCursor()
    if (this._tool === 'select' && !this._spaceHeld) {
      const handle = handleAt(this.handles(), screen, HANDLE_RADIUS[this.host.precision])
      if (handle) cursor = cursorForHandle(handle)
      else hovered = this.board.shapeAt(world, tolerance(this.host))?.id ?? null
      if (hovered) cursor = 'move'
    }
    if (hovered !== this._hovered || cursor !== this._cursor) {
      this._hovered = hovered
      this._cursor = cursor
      this.changed()
    }
  }

  private idleCursor(): CursorKind {
    if (this._spaceHeld || this._tool === 'hand') return 'grab'
    if (this._tool === 'text') return 'text'
    if (this._tool === 'select') return 'default'
    return 'crosshair'
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
  if (patch.route && shape.type === 'arrow') out.route = patch.route
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
