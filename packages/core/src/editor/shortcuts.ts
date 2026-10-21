import type { Editor } from './editor.ts'
import { TOOL_SHORTCUTS, type KeyInput } from './types.ts'

type Command = (editor: Editor, e: KeyInput) => boolean | void

const NUDGE = 1
const NUDGE_LARGE = 10

const nudge =
  (x: number, y: number): Command =>
  (editor, e) => {
    if (editor.selection.length === 0) return false
    const step = e.shift ? NUDGE_LARGE : NUDGE
    editor.nudge(x * step, y * step)
  }

const withShift =
  (command: Command): Command =>
  (editor, e) =>
    e.shift ? command(editor, e) : false

const WITH_MOD: Record<string, Command> = {
  z: (editor, e) => (e.shift ? editor.redo() : editor.undo()),
  y: (editor) => editor.redo(),
  a: (editor) => editor.selectAll(),
  d: (editor) => editor.duplicateSelected(),
  '=': (editor) => editor.zoomIn(),
  '+': (editor) => editor.zoomIn(),
  '-': (editor) => editor.zoomOut(),
  '0': (editor) => editor.resetZoom(),
}

const PLAIN: Record<string, Command> = {
  Escape: (editor) => {
    if (editor.isInteracting) editor.cancel()
    else if (editor.tool !== 'select') editor.setTool('select')
    else editor.select([])
  },
  Delete: (editor) => editor.deleteSelected(),
  Backspace: (editor) => editor.deleteSelected(),
  Enter: (editor) => {
    const [only, ...rest] = editor.selectedShapes()
    if (!only || rest.length > 0 || (only.type !== 'sticky' && only.type !== 'text')) return false
    editor.startEditing(only.id)
  },
  ArrowLeft: nudge(-1, 0),
  ArrowRight: nudge(1, 0),
  ArrowUp: nudge(0, -1),
  ArrowDown: nudge(0, 1),
  ']': (editor) => editor.bringToFront(),
  '[': (editor) => editor.sendToBack(),
  '!': withShift((editor) => editor.zoomToFit()),
  '1': withShift((editor) => editor.zoomToFit()),
  '@': withShift((editor) => editor.zoomToSelection()),
  '2': withShift((editor) => editor.zoomToSelection()),
}

export function runShortcut(editor: Editor, e: KeyInput, key: string): boolean {
  const command = (e.mod ? WITH_MOD : PLAIN)[key]
  if (command) return command(editor, e) !== false
  const tool = TOOL_SHORTCUTS[key]
  if (e.mod || !tool || e.alt) return false
  editor.setTool(tool)
  return true
}
