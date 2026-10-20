import * as Y from 'yjs'
import { worldToScreen } from './camera.ts'
import { Editor } from './editor/editor.ts'
import type { Modifiers, PointerInput } from './editor/types.ts'
import type { Vec } from './geometry/vec.ts'
import { Board } from './model/board.ts'
import type { RectShape } from './model/shapes.ts'

export const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): Omit<RectShape, 'id' | 'index'> => ({
  type: 'rect',
  x,
  y,
  w,
  h,
  color: 'ink',
  fill: 'solid',
  size: 'm',
})

export function connectedPair(): [Board, Board] {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(b, update, 'remote')
  })
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(a, update, 'remote')
  })
  return [new Board(a), new Board(b)]
}

export function partitionedPair(): { a: Board; b: Board; sync: () => void } {
  const a = new Board()
  const b = new Board()
  return {
    a,
    b,
    sync: () => {
      const toB = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc))
      const toA = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc))
      Y.applyUpdate(b.doc, toB, 'remote')
      Y.applyUpdate(a.doc, toA, 'remote')
    },
  }
}

export function createEditor(board = new Board(), now?: () => number): Editor {
  const editor = new Editor({ board, ...(now && { now }) })
  editor.setViewport(1000, 800)
  return editor
}

type PointerOptions = Partial<Modifiers> & {
  button?: number
  pointerType?: PointerInput['pointerType']
  pointerId?: number
}

export function pointer(editor: Editor) {
  const input = (world: Vec, o: PointerOptions = {}): PointerInput => ({
    point: worldToScreen(editor.camera, world),
    pointerId: o.pointerId ?? 1,
    pointerType: o.pointerType ?? 'mouse',
    button: o.button ?? 0,
    shift: o.shift ?? false,
    alt: o.alt ?? false,
    mod: o.mod ?? false,
  })
  return {
    down: (x: number, y: number, o?: PointerOptions) => editor.pointerDown(input({ x, y }, o)),
    move: (x: number, y: number, o?: PointerOptions) => editor.pointerMove(input({ x, y }, o)),
    up: (x: number, y: number, o?: PointerOptions) => editor.pointerUp(input({ x, y }, o)),
    dblclick: (x: number, y: number) => editor.doubleClick(input({ x, y })),
    drag(from: Vec, to: Vec, o?: PointerOptions) {
      this.down(from.x, from.y, o)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        this.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, o)
      }
      this.up(to.x, to.y, o)
    },
    click(x: number, y: number, o?: PointerOptions) {
      this.down(x, y, o)
      this.up(x, y, o)
    },
  }
}

export const key = (k: string, mods: Partial<Modifiers> = {}) => ({
  key: k,
  shift: false,
  alt: false,
  mod: false,
  ...mods,
})
