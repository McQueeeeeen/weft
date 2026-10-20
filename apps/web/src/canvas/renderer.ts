import {
  boxFromPoints,
  type Box,
  type Editor,
  type Peer,
  type Shape,
  type Vec,
  arrowEndpoints,
  boxOf,
  worldToScreen,
} from '@weft/core'
import { drawShape } from './draw-shapes.ts'
import { presenceColor, type Theme } from './palette.ts'

const GRID_STEP = 24
const MIN_GRID_PX = 14
const CURSOR_EASE = 0.35

export interface RenderStats {
  fps: number
  frameMs: number
  visible: number
}

interface CursorTrack {
  x: number
  y: number
  tx: number
  ty: number
}

export class Renderer {
  readonly stats: RenderStats = { fps: 0, frameMs: 0, visible: 0 }

  private readonly ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1
  private frame: number | null = null
  private theme: Theme
  private readonly cursors = new Map<number, CursorTrack>()
  private gridTile: { key: string; pattern: CanvasPattern } | null = null
  private frameTimes: number[] = []
  private readonly unsubscribe: (() => void)[] = []

  private readonly canvas: HTMLCanvasElement
  private readonly editor: Editor
  private readonly reducedMotion: () => boolean

  constructor(
    canvas: HTMLCanvasElement,
    editor: Editor,
    theme: Theme,
    reducedMotion: () => boolean,
  ) {
    this.canvas = canvas
    this.editor = editor
    this.theme = theme
    this.reducedMotion = reducedMotion
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.unsubscribe.push(editor.subscribe(this.invalidate))
    if (editor.presence) this.unsubscribe.push(editor.presence.subscribe(this.invalidate))
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.gridTile = null
    this.invalidate()
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width
    this.height = height
    this.dpr = dpr
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.gridTile = null
    this.draw()
  }

  readonly invalidate = () => {
    this.frame ??= requestAnimationFrame(() => {
      this.frame = null
      this.draw()
    })
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    for (const off of this.unsubscribe) off()
  }

  private draw(): void {
    const started = performance.now()
    const { ctx, editor, theme, dpr } = this
    const cam = editor.camera

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = theme.paper
    ctx.fillRect(0, 0, this.width, this.height)
    this.drawGrid()

    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const shapes = editor.visibleShapes()
    const dc = { ctx, theme, lookup: editor.board.lookup, zoom: cam.z, editingId: editor.editingId }
    for (const shape of shapes) drawShape(dc, shape)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const peers = editor.presence?.peers() ?? []
    this.drawPeerSelections(peers)
    this.drawOwnSelection()
    const moving = this.drawPeerCursors(peers)

    this.recordFrame(started, shapes.length)
    if (moving) this.invalidate()
  }

