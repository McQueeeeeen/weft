import { boxExpand, boxHeight, boxUnionAll, boxWidth } from '../geometry/box.ts'
import { arrowEndpoints, shapeBounds, type ShapeLookup } from '../model/geometry.ts'
import {
  FONT_SIZE,
  STICKY_FONT_SIZE,
  STROKE_WIDTH,
  type ColorToken,
  type Shape,
} from '../model/shapes.ts'
import { arrowHead, penPathData } from './paths.ts'

export type PaletteRole = 'stroke' | 'tint' | 'sticky' | 'stickyText'

export interface SvgExportOptions {
  readonly color: (token: ColorToken, role: PaletteRole) => string
  /** Null exports with a transparent background. */
  readonly background: string | null
  readonly fontFamily: string
  /** Line breaking is a measuring concern, so the host supplies it. */
  readonly wrapText: (text: string, maxWidth: number, fontSize: number) => string[]
  readonly padding?: number
}

export const STICKY_PADDING = 16
export const LINE_HEIGHT = 1.3

/** Standalone SVG document for `shapes` (given in paint order), or null if there is nothing to export. */
export function exportSvg(
  shapes: readonly Shape[],
  lookup: ShapeLookup,
  options: SvgExportOptions,
): string | null {
  const bounds = boxUnionAll(shapes.map((s) => shapeBounds(s, lookup)))
  if (!bounds) return null
  const frame = boxExpand(bounds, options.padding ?? 32)
  const w = Math.ceil(boxWidth(frame))
  const h = Math.ceil(boxHeight(frame))

  const body = shapes.map((s) => shapeToSvg(s, lookup, options)).join('\n')
  const background = options.background
    ? `<rect x="${frame.minX}" y="${frame.minY}" width="${w}" height="${h}" fill="${attr(options.background)}"/>\n`
    : ''
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${frame.minX} ${frame.minY} ${w} ${h}">`,
    `<g font-family="${attr(options.fontFamily)}" stroke-linecap="round" stroke-linejoin="round">`,
    background + body,
    '</g>',
    '</svg>',
  ].join('\n')
}

function shapeToSvg(shape: Shape, lookup: ShapeLookup, o: SvgExportOptions): string {
  switch (shape.type) {
    case 'rect':
    case 'ellipse': {
      const stroke = o.color(shape.color, 'stroke')
      const fill =
        shape.fill === 'none'
          ? 'none'
          : o.color(shape.color, shape.fill === 'solid' ? 'stroke' : 'tint')
      const common = `fill="${attr(fill)}" stroke="${attr(stroke)}" stroke-width="${STROKE_WIDTH[shape.size]}"`
      if (shape.type === 'rect') {
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="4" ${common}/>`
      }
      return `<ellipse cx="${shape.x + shape.w / 2}" cy="${shape.y + shape.h / 2}" rx="${shape.w / 2}" ry="${shape.h / 2}" ${common}/>`
    }
    case 'sticky': {
      const size = STICKY_FONT_SIZE
      const lines = o.wrapText(shape.text, shape.w - STICKY_PADDING * 2, size)
      const paper = `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="2" fill="${attr(o.color(shape.color, 'sticky'))}"/>`
      return (
        paper +
        textBlock(
          lines,
          shape.x + STICKY_PADDING,
          shape.y + STICKY_PADDING,
          size,
          o.color(shape.color, 'stickyText'),
        )
      )
    }
    case 'text': {
      const size = FONT_SIZE[shape.size]
      const lines = shape.text.split('\n')
      return textBlock(lines, shape.x, shape.y, size, o.color(shape.color, 'stroke'))
    }
    case 'arrow': {
      const { start, end } = arrowEndpoints(shape, lookup)
      const width = STROKE_WIDTH[shape.size]
      const [a, b] = arrowHead(start, end, width)
      const stroke = attr(o.color(shape.color, 'stroke'))
      return (
        `<path d="M${start.x} ${start.y}L${end.x} ${end.y}M${a.x} ${a.y}L${end.x} ${end.y}L${b.x} ${b.y}" ` +
        `fill="none" stroke="${stroke}" stroke-width="${width}"/>`
      )
    }
    case 'pen':
      return `<path d="${penPathData(shape)}" fill="none" stroke="${attr(o.color(shape.color, 'stroke'))}" stroke-width="${STROKE_WIDTH[shape.size]}"/>`
  }
}

function textBlock(
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  fill: string,
): string {
  const lineHeight = size * LINE_HEIGHT
  const tspans = lines
    .map(
      (line, i) => `<tspan x="${x}" y="${y + lineHeight * i + size}">${escapeText(line)}</tspan>`,
    )
    .join('')
  return `<text font-size="${size}" fill="${attr(fill)}" xml:space="preserve">${tspans}</text>`
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const attr = (s: string) => escapeText(s).replace(/"/g, '&quot;')
