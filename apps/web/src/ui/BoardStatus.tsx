import type { Editor } from '@weft/core'
import { useEffect, useState } from 'react'
import { useEditor } from '../app/hooks.ts'

const ANNOUNCE_DELAY_MS = 600

export function BoardStatus({ editor, loaded }: { editor: Editor; loaded: boolean }) {
  const { count, selected, tool } = useEditor(editor, (e) => ({
    count: e.board.size,
    selected: e.selection.length,
    tool: e.tool,
  }))
  const summary = `${count} ${count === 1 ? 'object' : 'objects'} on the board, ${selected} selected.`
  const [announced, setAnnounced] = useState(summary)

  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(summary), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [summary])

  return (
    <>
      <p className="visually-hidden" role="status" data-testid="board-summary">
        {announced}
      </p>
      {!loaded && (
        <p className="board-hint" role="status">
          Opening board…
        </p>
      )}
      {loaded && count === 0 && tool === 'select' && (
        <div className="board-hint">
          <p className="board-hint-title">This board is empty</p>
          <p>
            Press <kbd>S</kbd> for a sticky note, <kbd>R</kbd> for a rectangle, or double-click
            anywhere to write. Share the link to work on it together.
          </p>
        </div>
      )}
    </>
  )
}
