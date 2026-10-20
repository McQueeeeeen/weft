import { boxCenter, boxUnionAll } from '../geometry/box.ts'
import type { Vec } from '../geometry/vec.ts'
import { arrowEndpoints, shapeBounds, translatePatch, type ShapeLookup } from '../model/geometry.ts'
import { createId } from '../model/ids.ts'
import { parseShape } from '../model/parse.ts'
import type { Shape, ShapeInput } from '../model/shapes.ts'

const FORMAT = 'weft/shapes'
const VERSION = 1

interface ClipboardPayload {
  format: typeof FORMAT
  version: typeof VERSION
  shapes: Shape[]
}

/**
 * Serializes shapes for the system clipboard. Arrow ends are frozen to where they are
 * currently drawn, so an arrow pasted without its target still looks the same.
 */
export function serializeShapes(shapes: readonly Shape[], lookup: ShapeLookup): string {
  const frozen = shapes.map((shape) => {
    if (shape.type !== 'arrow') return shape
    const { start, end } = arrowEndpoints(shape, lookup)
    return { ...shape, x1: start.x, y1: start.y, x2: end.x, y2: end.y }
  })
  const payload: ClipboardPayload = { format: FORMAT, version: VERSION, shapes: frozen }
  return JSON.stringify(payload)
}

/**
 * Parses clipboard text into shapes ready to insert: fresh ids, arrow bindings
 * remapped inside the pasted group (and dropped when the target was not copied),
 * and the group moved so its center lands on `center`, or offset by `offset`.
 */
export function deserializeShapes(
  text: string,
  placement: { center: Vec } | { offset: Vec },
): (ShapeInput & { id: string })[] | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { format, version, shapes } = data as Partial<ClipboardPayload>
  if (format !== FORMAT || version !== VERSION || !Array.isArray(shapes)) return null

  const parsed = shapes
    .map((raw: unknown) => {
      const id = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : null
      return typeof id === 'string' ? parseShape(id, raw) : null
    })
    .filter((s): s is Shape => s !== null)
  if (parsed.length === 0) return null

  const ids = new Map(parsed.map((s) => [s.id, createId()]))
  const byId = new Map(parsed.map((s) => [s.id, s]))
  const lookup: ShapeLookup = (id) => byId.get(id)

  let dx: number
  let dy: number
  if ('center' in placement) {
    const bounds = boxUnionAll(parsed.map((s) => shapeBounds(s, lookup)))!
    const c = boxCenter(bounds)
    dx = placement.center.x - c.x
    dy = placement.center.y - c.y
  } else {
    dx = placement.offset.x
    dy = placement.offset.y
  }

  return parsed.map((shape) => {
    const moved = { ...shape, ...translatePatch(shape, dx, dy) }
    const { id, index, ...rest } = moved
    const input = { ...rest, id: ids.get(shape.id)! }
    if (input.type === 'arrow') {
      return {
        ...input,
        start: input.start === null ? null : (ids.get(input.start) ?? null),
        end: input.end === null ? null : (ids.get(input.end) ?? null),
      }
    }
    return input
  })
}
