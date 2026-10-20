import { describe, expect, it } from 'vitest'
import { shiftCaret, textDiff } from './text.ts'

describe('textDiff', () => {
  it('finds the single changed span', () => {
    expect(textDiff('Ship on Friday', 'Ship it on Friday')).toEqual({
      start: 5,
      remove: 0,
      insert: 'it ',
    })
    expect(textDiff('abcdef', 'abXef')).toEqual({ start: 2, remove: 2, insert: 'X' })
    expect(textDiff('same', 'same')).toEqual({ start: 4, remove: 0, insert: '' })
    expect(textDiff('aaa', 'aaaa')).toEqual({ start: 3, remove: 0, insert: 'a' })
  })
})

describe('shiftCaret', () => {
  it('keeps the caret on the same character when text changes elsewhere', () => {
    expect(shiftCaret('Hello world', 'Oh, Hello world', 6)).toBe(10)
    expect(shiftCaret('Hello world', 'Hello world!', 6)).toBe(6)
    expect(shiftCaret('Hello big world', 'Hello world', 12)).toBe(8)
    expect(shiftCaret('Hello big world', 'Hello world', 8)).toBe(6)
  })
})
