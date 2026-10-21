import {
  FONT_SIZE,
  LINE_HEIGHT,
  STICKY_FONT_SIZE,
  STICKY_PADDING,
  worldToScreen,
  type Editor,
  type Peer,
  type Shape,
} from '@weft/core'
import { thread, withAlpha } from './palette.ts'
import { caretSpot, measureWidth, wrapTextSpans, type Span } from './text-layout.ts'

interface Layout {
  readonly spans: Span[]
  readonly x: number
  readonly y: number
  readonly size: number
}

function layoutOf(shape: Shape): Layout | null {
  if (shape.type === 'sticky') {
    return {
      spans: wrapTextSpans(shape.text, shape.w - STICKY_PADDING * 2, STICKY_FONT_SIZE),
      x: shape.x + STICKY_PADDING,
      y: shape.y + STICKY_PADDING,
      size: STICKY_FONT_SIZE,
    }
  }
  if (shape.type !== 'text') return null
  let start = 0
  const spans = shape.text.split('\n').map((text) => {
    const span = { text, start }
    start += text.length + 1
    return span
  })
  return { spans, x: shape.x, y: shape.y, size: FONT_SIZE[shape.size] }
}

export function drawPeerCarets(
  ctx: CanvasRenderingContext2D,
  editor: Editor,
  peers: readonly Peer[],
): void {
  const { board, camera } = editor
  for (const peer of peers) {
    const caret = peer.caret
    const shape = caret && board.get(caret.id)
    const layout = shape && layoutOf(shape)
    if (!caret || !layout) continue
    const anchor = board.absoluteCaret(caret.id, caret.anchor)
    const head = board.absoluteCaret(caret.id, caret.head)
    if (anchor === null || head === null) continue

    const { spans, x, y, size } = layout
    const lineHeight = size * LINE_HEIGHT
    const at = (line: number, column: number) =>
      worldToScreen(camera, {
        x: x + measureWidth(spans[line]!.text.slice(0, column), size),
        y: y + line * lineHeight,
      })
    const color = thread(peer.user.color)
    const from = caretSpot(spans, Math.min(anchor, head))
    const to = caretSpot(spans, Math.max(anchor, head))

    ctx.fillStyle = withAlpha(color.fill, 0.25)
    for (let line = from.line; anchor !== head && line <= to.line; line++) {
      const a = at(line, line === from.line ? from.column : 0)
      const b = at(line, line === to.line ? to.column : spans[line]!.text.length)
      ctx.fillRect(a.x, a.y, Math.max(2, b.x - a.x), lineHeight * camera.z)
    }

    const end = caretSpot(spans, head)
    const p = at(end.line, end.column)
    ctx.fillStyle = color.fill
    ctx.fillRect(p.x - 1, p.y, 2, lineHeight * camera.z)
    ctx.fillRect(p.x - 3, p.y - 3, 6, 4)
  }
}
