import { COLORS, type Editor, type ShapeInput } from '@weft/core'
import { useEffect, useState } from 'react'
import type { Renderer } from '../canvas/renderer.ts'

const STRESS_BATCH = 2000

export function DebugHud({ editor, renderer }: { editor: Editor; renderer: Renderer | null }) {
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  const stats = renderer?.stats
  return (
    <section className="debug-hud panel" aria-label="Performance">
      <dl>
        <dt>Objects</dt>
        <dd>{editor.board.size.toLocaleString()}</dd>
        <dt>Drawn</dt>
        <dd>{stats?.visible.toLocaleString() ?? '-'}</dd>
        <dt>Frames/s</dt>
        <dd>{stats?.fps ?? '-'}</dd>
        <dt>Last frame</dt>
        <dd>{stats ? `${stats.frameMs.toFixed(1)} ms` : '-'}</dd>
      </dl>
      <button type="button" onClick={() => addStressShapes(editor)}>
        Add {STRESS_BATCH.toLocaleString()} shapes
      </button>
    </section>
  )
}

function addStressShapes(editor: Editor): void {
  const center = editor.screenToWorld({
    x: editor.viewport.width / 2,
    y: editor.viewport.height / 2,
  })
  const side = Math.ceil(Math.sqrt(editor.board.size + STRESS_BATCH))
  const start = editor.board.size
  const inputs: ShapeInput[] = []
  for (let i = 0; i < STRESS_BATCH; i++) {
    const n = start + i
    const color = COLORS[n % COLORS.length]!
    const x = center.x + ((n % side) - side / 2) * 140
    const y = center.y + (Math.floor(n / side) - side / 2) * 110
    inputs.push(
      n % 3 === 0
        ? { type: 'sticky', x, y, w: 110, h: 90, color, text: `#${n}` }
        : {
            type: n % 3 === 1 ? 'rect' : 'ellipse',
            x,
            y,
            w: 110,
            h: 80,
            color,
            fill: 'tint',
            size: 's',
          },
    )
  }
  editor.history.stopCapturing()
  editor.board.createMany(inputs)
  editor.history.stopCapturing()
}
