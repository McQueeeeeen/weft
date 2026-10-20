import { TOOL_SHORTCUTS, type Editor, type ToolId } from '@weft/core'
import { Fragment } from 'react'
import { useEditor } from '../app/hooks.ts'
import { TOOL_ICONS } from './icons.tsx'

export const TOOL_LABELS: Record<ToolId, string> = {
  select: 'Select',
  hand: 'Pan',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  sticky: 'Sticky note',
  text: 'Text',
  arrow: 'Arrow',
  pen: 'Pen',
}

const GROUPS: ToolId[][] = [
  ['select', 'hand'],
  ['rect', 'ellipse', 'sticky', 'text'],
  ['arrow', 'pen'],
]

const SHORTCUT_FOR = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS).map(([key, tool]) => [tool, key.toUpperCase()]),
) as Record<ToolId, string>

export function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditor(editor, (e) => e.tool)

  return (
    <div className="toolbar panel" role="toolbar" aria-label="Tools">
      {GROUPS.map((group, i) => (
        <Fragment key={group[0]}>
          {i > 0 && <span className="tool-divider" aria-hidden="true" />}
          {group.map((tool) => (
            <button
              key={tool}
              type="button"
              className="tool-button"
              aria-pressed={active === tool}
              aria-label={TOOL_LABELS[tool]}
              aria-keyshortcuts={SHORTCUT_FOR[tool]}
              title={`${TOOL_LABELS[tool]} (${SHORTCUT_FOR[tool]})`}
              onClick={() => editor.setTool(tool)}
            >
              {TOOL_ICONS[tool]}
              <kbd className="tool-key" aria-hidden="true">
                {SHORTCUT_FOR[tool]}
              </kbd>
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  )
}
