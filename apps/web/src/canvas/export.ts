import {
  boxExpand,
  boxHeight,
  boxUnionAll,
  boxWidth,
  exportSvg,
  shapeBounds,
  type Editor,
  type Shape,
} from '@weft/core'
import { drawShape } from './draw-shapes.ts'
import { BOARD_FONT, type Theme } from './palette.ts'
import { wrapText } from './text-layout.ts'

const PADDING = 32
const MAX_PNG_SIDE = 8192

function exportedShapes(editor: Editor): Shape[] {
  const ids =
    editor.selection.length > 0 ? [...editor.selection] : editor.board.all().map((s) => s.id)
  return editor.board.sortByPaintOrder(ids).map((id) => editor.board.get(id)!)
}

export function boardToSvg(editor: Editor, theme: Theme): Blob | null {
  const svg = exportSvg(exportedShapes(editor), editor.board.lookup, {
    color: (token, role) => theme.content[token][role],
    background: theme.board,
    fontFamily: BOARD_FONT,
    wrapText,
    padding: PADDING,
  })
  return svg ? new Blob([svg], { type: 'image/svg+xml' }) : null
}

export async function boardToPng(editor: Editor, theme: Theme, scale = 2): Promise<Blob | null> {
  const shapes = exportedShapes(editor)
  const lookup = editor.board.lookup
  const bounds = boxUnionAll(shapes.map((s) => shapeBounds(s, lookup)))
  if (!bounds) return null
  const frame = boxExpand(bounds, PADDING)
  const k = Math.min(scale, MAX_PNG_SIDE / boxWidth(frame), MAX_PNG_SIDE / boxHeight(frame))

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(boxWidth(frame) * k)
  canvas.height = Math.ceil(boxHeight(frame) * k)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = theme.board
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(k, 0, 0, k, -frame.minX * k, -frame.minY * k)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const dc = { ctx, theme, lookup, zoom: k, editingId: null }
  for (const shape of shapes) drawShape(dc, shape)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