  private drawGrid(): void {
    const { ctx, editor } = this
    const cam = editor.camera
    let step = GRID_STEP * cam.z
    while (step < MIN_GRID_PX) step *= 4
    const size = Math.round(step * this.dpr * 100) / 100
    const key = `${size}|${this.theme.name}`
    if (this.gridTile?.key !== key) {
      const tile = document.createElement('canvas')
      const px = Math.max(1, Math.round(size))
      tile.width = px
      tile.height = px
      const t = tile.getContext('2d')!
      t.fillStyle = this.theme.dot
      const dot = Math.max(1, Math.round(1.5 * this.dpr))
      t.fillRect(0, 0, dot, dot)
      this.gridTile = { key, pattern: ctx.createPattern(tile, 'repeat')! }
    }
    const offsetX = (-cam.x * cam.z * this.dpr) % size
    const offsetY = (-cam.y * cam.z * this.dpr) % size
    const pattern = this.gridTile.pattern
    pattern.setTransform(
      new DOMMatrix([size / Math.round(size), 0, 0, size / Math.round(size), offsetX, offsetY]),
    )
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private drawOwnSelection(): void {
    const { ctx, editor, theme } = this
    const accent = theme.accent

    const hovered = editor.hovered
    if (hovered && !editor.selection.includes(hovered)) {
      const shape = editor.board.get(hovered)
      if (shape) this.outlineShape(shape, accent, 1)
    }

    const bindTarget = editor.bindTarget
    if (bindTarget) {
      const shape = editor.board.get(bindTarget)
      if (shape) this.outlineShape(shape, accent, 2.5)
    }

    const selected = editor.selectedShapes()
    if (selected.length > 1) for (const shape of selected) this.outlineShape(shape, accent, 1)

    const frame = editor.selectionFrame()
    const onlyArrow = selected.length === 1 && selected[0]!.type === 'arrow'
    if (frame && !onlyArrow && editor.editingId === null) {
      const box = this.toScreen(frame)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY)
    }

    for (const { handle, point } of editor.handles()) {
      ctx.beginPath()
      if (handle === 'start' || handle === 'end') ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
      else ctx.rect(point.x - 4.5, point.y - 4.5, 9, 9)
      ctx.fillStyle = theme.name === 'light' ? '#FFFFFF' : '#17181A'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = accent
      ctx.stroke()
    }

    const marquee = editor.marquee
    if (marquee) {
      const box = this.toScreen(marquee)
      ctx.fillStyle = theme.accentWash
      ctx.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1
      ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY)
    }
  }

  private drawPeerSelections(peers: readonly Peer[]): void {
    for (const peer of peers) {
      if (peer.selection.length === 0) continue
      const color = presenceColor(peer.user.color)
      let top: Vec | null = null
      for (const id of peer.selection) {
        const shape = this.editor.board.get(id)
        if (!shape) continue
        const box = this.outlineShape(shape, color.fill, 2)
        if (!top || box.minY < top.y) top = { x: box.minX, y: box.minY }
      }
      if (top) this.drawTag(peer.user.name, top.x, top.y - 22, color)
    }
  }

  private drawPeerCursors(peers: readonly Peer[]): boolean {
    const { ctx } = this
    const seen = new Set<number>()
    let moving = false
    const instant = this.reducedMotion()

    for (const peer of peers) {
      if (!peer.cursor) continue
      seen.add(peer.clientId)
      let track = this.cursors.get(peer.clientId)
      if (!track) {
        track = { x: peer.cursor.x, y: peer.cursor.y, tx: peer.cursor.x, ty: peer.cursor.y }
        this.cursors.set(peer.clientId, track)
      }
      track.tx = peer.cursor.x
      track.ty = peer.cursor.y
      const gap = Math.hypot(track.tx - track.x, track.ty - track.y) * this.editor.camera.z
      if (instant || gap < 0.5 || gap > 2000) {
        track.x = track.tx
        track.y = track.ty
      } else {
        track.x += (track.tx - track.x) * CURSOR_EASE
        track.y += (track.ty - track.y) * CURSOR_EASE
        moving = true
      }

      const p = worldToScreen(this.editor.camera, track)
      const color = presenceColor(peer.user.color)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, 17)
      ctx.lineTo(4.5, 13)
      ctx.lineTo(8, 20)
      ctx.lineTo(10.5, 19)
      ctx.lineTo(7, 12)
      ctx.lineTo(12.5, 12)
      ctx.closePath()
      ctx.fillStyle = color.fill
      ctx.fill()
      ctx.lineWidth = 1.25
      ctx.strokeStyle = '#FFFFFF'
      ctx.stroke()
      ctx.restore()
      this.drawTag(peer.user.name, p.x + 12, p.y + 20, color)
    }

    for (const id of this.cursors.keys()) if (!seen.has(id)) this.cursors.delete(id)
    return moving
  }

  private drawTag(text: string, x: number, y: number, color: { fill: string; text: string }): void {
    const { ctx } = this
    ctx.font = '500 12px "IBM Plex Sans", system-ui, sans-serif'
    const w = ctx.measureText(text).width + 12
    ctx.fillStyle = color.fill
    ctx.beginPath()
    ctx.roundRect(x, y, w, 20, 4)
    ctx.fill()
    ctx.fillStyle = color.text
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + 6, y + 10.5)
    ctx.textBaseline = 'alphabetic'
  }

  private outlineShape(shape: Shape, color: string, width: number): Box {
    const { ctx } = this
    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (shape.type === 'arrow') {
      const { start, end } = arrowEndpoints(shape, this.editor.board.lookup)
      const a = worldToScreen(this.editor.camera, start)
      const b = worldToScreen(this.editor.camera, end)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.globalAlpha = 0.5
      ctx.lineWidth = width + 4
      ctx.stroke()
      ctx.globalAlpha = 1
      return boxFromPoints(a, b)
    }
    const box = this.toScreen(boxOf(shape))
    const pad = 3
    ctx.strokeRect(
      box.minX - pad,
      box.minY - pad,
      box.maxX - box.minX + pad * 2,
      box.maxY - box.minY + pad * 2,
    )
    return {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    }
  }

  private toScreen(box: Box): Box {
    const cam = this.editor.camera
    const a = worldToScreen(cam, { x: box.minX, y: box.minY })
    const b = worldToScreen(cam, { x: box.maxX, y: box.maxY })
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }
  }

  private recordFrame(started: number, visible: number): void {
    const now = performance.now()
    this.stats.frameMs = now - started
    this.stats.visible = visible
    this.frameTimes.push(now)
    while (this.frameTimes.length > 0 && now - this.frameTimes[0]! > 1000) this.frameTimes.shift()
    this.stats.fps = this.frameTimes.length
  }
}
