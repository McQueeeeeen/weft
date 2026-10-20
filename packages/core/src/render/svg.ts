import { boxExpand, boxHeight, boxUnionAll, boxWidth } from '../geometry/box.ts'
import { arrowPoints, shapeBounds, type ShapeLookup } from '../model/geometry.ts'
import {
  FONT_SIZE,
  FRAME_TITLE_GAP,
  FRAME_TITLE_SIZE,
  STICKY_FONT_SIZE,
  STROKE_WIDTH,
  type ColorToken,
  type Shape,
} from '../model/shapes.ts'
import { arrowHead, arrowPathData, penPathData } from './paths.ts'

export type PaletteRole = 'stroke' | 'tint' | 'sticky' | 'stickyText'

export interface SvgExportOptions {
  readonly color: (token: ColorToken, role: PaletteRole) => string
  readonly background: string | null
  readonly fontFamily: string
  readonly wrapText: (text: string, maxWidth: number, fontSize: number) => string[]
  readonly padding?: number
  readonly imageHref?: (src: string) => string
}

export const STICKY_PADDING = 16
export const LINE_HEIGHT = 1.3

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
      const points = arrowPoints(shape, lookup)
      const end = points[points.length - 1]!
      const width = STROKE_WIDTH[shape.size]
      const [a, b] = arrowHead(points[points.length - 2]!, end, width)
      const stroke = attr(o.color(shape.color, 'stroke'))
      return (
        `<path d="${arrowPathData(points)}M${a.x} ${a.y}L${end.x} ${end.y}L${b.x} ${b.y}" ` +
        `fill="none" stroke="${stroke}" stroke-width="${width}"/>`
      )
    }
    case 'pen':
      return `<path d="${penPathData(shape)}" fill="none" stroke="${attr(o.color(shape.color, 'stroke'))}" stroke-width="${STROKE_WIDTH[shape.size]}"/>`
    case 'image': {
      const href = attr(o.imageHref ? o.imageHref(shape.src) : shape.src)
      return `<image href="${href}" x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" preserveAspectRatio="none"/>`
    }
    case 'frame': {
      const box = `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="6" fill="none" stroke="${attr(o.color(shape.color, 'stroke'))}" stroke-width="1"/>`
      const top = shape.y - FRAME_TITLE_GAP - FRAME_TITLE_SIZE * LINE_HEIGHT
      return (
        box +
        textBlock([shape.title], shape.x, top, FRAME_TITLE_SIZE, o.color(shape.color, 'stroke'))
      )
    }
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
