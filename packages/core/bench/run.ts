/**
 * Micro-benchmarks for the hot paths of a drag frame and a render frame.
 * Run with `pnpm bench`. Numbers are machine-dependent; compare rows, not absolutes.
 */
import { boxFromRect, boxIntersects, type Box } from '../src/geometry/box.ts'
import { Board } from '../src/model/board.ts'
import { SpatialIndex } from '../src/spatial/spatial-index.ts'

const COUNT = 10_000
const SPREAD = 20_000
const viewport = boxFromRect(-960, -540, 1920, 1080)

function measure(
  name: string,
  fn: () => void,
  minMs = 500,
): { name: string; 'µs/op': string; ops: number } {
  for (let i = 0; i < 50; i++) fn()
  let ops = 0
  const start = performance.now()
  while (performance.now() - start < minMs) {
    fn()
    ops++
  }
  const elapsed = performance.now() - start
  return { name, 'µs/op': ((elapsed * 1000) / ops).toFixed(2), ops }
}

const boxes: Box[] = Array.from({ length: COUNT }, (_, i) =>
  boxFromRect(((i * 7919) % SPREAD) - SPREAD / 2, ((i * 104_729) % SPREAD) - SPREAD / 2, 200, 120),
)

const index = new SpatialIndex()
boxes.forEach((b, i) => index.set(String(i), b))

const board = new Board()
const loadStart = performance.now()
board.transact(() => {
  for (const b of boxes) {
    board.create({
      type: 'rect',
      x: b.minX,
      y: b.minY,
      w: 200,
      h: 120,
      color: 'ink',
      fill: 'none',
      size: 'm',
    })
  }
})
const loadMs = performance.now() - loadStart
const dragged = board.all()[0]!.id
let x = 0

console.warn(`${COUNT} shapes, 1920x1080 viewport. Initial load: ${loadMs.toFixed(0)} ms\n`)
console.table([
  measure('viewport query: spatial index', () => index.query(viewport)),
  measure('viewport query: linear scan', () => boxes.filter((b) => boxIntersects(b, viewport))),
  measure('board: visible shapes in paint order', () => board.queryBox(viewport)),
  measure('board: move one shape (one drag frame)', () => board.update(dragged, { x: x++ })),
])
