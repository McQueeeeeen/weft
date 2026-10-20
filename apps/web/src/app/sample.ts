import {
  FONT_SIZE,
  LINE_HEIGHT,
  createId,
  type ColorToken,
  type Editor,
  type ShapeInput,
} from '@weft/core'
import { measureTextBlock } from '../canvas/text-layout.ts'

const STEPS: [string, ColorToken][] = [
  ['Sketch the idea on the board', 'yellow'],
  ['Send the link to the team', 'blue'],
  ['Decide together, live', 'green'],
]

const SIDE = 200
const GAP = 120

export function insertSample(editor: Editor): void {
  const { width, height } = editor.viewport
  const center = editor.screenToWorld({ x: width / 2, y: height / 2 })
  const left = center.x - (STEPS.length * SIDE + (STEPS.length - 1) * GAP) / 2
  const top = center.y - SIDE / 2
  const title = 'How a board comes together'
  const ids = STEPS.map(() => createId())

  const shapes: (ShapeInput & { id?: string })[] = [
    {
      type: 'text',
      x: left,
      y: top - 90,
      ...measureTextBlock(title, FONT_SIZE.m, LINE_HEIGHT),
      text: title,
      size: 'm',
      color: 'ink',
    },
    ...STEPS.map(([text, color], i) => ({
      id: ids[i],
      type: 'sticky' as const,
      x: left + i * (SIDE + GAP),
      y: top,
      w: SIDE,
      h: SIDE,
      text,
      color,
    })),
    ...ids.slice(1).map((end, i) => ({
      type: 'arrow' as const,
      route: 'elbow' as const,
      x1: left + i * (SIDE + GAP) + SIDE,
      y1: center.y,
      x2: left + (i + 1) * (SIDE + GAP),
      y2: center.y,
      start: ids[i]!,
      end,
      color: 'ink' as const,
      size: 'm' as const,
    })),
  ]

  editor.history.stopCapturing()
  editor.board.createMany(shapes)
  editor.history.stopCapturing()
}
