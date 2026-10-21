import { BOARD_FONT } from './palette.ts'

const CACHE_LIMIT = 2000
let measureContext: CanvasRenderingContext2D | null = null

function context(): CanvasRenderingContext2D {
  measureContext ??= document.createElement('canvas').getContext('2d')!
  return measureContext
}

export const fontFor = (size: number) => `400 ${size}px ${BOARD_FONT}`

export function measureWidth(text: string, size: number): number {
  const ctx = context()
  ctx.font = fontFor(size)
  return ctx.measureText(text).width
}

export interface Span {
  readonly text: string
  readonly start: number
}

export function wrapSpans(text: string, maxWidth: number, measure: (s: string) => number): Span[] {
  const spans: Span[] = []
  let offset = 0
  for (const paragraph of text.split('\n')) {
    let line = ''
    let start = offset
    let pos = offset
    for (const token of paragraph.split(/(\s+)/)) {
      if (token === '') continue
      const at = pos
      pos += token.length
      const candidate = line + token
      if (measure(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim() !== '') spans.push({ text: line.trimEnd(), start })
      line = token.trimStart()
      start = at + token.length - line.length
      while (line.length > 1 && measure(line) > maxWidth) {
        let cut = 1
        while (cut < line.length && measure(line.slice(0, cut + 1)) <= maxWidth) cut++
        spans.push({ text: line.slice(0, cut), start })
        line = line.slice(cut)
        start += cut
      }
    }
    spans.push({ text: line.trimEnd(), start })
    offset += paragraph.length + 1
  }
  return spans
}

export const wrapLines = (text: string, maxWidth: number, measure: (s: string) => number) =>
  wrapSpans(text, maxWidth, measure).map((span) => span.text)

export function caretSpot(spans: readonly Span[], index: number): { line: number; column: number } {
  let line = 0
  while (line + 1 < spans.length && spans[line + 1]!.start <= index) line++
  const span = spans[line]!
  return { line, column: Math.max(0, Math.min(span.text.length, index - span.start)) }
}

const cache = new Map<string, Span[]>()

export function wrapTextSpans(text: string, maxWidth: number, size: number): Span[] {
  const key = `${size}|${Math.round(maxWidth)}|${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const ctx = context()
  ctx.font = fontFor(size)
  const spans = wrapSpans(text, maxWidth, (s) => ctx.measureText(s).width)
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  cache.set(key, spans)
  return spans
}

export const wrapText = (text: string, maxWidth: number, size: number) =>
  wrapTextSpans(text, maxWidth, size).map((span) => span.text)

export function measureTextBlock(text: string, size: number, lineHeight: number) {
  const lines = text.split('\n')
  const w = Math.max(size * 0.5, ...lines.map((l) => measureWidth(l, size)))
  return { w: Math.ceil(w) + 2, h: Math.ceil(lines.length * size * lineHeight) }
}
