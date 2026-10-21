import type { Vec } from '../geometry/vec.ts'
import { FONT_SIZE, STICKY_SIZE } from '../model/shapes.ts'
import {
  IDLE,
  creating,
  drawingArrow,
  drawingPen,
  tolerance,
  type Gesture,
  type Host,
} from './gestures.ts'
import { bindableAt } from './queries.ts'
import type { Style, ToolId } from './types.ts'

export interface ToolHost extends Host {
  readonly style: Style
  startEditing(id: string): void
}

export function createText(host: ToolHost, world: Vec): void {
  const { color, size } = host.style
  const h = FONT_SIZE[size] * 1.3
  const id = host.board.create({
    type: 'text',
    x: world.x,
    y: world.y - h / 2,
    w: 1,
    h,
    color,
    size,
    text: '',
  })
  host.startEditing(id)
}

export function startTool(
  host: ToolHost,
  tool: Exclude<ToolId, 'select' | 'hand'>,
  world: Vec,
): Gesture {
  const { board, style } = host
  const { color, fill, size, route } = style
  const box = { x: world.x, y: world.y, w: 0, h: 0 }
  switch (tool) {
    case 'frame': {
      const count = board.all().filter((s) => s.type === 'frame').length
      const id = board.create({ type: 'frame', ...box, title: `Frame ${count + 1}`, color: 'ink' })
      host.select([id])
      return creating(host, id, world)
    }
    case 'rect':
    case 'ellipse': {
      const id = board.create({ type: tool, ...box, color, fill, size })
      host.select([id])
      return creating(host, id, world)
    }
    case 'sticky': {
      const half = STICKY_SIZE / 2
      host.startEditing(
        board.create({
          type: 'sticky',
          x: world.x - half,
          y: world.y - half,
          w: STICKY_SIZE,
          h: STICKY_SIZE,
          color: color === 'ink' ? 'yellow' : color,
          text: '',
        }),
      )
      return IDLE
    }
    case 'text':
      createText(host, world)
      return IDLE
    case 'arrow': {
      const target = bindableAt(board, world, tolerance(host))
      const id = board.create({
        type: 'arrow',
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
        start: target?.id ?? null,
        end: null,
        color,
        size,
        route,
      })
      host.select([id])
      return drawingArrow(host, id)
    }
    case 'pen': {
      const id = board.create({ type: 'pen', ...box, points: [0, 0], color, size })
      return drawingPen(host, id, world)
    }
  }
}
