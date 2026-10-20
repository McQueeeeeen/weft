import {
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CornersOutIcon,
  MinusIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import type { Editor } from '@weft/core'
import { useEditor } from '../app/hooks.ts'

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

export function HistoryControls({ editor }: { editor: Editor }) {
  const { canUndo, canRedo } = useEditor(editor, (e) => ({
    canUndo: e.history.canUndo,
    canRedo: e.history.canRedo,
  }))
  return (
    <div className="history-controls panel" role="group" aria-label="History">
      <button
        type="button"
        className="icon-button"
        disabled={!canUndo}
        onClick={() => editor.undo()}
        aria-label="Undo"
        title={`Undo your last change (${mod}Z)`}
      >
        <ArrowUUpLeftIcon />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={!canRedo}
        onClick={() => editor.redo()}
        aria-label="Redo"
        title={`Redo (${mod}Shift+Z)`}
      >
        <ArrowUUpRightIcon />
      </button>
    </div>
  )
}

export function ZoomControls({ editor }: { editor: Editor }) {
  const zoom = useEditor(editor, (e) => Math.round(e.camera.z * 100))
  return (
    <div className="zoom-controls panel" role="group" aria-label="Zoom">
      <button
        type="button"
        className="icon-button"
        onClick={() => editor.zoomOut()}
        aria-label="Zoom out"
        title={`Zoom out (${mod}-)`}
      >
        <MinusIcon />
      </button>
      <button
        type="button"
        className="zoom-level"
        onClick={() => editor.resetZoom()}
        aria-label={`Zoom ${zoom}%. Reset to 100%`}
        title={`Reset to 100% (${mod}0)`}
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={() => editor.zoomIn()}
        aria-label="Zoom in"
        title={`Zoom in (${mod}+)`}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={() => editor.zoomToFit()}
        aria-label="Fit board in view"
        title="Fit board in view (Shift+1)"
      >
        <CornersOutIcon />
      </button>
    </div>
  )
}
