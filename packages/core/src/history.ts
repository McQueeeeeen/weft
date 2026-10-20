import * as Y from 'yjs'
import type { Board } from './model/board.ts'

const SELECTION_META = 'selection'
const CAPTURE_MS = 400

interface SelectionAccess {
  get: () => readonly string[]
  restore: (ids: readonly string[]) => void
}

interface StackItemEvent {
  stackItem: { meta: Map<string, unknown> }
}

export class History {
  private readonly manager: Y.UndoManager
  private readonly listeners = new Set<() => void>()
  private selectionBefore: string[] | null = null
  private readonly board: Board
  private readonly selection: SelectionAccess

  constructor(board: Board, selection: SelectionAccess) {
    this.board = board
    this.selection = selection
    this.manager = new Y.UndoManager(board.doc.getMap('shapes'), {
      trackedOrigins: new Set([board.origin]),
      captureTimeout: CAPTURE_MS,
    })
    board.doc.on('beforeTransaction', this.onBeforeTransaction)
    board.doc.on('afterTransaction', this.onAfterTransaction)
    this.manager.on('stack-item-added', (event: StackItemEvent) => {
      event.stackItem.meta.set(SELECTION_META, this.selectionBefore ?? [...this.selection.get()])
      this.selectionBefore = null
      this.emit()
    })
    this.manager.on('stack-item-updated', () => {
      this.selectionBefore = null
    })
    this.manager.on('stack-item-popped', (event: StackItemEvent) => {
      const ids = event.stackItem.meta.get(SELECTION_META)
      if (Array.isArray(ids)) {
        this.selection.restore((ids as string[]).filter((id) => this.board.has(id)))
      }
      this.emit()
    })
    this.manager.on('stack-cleared', () => this.emit())
  }

  get canUndo(): boolean {
    return this.manager.canUndo()
  }

  get canRedo(): boolean {
    return this.manager.canRedo()
  }

  undo(): void {
    this.manager.undo()
  }

  redo(): void {
    this.manager.redo()
  }

  stopCapturing(): void {
    this.manager.stopCapturing()
    this.manager.captureTimeout = CAPTURE_MS
  }

  hold(): void {
    this.manager.stopCapturing()
    this.manager.captureTimeout = Infinity
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    this.board.doc.off('beforeTransaction', this.onBeforeTransaction)
    this.board.doc.off('afterTransaction', this.onAfterTransaction)
    this.manager.destroy()
    this.listeners.clear()
  }

  private readonly onBeforeTransaction = (txn: Y.Transaction) => {
    if (txn.origin === this.board.origin && this.selectionBefore === null) {
      this.selectionBefore = [...this.selection.get()]
    }
  }

  private readonly onAfterTransaction = (txn: Y.Transaction) => {
    if (txn.origin === this.board.origin && txn.changed.size === 0) this.selectionBefore = null
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
