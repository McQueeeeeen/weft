import { describe, expect, it } from 'vitest'
import { caretSpot, wrapLines, wrapSpans } from './text-layout.ts'

const measure = (s: string) => s.length * 10

describe('wrapLines', () => {
  it('keeps short text on one line', () => {
    expect(wrapLines('hello world', 200, measure)).toEqual(['hello world'])
  })

  it('wraps at word boundaries', () => {
    expect(wrapLines('the quick brown fox', 100, measure)).toEqual(['the quick', 'brown fox'])
  })

  it('honors explicit newlines, including empty lines', () => {
    expect(wrapLines('a\n\nb', 100, measure)).toEqual(['a', '', 'b'])
  })

  it('breaks words longer than a line', () => {
    expect(wrapLines('abcdefghijkl', 50, measure)).toEqual(['abcde', 'fghij', 'kl'])
  })

  it('returns one empty line for empty text', () => {
    expect(wrapLines('', 100, measure)).toEqual([''])
  })
})

describe('caretSpot', () => {
  it('maps a text index to the wrapped line and column it lands on', () => {
    const spans = wrapSpans('the quick brown fox\n\nend', 100, measure)
    expect(spans.map((s) => s.start)).toEqual([0, 10, 20, 21])
    expect(caretSpot(spans, 4)).toEqual({ line: 0, column: 4 })
    expect(caretSpot(spans, 9)).toEqual({ line: 0, column: 9 })
    expect(caretSpot(spans, 12)).toEqual({ line: 1, column: 2 })
    expect(caretSpot(spans, 20)).toEqual({ line: 2, column: 0 })
    expect(caretSpot(spans, 24)).toEqual({ line: 3, column: 3 })
  })
})
