export interface TextEdit {
  readonly start: number
  readonly remove: number
  readonly insert: string
}

export function textDiff(prev: string, next: string): TextEdit {
  const max = Math.min(prev.length, next.length)
  let start = 0
  while (start < max && prev[start] === next[start]) start++
  let end = 0
  while (end < max - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++
  return { start, remove: prev.length - start - end, insert: next.slice(start, next.length - end) }
}

export function shiftCaret(prev: string, next: string, caret: number): number {
  const { start, remove, insert } = textDiff(prev, next)
  if (caret <= start) return caret
  if (caret >= start + remove) return caret - remove + insert.length
  return start + insert.length
}
