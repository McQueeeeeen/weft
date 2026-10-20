import { describe, expect, it } from 'vitest'
import { wrapLines } from './text-layout.ts'

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
