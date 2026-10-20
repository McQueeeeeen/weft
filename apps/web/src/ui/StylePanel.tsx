import {
  SelectionBackgroundIcon,
  SelectionForegroundIcon,
  CopySimpleIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import {
  COLORS,
  hasFill,
  type ColorToken,
  type Editor,
  type Fill,
  type Route,
  type Size,
} from '@weft/core'
import type { Theme } from '../canvas/palette.ts'
import { useEditor } from '../app/hooks.ts'

const COLOR_NAMES: Record<ColorToken, string> = {
  ink: 'Ink',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  violet: 'Violet',
}

const ROUTE_OPTIONS: { value: Route; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'elbow', label: 'Elbow' },
]

const FILL_OPTIONS: { value: Fill; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'tint', label: 'Tint' },
  { value: 'solid', label: 'Solid' },
]

const SIZE_OPTIONS: { value: Size; label: string; name: string }[] = [
  { value: 's', label: 'S', name: 'Small' },
  { value: 'm', label: 'M', name: 'Medium' },
  { value: 'l', label: 'L', name: 'Large' },
]

const DRAWING_TOOLS = new Set(['rect', 'ellipse', 'sticky', 'text', 'arrow', 'pen'])

export function StylePanel({ editor, theme }: { editor: Editor; theme: Theme }) {
  const view = useEditor(editor, (e) => {
    const selected = e.selectedShapes().filter((s) => s.type !== 'frame' && s.type !== 'image')
    const tool = e.tool
    const types = new Set(selected.map((s) => s.type))
    const visible = (selected.length > 0 && e.editingId === null) || DRAWING_TOOLS.has(tool)
    const targets = selected.length > 0 ? [...types] : [tool]
    return {
      visible,
      hasSelection: selected.length > 0,
      ...e.style,
      showFill:
        selected.length > 0 ? selected.some(hasFill) : tool === 'rect' || tool === 'ellipse',
      showSize: targets.some((t) => t !== 'sticky'),
      showRoute: targets.includes('arrow'),
      paper: targets.every((t) => t === 'sticky'),
      count: selected.length,
    }
  })

  if (!view.visible) return null

  return (
    <aside className="style-panel panel" aria-label="Style">
      <fieldset className="style-group">
        <legend>Color</legend>
        <div className="swatches">
          {COLORS.map((color) => (
            <label key={color} className="swatch" title={COLOR_NAMES[color]}>
              <input
                type="radio"
                name="color"
                value={color}
                checked={view.color === color}
                onChange={() => editor.setStyle({ color })}
                aria-label={COLOR_NAMES[color]}
              />
              <span
                style={{ background: theme.content[color][view.paper ? 'sticky' : 'stroke'] }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {view.showFill && (
        <fieldset className="style-group">
          <legend>Fill</legend>
          <div className="segmented">
            {FILL_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="fill"
                  value={option.value}
                  checked={view.fill === option.value}
                  onChange={() => editor.setStyle({ fill: option.value })}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {view.showRoute && (
        <fieldset className="style-group">
          <legend>Line</legend>
          <div className="segmented">
            {ROUTE_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="route"
                  value={option.value}
                  checked={view.route === option.value}
                  onChange={() => editor.setStyle({ route: option.value })}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {view.showSize && (
        <fieldset className="style-group">
          <legend>Size</legend>
          <div className="segmented">
            {SIZE_OPTIONS.map((option) => (
              <label key={option.value} title={option.name}>
                <input
                  type="radio"
                  name="size"
                  value={option.value}
                  checked={view.size === option.value}
                  onChange={() => editor.setStyle({ size: option.value })}
                  aria-label={option.name}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {view.hasSelection && (
        <div className="style-group selection-actions" role="group" aria-label="Arrange">
          <button
            type="button"
            onClick={() => editor.bringToFront()}
            title="Bring to front (])"
            aria-label="Bring to front"
          >
            <SelectionForegroundIcon />
          </button>
          <button
            type="button"
            onClick={() => editor.sendToBack()}
            title="Send to back ([)"
            aria-label="Send to back"
          >
            <SelectionBackgroundIcon />
          </button>
          <button
            type="button"
            onClick={() => editor.duplicateSelected()}
            title="Duplicate (Ctrl+D)"
            aria-label="Duplicate"
          >
            <CopySimpleIcon />
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => editor.deleteSelected()}
            title="Delete (Del)"
            aria-label={view.count > 1 ? `Delete ${view.count} objects` : 'Delete'}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </aside>
  )
}
