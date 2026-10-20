import { describe, expect, it } from 'vitest'
import { History } from './history.ts'
import { connectedPair, rect } from './test-utils.ts'

function withHistory(board = connectedPair()[0]) {
  let selection: readonly string[] = []
  const history = new History(board, {
    get: () => selection,
    restore: (ids) => {
      selection = ids
    },
  })
  return {
    board,
    history,
    select: (ids: string[]) => (selection = ids),
    selection: () => selection,
  }
}

describe('History', () => {
  it('undoes and redoes local edits', () => {
    const { board, history } = withHistory()
    const id = board.create(rect(0, 0, 10, 10))
    history.stopCapturing()
    board.update(id, { x: 50 })
    history.undo()
    expect(board.get(id)).toMatchObject({ x: 0 })
    history.undo()
    expect(board.has(id)).toBe(false)
    history.redo()
    history.redo()
    expect(board.get(id)).toMatchObject({ x: 50 })
  })

  it('never undoes a collaborator’s edits', () => {
    const [mine, theirs] = connectedPair()
    const { history } = withHistory(mine)
    const own = mine.create(rect(0, 0, 10, 10))
    history.stopCapturing()
    const foreign = theirs.create(rect(100, 0, 10, 10))
    theirs.update(own, { color: 'blue' })

    history.undo()

    expect(mine.has(own)).toBe(false)
    expect(mine.has(foreign)).toBe(true)
    expect(theirs.has(foreign)).toBe(true)
  })

  it('groups edits made in quick succession into one step', () => {
    const { board, history } = withHistory()
    const id = board.create(rect(0, 0, 10, 10))
    history.stopCapturing()
    for (let x = 1; x <= 20; x++) board.update(id, { x })
    history.undo()
    expect(board.get(id)).toMatchObject({ x: 0 })
  })

  it('restores the selection from before the undone edit', () => {
    const { board, history, select, selection } = withHistory()
    const a = board.create(rect(0, 0, 10, 10))
    const b = board.create(rect(20, 0, 10, 10))
    history.stopCapturing()
    select([a, b])
    board.delete([a, b])
    select([])
    history.undo()
    expect(selection()).toEqual([a, b])
  })

  it('reports availability', () => {
    const { board, history } = withHistory()
    expect(history.canUndo).toBe(false)
    board.create(rect(0, 0, 10, 10))
    expect(history.canUndo).toBe(true)
    history.undo()
    expect(history.canRedo).toBe(true)
  })
})
