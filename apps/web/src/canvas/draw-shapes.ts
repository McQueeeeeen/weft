import {
  FONT_SIZE,
  LINE_HEIGHT,
  STICKY_FONT_SIZE,
  STICKY_PADDING,
  STROKE_WIDTH,
  arrowEndpoints,
  arrowHead,
  penPathData,
  type Shape,
  type ShapeLookup,
} from '@weft/core'
import type { Theme } from './palette.ts'
import { fontFor, wrapText } from './text-layout.ts'

export interface DrawContext {
  readonly ctx: CanvasRenderingContext2D
  readonly theme: Theme
  readonly lookup: ShapeLookup
  readonly zoom: number
  readonly editingId: string | null
}

const MIN_READABLE_PX = 4

const penPaths = new WeakMap<Shape, Path2D>()

export function drawShape(dc: DrawContext, shape: Shape): void {
  const { ctx, theme } = dc
  const colors = theme.content[shape.color]

  switch (shape.type) {
    case 'rect':
    case 'ellipse': {
      ctx.beginPath()
      if (shape.type === 'rect') ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 4)
      else
        ctx.ellipse(
          shape.x + shape.w / 2,
          shape.y + shape.h / 2,
          shape.w / 2,
          shape.h / 2,
          0,
          0,
          Math.PI * 2,
        )
      if (shape.fill !== 'none') {
        ctx.fillStyle = shape.fill === 'solid' ? colors.stroke : colors.tint
        ctx.fill()
      }
      ctx.lineWidth = STROKE_WIDTH[shape.size]
      ctx.strokeStyle = colors.stroke
      ctx.stroke()
      return
    }

    case 'sticky': {
      ctx.save()
      if (dc.zoom > 0.4) {
        ctx.shadowColor = theme.name === 'light' ? 'rgba(20, 22, 26, 0.16)' : 'rgba(0, 0, 0, 0.5)'
        ctx.shadowBlur = 14 * dc.zoom
        ctx.shadowOffsetY = 4 * dc.zoom
      }
      ctx.fillStyle = colors.sticky
      ctx.beginPath()
      ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 3)
      ctx.fill()
      ctx.restore()
      if (shape.id !== dc.editingId && shape.text) {
        const lines = wrapText(shape.text, shape.w - STICKY_PADDING * 2, STICKY_FONT_SIZE)
        drawLines(
          dc,
          lines,
          shape.x + STICKY_PADDING,
          shape.y + STICKY_PADDING,
          STICKY_FONT_SIZE,
          colors.stickyText,
          shape.h - STICKY_PADDING * 2,
        )
      }
      return
    }

    case 'text': {
      if (shape.id === dc.editingId) return
      drawLines(
        dc,
        shape.text.split('\n'),
        shape.x,
        shape.y,
        FONT_SIZE[shape.size],
        colors.stroke,
        Infinity,
      )
      return
    }

    case 'arrow': {
      const { start, end } = arrowEndpoints(shape, dc.lookup)
      const width = STROKE_WIDTH[shape.size]
      const [a, b] = arrowHead(start, end, width)
      ctx.lineWidth = width
      ctx.strokeStyle = colors.stroke
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(end.x, end.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      return
    }

    case 'pen': {
      let path = penPaths.get(shape)
      if (!path) penPaths.set(shape, (path = new Path2D(penPathData(shape))))
      ctx.lineWidth = STROKE_WIDTH[shape.size]
      ctx.strokeStyle = colors.stroke
      ctx.stroke(path)
      return
    }
  }
}

function drawLines(
  dc: DrawContext,
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  color: string,
  maxHeight: number,
): void {
  const { ctx } = dc
  const lineHeight = size * LINE_HEIGHT
  const visible = Math.max(1, Math.floor(maxHeight / lineHeight))
  const shown = lines.slice(0, visible)

  if (size * dc.zoom < MIN_READABLE_PX) {
    ctx.fillStyle = color
    ctx.globalAlpha = 0.35
    shown.forEach((line, i) => {
      if (line.length === 0) return
      const w = Math.min(line.length * size * 0.5, 4000)
      ctx.fillRect(x, y + i * lineHeight + size * 0.3, w, size * 0.5)
    })
    ctx.globalAlpha = 1
    return
  }

  ctx.font = fontFor(size)
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  shown.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight + size))
}
