import type { Editor } from '@weft/core'
import { insertSample } from '../app/sample.ts'
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
        <section className="welcome panel" aria-labelledby="welcome-title">
          <h1 id="welcome-title">An empty board</h1>
          <p>Everything drawn here is shared live with anyone who has the link.</p>
          <div className="welcome-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                window.open(location.href, '_blank', 'popup,width=960,height=720,left=80,top=80')
              }
            >
              Open a second window
            </button>
            <button type="button" className="secondary" onClick={() => insertSample(editor)}>
              Start from a sample
            </button>
          </div>
          <p className="welcome-keys">
            Or press <kbd>S</kbd> for a sticky note, <kbd>R</kbd> for a rectangle, or double-click
            to write.
          </p>
        </section>
      )}
    </>
  )
}
