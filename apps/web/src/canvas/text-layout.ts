import { BOARD_FONT } from './palette.ts'

const CACHE_LIMIT = 2000
const cache = new Map<string, string[]>()
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

export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const token of paragraph.split(/(\s+)/)) {
      if (token === '') continue
      const candidate = line + token
      if (measure(candidate) <= maxWidth) {
        line = candidate
        continue
      }
      if (line.trim() !== '') lines.push(line.trimEnd())
      line = token.trimStart()
      while (line.length > 1 && measure(line) > maxWidth) {
        let cut = 1
        while (cut < line.length && measure(line.slice(0, cut + 1)) <= maxWidth) cut++
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

export function wrapText(text: string, maxWidth: number, size: number): string[] {
  const key = `${size}|${Math.round(maxWidth)}|${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const ctx = context()
  ctx.font = fontFor(size)
  const lines = wrapLines(text, maxWidth, (s) => ctx.measureText(s).width)
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  cache.set(key, lines)
  return lines
}

export function measureTextBlock(text: string, size: number, lineHeight: number) {
  const lines = text.split('\n')
  const w = Math.max(size * 0.5, ...lines.map((l) => measureWidth(l, size)))
  return { w: Math.ceil(w) + 2, h: Math.ceil(lines.length * size * lineHeight) }
}
