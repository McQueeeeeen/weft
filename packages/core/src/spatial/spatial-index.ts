import { boxIntersects, type Box } from '../geometry/box.ts'

const MAX_CELLS_PER_ENTRY = 64
const CELL_OFFSET = 2 ** 20
const CELL_STRIDE = 2 ** 21

export class SpatialIndex {
  private readonly cells = new Map<number, Set<string>>()
  private readonly entries = new Map<string, { box: Box; cells: number[] | null }>()
  private readonly oversized = new Set<string>()

  private readonly cellSize: number

  constructor(cellSize = 256) {
    this.cellSize = cellSize
  }

  get size(): number {
    return this.entries.size
  }

  set(id: string, box: Box): void {
    this.delete(id)
    const cells = this.cellsFor(box)
    if (cells === null) {
      this.oversized.add(id)
    } else {
      for (const key of cells) {
        let bucket = this.cells.get(key)
        if (!bucket) this.cells.set(key, (bucket = new Set()))
        bucket.add(id)
      }
    }
    this.entries.set(id, { box, cells })
  }

  delete(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.cells === null) {
      this.oversized.delete(id)
    } else {
      for (const key of entry.cells) {
        const bucket = this.cells.get(key)
        if (!bucket) continue
        bucket.delete(id)
        if (bucket.size === 0) this.cells.delete(key)
      }
    }
    this.entries.delete(id)
  }

  get(id: string): Box | undefined {
    return this.entries.get(id)?.box
  }

  query(box: Box): string[] {
    const result: string[] = []
    const [minCx, minCy, maxCx, maxCy] = this.cellRange(box)
    const cellCount = (maxCx - minCx + 1) * (maxCy - minCy + 1)

    if (cellCount > this.entries.size) {
      for (const [id, entry] of this.entries) {
        if (boxIntersects(entry.box, box)) result.push(id)
      }
      return result
    }

    const seen = new Set<string>()
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(packCell(cx, cy))
        if (!bucket) continue
        for (const id of bucket) {
          if (seen.has(id)) continue
          seen.add(id)
          if (boxIntersects(this.entries.get(id)!.box, box)) result.push(id)
        }
      }
    }
    for (const id of this.oversized) {
      if (boxIntersects(this.entries.get(id)!.box, box)) result.push(id)
    }
    return result
  }

  clear(): void {
    this.cells.clear()
    this.entries.clear()
    this.oversized.clear()
  }

  private cellRange(box: Box): [number, number, number, number] {
    const s = this.cellSize
    return [
      Math.floor(box.minX / s),
      Math.floor(box.minY / s),
      Math.floor(box.maxX / s),
      Math.floor(box.maxY / s),
    ]
  }

  private cellsFor(box: Box): number[] | null {
    const [minCx, minCy, maxCx, maxCy] = this.cellRange(box)
    if ((maxCx - minCx + 1) * (maxCy - minCy + 1) > MAX_CELLS_PER_ENTRY) return null
    const keys: number[] = []
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) keys.push(packCell(cx, cy))
    }
    return keys
  }
}

const packCell = (cx: number, cy: number): number =>
  (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET)
