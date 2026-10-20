import { COLORS, FILLS, SIZES, type Shape } from './shapes.ts'

export function parseShape(id: string, raw: unknown): Shape | null {
  if (!isRecord(raw)) return null
  const index = raw.index
  const color = raw.color
  if (typeof index !== 'string' || index.length === 0) return null
  if (!isOneOf(color, COLORS)) return null
  const base = { id, index, color }

  switch (raw.type) {
    case 'rect':
    case 'ellipse': {
      const box = parseBox(raw)
      if (!box || !isOneOf(raw.fill, FILLS) || !isOneOf(raw.size, SIZES)) return null
      return { ...base, ...box, type: raw.type, fill: raw.fill, size: raw.size }
    }
    case 'sticky': {
      const box = parseBox(raw)
      if (!box || typeof raw.text !== 'string') return null
      return { ...base, ...box, type: 'sticky', text: raw.text }
    }
    case 'text': {
      const box = parseBox(raw)
      if (!box || typeof raw.text !== 'string' || !isOneOf(raw.size, SIZES)) return null
      return { ...base, ...box, type: 'text', text: raw.text, size: raw.size }
    }
    case 'arrow': {
      const { x1, y1, x2, y2, start, end, size } = raw
      if (!isFiniteNumber(x1) || !isFiniteNumber(y1)) return null
      if (!isFiniteNumber(x2) || !isFiniteNumber(y2)) return null
      if (!isBinding(start) || !isBinding(end) || !isOneOf(size, SIZES)) return null
      return { ...base, type: 'arrow', x1, y1, x2, y2, start, end, size }
    }
    case 'pen': {
      const box = parseBox(raw)
      const points = raw.points
      if (!box || !isOneOf(raw.size, SIZES)) return null
      if (!Array.isArray(points) || points.length % 2 !== 0 || !points.every(isFiniteNumber)) {
        return null
      }
      return { ...base, ...box, type: 'pen', points, size: raw.size }
    }
    default:
      return null
  }
}

function parseBox(raw: Record<string, unknown>) {
  const { x, y, w, h } = raw
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  if (!isFiniteNumber(w) || !isFiniteNumber(h) || w < 0 || h < 0) return null
  return { x, y, w, h }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isBinding = (v: unknown): v is string | null => v === null || typeof v === 'string'

const isOneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v)
