import { boxContainsBox, type Box } from '../geometry/box.ts'
import type { Vec } from '../geometry/vec.ts'
import type { Board } from '../model/board.ts'
import { arrowPoints, boxOf, boxOfPoints, type ShapeLookup } from '../model/geometry.ts'
import type { Shape, ShapePatch } from '../model/shapes.ts'

export const frameOf = (shape: Shape, lookup: ShapeLookup): Box =>
  shape.type === 'arrow' ? boxOfPoints(arrowPoints(shape, lookup)) : boxOf(shape)

export function withFrameContents(board: Board, shapes: readonly Shape[]): Shape[] {
  const ids = new Set(shapes.map((s) => s.id))
  const result = [...shapes]
  for (const frame of shapes) {
    if (frame.type !== 'frame') continue
    const box = boxOf(frame)
    for (const inner of board.queryBox(box)) {
      if (ids.has(inner.id) || !boxContainsBox(box, frameOf(inner, board.lookup))) continue
      ids.add(inner.id)
      result.push(inner)
    }
  }
  return result
}

export function snapTargets(board: Board, view: Box, moving: readonly Shape[]): Box[] {
  const skip = new Set(moving.map((s) => s.id))
  return board
    .queryBox(view)
    .flatMap((s) => (s.type === 'arrow' || skip.has(s.id) ? [] : [boxOf(s)]))
}

export const bindableAt = (
  board: Board,
  world: Vec,
  tolerance: number,
  exclude?: string | null,
): Shape | undefined =>
  board.shapeAt(world, tolerance, (s) => s.type !== 'arrow' && s.type !== 'pen' && s.id !== exclude)

export function geometryOf(shape: Shape): ShapePatch {
  switch (shape.type) {
    case 'arrow': {
      const { x1, y1, x2, y2, start, end } = shape
      return { x1, y1, x2, y2, start, end }
    }
    case 'pen':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h, points: shape.points }
    default:
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
  }
}

export function restore(board: Board, shapes: readonly Shape[]): void {
  board.transact(() => {
    for (const shape of shapes) board.update(shape.id, geometryOf(shape))
  })
}
