import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { boxExpand, boxUnionAll, type Box } from '../geometry/box.ts'
import type { Vec } from '../geometry/vec.ts'
import { SpatialIndex } from '../spatial/spatial-index.ts'
import { arrowEndpoints, hitTestShape, shapeBounds } from './geometry.ts'
import { createId } from './ids.ts'
import { parseShape } from './parse.ts'
import type { Shape, ShapeInput, ShapePatch } from './shapes.ts'

export interface BoardChange {
  readonly added: ReadonlySet<string>
  readonly updated: ReadonlySet<string>
  readonly removed: ReadonlySet<string>
  readonly local: boolean
}

type ShapeMap = Y.Map<unknown>

const SHAPES_KEY = 'shapes'

export class Board {
  readonly doc: Y.Doc
  readonly origin: object = { source: 'board' }

  private readonly root: Y.Map<ShapeMap>
  private readonly shapes = new Map<string, Shape>()
  private readonly spatial = new SpatialIndex()
  private readonly bindings = new Map<string, Set<string>>()
  private order: string[] | null = null
  private rank = new Map<string, number>()
  private readonly listeners = new Set<(change: BoardChange) => void>()

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc
    this.root = doc.getMap<ShapeMap>(SHAPES_KEY)
    this.apply(new Set(this.root.keys()), true)
    this.root.observeDeep(this.onDeepChange)
  }

  readonly lookup = (id: string): Shape | undefined => this.shapes.get(id)

  get size(): number {
    return this.shapes.size
  }

  get(id: string): Shape | undefined {
    return this.shapes.get(id)
  }

  has(id: string): boolean {
    return this.shapes.has(id)
  }

  all(): Shape[] {
    return this.ensureOrder().map((id) => this.shapes.get(id)!)
  }

  boundsOf(id: string): Box | undefined {
    return this.spatial.get(id)
  }

  boundsOfAll(ids: Iterable<string>): Box | null {
    const boxes: Box[] = []
    for (const id of ids) {
      const box = this.spatial.get(id)
      if (box) boxes.push(box)
    }
    return boxUnionAll(boxes)
  }

  queryBox(box: Box): Shape[] {
    return this.sortByPaintOrder(this.spatial.query(box)).map((id) => this.shapes.get(id)!)
  }

  shapeAt(point: Vec, tolerance: number, accept?: (shape: Shape) => boolean): Shape | undefined {
    const probe = boxExpand(
      { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y },
      tolerance,
    )
    const candidates = this.sortByPaintOrder(this.spatial.query(probe))
    for (let i = candidates.length - 1; i >= 0; i--) {
      const shape = this.shapes.get(candidates[i]!)!
      if (accept && !accept(shape)) continue
      if (hitTestShape(shape, point, tolerance, this.lookup)) return shape
    }
    return undefined
  }

  arrowsBoundTo(id: string): ReadonlySet<string> {
    return this.bindings.get(id) ?? EMPTY_SET
  }

  transact<T>(fn: () => T): T {
    let result!: T
    this.doc.transact(() => {
      result = fn()
    }, this.origin)
    return result
  }

  create(input: ShapeInput, id: string = createId()): string {
    const index = generateKeyBetween(this.topIndex(), null)
    this.transact(() => this.root.set(id, toYMap({ ...input, index })))
    return id
  }

  createMany(inputs: readonly (ShapeInput & { id?: string })[]): string[] {
    const keys = generateNKeysBetween(this.topIndex(), null, inputs.length)
    return this.transact(() =>
      inputs.map((input, i) => {
        const id = input.id ?? createId()
        this.root.set(id, toYMap({ ...input, id: undefined, index: keys[i] }))
        return id
      }),
    )
  }

  update<S extends Shape>(id: string, patch: ShapePatch<S>): void {
    const y = this.root.get(id)
    if (!y) return
    this.transact(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || key === 'id' || key === 'type') continue
        if (y.get(key) !== value) y.set(key, value)
      }
    })
  }

  replaceAll(shapes: readonly Shape[]): void {
    const keep = new Set(shapes.map((s) => s.id))
    this.transact(() => {
      for (const id of [...this.root.keys()]) if (!keep.has(id)) this.root.delete(id)
      for (const shape of shapes) this.root.set(shape.id, toYMap({ ...shape }))
    })
  }

  delete(ids: Iterable<string>): void {
    const doomed = new Set(ids)
    this.transact(() => {
      for (const id of doomed) {
        for (const arrowId of this.arrowsBoundTo(id)) {
          if (doomed.has(arrowId)) continue
          const arrow = this.shapes.get(arrowId)
          if (arrow?.type !== 'arrow') continue
          const { start, end } = arrowEndpoints(arrow, this.lookup)
          this.update(arrowId, {
            ...(arrow.start === id && { start: null, x1: start.x, y1: start.y }),
            ...(arrow.end === id && { end: null, x2: end.x, y2: end.y }),
          })
        }
      }
      for (const id of doomed) this.root.delete(id)
    })
  }

  bringToFront(ids: Iterable<string>): void {
    const sorted = this.sortByPaintOrder([...ids].filter((id) => this.shapes.has(id)))
    const keys = generateNKeysBetween(this.topIndex(), null, sorted.length)
    this.transact(() => sorted.forEach((id, i) => this.root.get(id)?.set('index', keys[i])))
  }

  sendToBack(ids: Iterable<string>): void {
    const sorted = this.sortByPaintOrder([...ids].filter((id) => this.shapes.has(id)))
    const keys = generateNKeysBetween(null, this.bottomIndex(), sorted.length)
    this.transact(() => sorted.forEach((id, i) => this.root.get(id)?.set('index', keys[i])))
  }

  subscribe(listener: (change: BoardChange) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.root.unobserveDeep(this.onDeepChange)
    this.listeners.clear()
  }

  sortByPaintOrder(ids: string[]): string[] {
    this.ensureOrder()
    return ids.sort((a, b) => this.rank.get(a)! - this.rank.get(b)!)
  }

  private topIndex(): string | null {
    const order = this.ensureOrder()
    const top = order[order.length - 1]
    return top === undefined ? null : this.shapes.get(top)!.index
  }

  private bottomIndex(): string | null {
    const bottom = this.ensureOrder()[0]
    return bottom === undefined ? null : this.shapes.get(bottom)!.index
  }

  private ensureOrder(): string[] {
    if (this.order) return this.order
    this.order = [...this.shapes.values()]
      .sort((a, b) => compare(a.index, b.index) || compare(a.id, b.id))
      .map((s) => s.id)
    this.rank = new Map(this.order.map((id, i) => [id, i]))
    return this.order
  }

  private readonly onDeepChange = (
    events: Y.YEvent<Y.AbstractType<unknown>>[],
    txn: Y.Transaction,
  ) => {
    const touched = new Set<string>()
    for (const event of events) {
      if (event.target === this.root) {
        for (const key of event.keys.keys()) touched.add(key)
      } else {
        const key = event.path[0]
        if (typeof key === 'string') touched.add(key)
      }
    }
    this.apply(touched, txn.local)
  }

  private apply(touched: Set<string>, local: boolean): void {
    const added = new Set<string>()
    const updated = new Set<string>()
    const removed = new Set<string>()

    for (const id of touched) {
      const prev = this.shapes.get(id)
      const y = this.root.get(id)
      const next = y instanceof Y.Map ? parseShape(id, y.toJSON()) : null
      if (prev?.type === 'arrow') this.unlinkArrow(prev)
      if (next) {
        this.shapes.set(id, next)
        if (next.type === 'arrow') this.linkArrow(next)
        if (!prev || prev.index !== next.index) this.order = null
        if (prev) updated.add(id)
        else added.add(id)
      } else if (prev) {
        this.shapes.delete(id)
        this.spatial.delete(id)
        this.order = null
        removed.add(id)
      }
    }

    for (const set of [added, updated, removed]) {
      for (const id of set) {
        for (const arrowId of this.arrowsBoundTo(id)) {
          if (this.shapes.has(arrowId) && !added.has(arrowId)) updated.add(arrowId)
        }
      }
    }
    for (const set of [added, updated]) {
      for (const id of set) this.spatial.set(id, shapeBounds(this.shapes.get(id)!, this.lookup))
    }

    if (added.size + updated.size + removed.size === 0) return
    const change: BoardChange = { added, updated, removed, local }
    for (const listener of this.listeners) listener(change)
  }

  private linkArrow(arrow: Shape & { type: 'arrow' }): void {
    for (const target of [arrow.start, arrow.end]) {
      if (target === null) continue
      let set = this.bindings.get(target)
      if (!set) this.bindings.set(target, (set = new Set()))
      set.add(arrow.id)
    }
  }

  private unlinkArrow(arrow: Shape & { type: 'arrow' }): void {
    for (const target of [arrow.start, arrow.end]) {
      if (target === null) continue
      const set = this.bindings.get(target)
      set?.delete(arrow.id)
      if (set?.size === 0) this.bindings.delete(target)
    }
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set()

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function toYMap(record: Record<string, unknown>): ShapeMap {
  const entries = Object.entries(record).filter(([key, v]) => v !== undefined && key !== 'id')
  return new Y.Map(entries)
}
