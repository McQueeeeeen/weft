import type { ThemePreference } from '../app/theme.ts'
import { newBoardUrl } from '../app/routing.ts'

interface BoardMenuProps {
  readonly hasContent: boolean
  readonly hasSelection: boolean
  readonly theme: ThemePreference
  readonly onTheme: (theme: ThemePreference) => void
  readonly onExport: (format: 'png' | 'svg') => void
  readonly onShortcuts: () => void
  readonly onHistory: (() => void) | null
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function BoardMenu(props: BoardMenuProps) {
  const close = () => document.getElementById('board-menu')?.hidePopover()
  const scope = props.hasSelection ? 'selection' : 'board'

  return (
    <div id="board-menu" className="menu panel" popover="auto" role="menu" aria-label="Board menu">
      <button
        type="button"
        role="menuitem"
        disabled={!props.hasContent}
        onClick={() => {
          close()
          props.onExport('png')
        }}
      >
        Export {scope} as PNG
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!props.hasContent}
        onClick={() => {
          close()
          props.onExport('svg')
        }}
      >
        Export {scope} as SVG
      </button>
      {!props.hasContent && <p className="menu-note">Add something to the board to export it.</p>}
      <hr />
      <fieldset className="menu-theme">
        <legend>Theme</legend>
        <div className="segmented">
          {THEMES.map((t) => (
            <label key={t.value}>
              <input
                type="radio"
                name="theme"
                value={t.value}
                checked={props.theme === t.value}
                onChange={() => props.onTheme(t.value)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <hr />
      {props.onHistory && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            close()
            props.onHistory?.()
          }}
        >
          Version history
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          close()
          props.onShortcuts()
        }}
      >
        Keyboard shortcuts
        <kbd>?</kbd>
      </button>
      <a role="menuitem" href={newBoardUrl()} target="_blank" rel="noopener">
        New board in a new tab
      </a>
    </div>
  )
}
