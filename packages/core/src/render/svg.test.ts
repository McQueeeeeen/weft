import { describe, expect, it } from 'vitest'
import { Board } from '../model/board.ts'
import { rect } from '../test-utils.ts'
import { penPathData } from './paths.ts'
import { exportSvg, type SvgExportOptions } from './svg.ts'

const options: SvgExportOptions = {
  color: (token, role) => `${token}-${role}`,
  background: '#fff',
  fontFamily: 'Plex "Sans"',
  wrapText: (text) => text.split('\n'),
  padding: 10,
}

describe('exportSvg', () => {
  it('returns null for an empty board', () => {
    expect(exportSvg([], () => undefined, options)).toBeNull()
  })

  it('frames the content with padding', () => {
    const board = new Board()
    board.create({ ...rect(0, 0, 100, 50), size: 's' })
    const svg = exportSvg(board.all(), board.lookup, options)!
    expect(svg).toContain('viewBox="-11 -11 122 72"')
    expect(svg).toContain('fill="ink-stroke"')
  })

  it('escapes user text and attributes', () => {
    const board = new Board()
    board.create({
      type: 'sticky',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      color: 'yellow',
      text: '<b>"hi" & bye</b>',
    })
    const svg = exportSvg(board.all(), board.lookup, options)!
    expect(svg).toContain('&lt;b&gt;"hi" &amp; bye&lt;/b&gt;')
    expect(svg).toContain('font-family="Plex &quot;Sans&quot;"')
    expect(svg).not.toContain('<b>')
  })

  it('draws every shape type', () => {
    const board = new Board()
    const a = board.create(rect(0, 0, 50, 50))
    board.create({
      type: 'ellipse',
      x: 100,
      y: 0,
      w: 50,
      h: 50,
      color: 'red',
      fill: 'tint',
      size: 'm',
    })
    board.create({
      type: 'text',
      x: 0,
      y: 100,
      w: 50,
      h: 30,
      color: 'ink',
      text: 'a\nb',
      size: 's',
    })
    board.create({
      type: 'pen',
      x: 0,
      y: 200,
      w: 10,
      h: 10,
      points: [0, 0, 5, 5, 10, 0],
      color: 'blue',
      size: 's',
    })
    board.create({
      type: 'arrow',
      x1: 0,
      y1: 0,
      x2: 300,
      y2: 300,
      start: a,
      end: null,
      color: 'ink',
      size: 'm',
    })
    const svg = exportSvg(board.all(), board.lookup, options)!
    for (const tag of ['<rect', '<ellipse', '<text', '<tspan', '<path']) expect(svg).toContain(tag)
  })
})

describe('penPathData', () => {
  it('handles dots, lines and curves', () => {
    expect(penPathData({ x: 1, y: 1, points: [0, 0] })).toBe('M1 1l0.01 0')
    expect(penPathData({ x: 0, y: 0, points: [0, 0, 10, 10] })).toBe('M0 0L10 10')
    expect(penPathData({ x: 0, y: 0, points: [0, 0, 10, 0, 20, 10] })).toBe('M0 0Q10 0 15 5L20 10')
  })
})
