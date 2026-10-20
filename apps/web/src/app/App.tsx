import type { PresenceUser } from '@weft/core'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { boardToPng, boardToSvg, download } from '../canvas/export.ts'
import type { Renderer } from '../canvas/renderer.ts'
import { saveIdentity } from '../collab/identity.ts'
import type { Session } from '../collab/session.ts'
import { BoardCanvas } from '../ui/BoardCanvas.tsx'
import { BoardMenu } from '../ui/BoardMenu.tsx'
import { BoardStatus } from '../ui/BoardStatus.tsx'
import { HistoryControls, ZoomControls } from '../ui/CornerControls.tsx'
import { DebugHud } from '../ui/DebugHud.tsx'
import { IdentityDialog } from '../ui/IdentityDialog.tsx'
import { ShortcutsDialog } from '../ui/ShortcutsDialog.tsx'
import { StylePanel } from '../ui/StylePanel.tsx'
import { Toolbar } from '../ui/Toolbar.tsx'
import { TopBar } from '../ui/TopBar.tsx'
import { useEditor } from './hooks.ts'
import { usePrefersReducedMotion, useTheme } from './theme.ts'

const debug = new URLSearchParams(location.search).has('debug')
const TOAST_MS = 2400

export function App({ session }: { session: Session }) {
  const { editor, presence } = session
  const { theme, preference, setPreference } = useTheme()
  const reducedMotion = usePrefersReducedMotion()
  const status = useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.status,
  )
  const { hasContent, hasSelection } = useEditor(editor, (e) => ({
    hasContent: e.board.size > 0,
    hasSelection: e.selection.length > 0,
  }))
  const [renderer, setRenderer] = useState<Renderer | null>(null)
  const [dialog, setDialog] = useState<'shortcuts' | 'identity' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const openShortcuts = useCallback(() => setDialog('shortcuts'), [])

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setToast('Link copied. Anyone with it can view and edit this board.')
    } catch {
      setToast(`Copy this link to share: ${location.href}`)
    }
  }

  const exportBoard = async (format: 'png' | 'svg') => {
    const blob = format === 'svg' ? boardToSvg(editor, theme) : await boardToPng(editor, theme)
    if (!blob) return setToast('Nothing to export yet.')
    download(blob, `weft-board.${format}`)
  }

  const saveUser = (user: PresenceUser) => {
    presence.setUser(user)
    saveIdentity(user)
    setDialog(null)
  }

  return (
    <main className="workspace">
      <BoardCanvas
        editor={editor}
        theme={theme}
        reducedMotion={reducedMotion}
        onRenderer={setRenderer}
        onShortcuts={openShortcuts}
      />
      <BoardStatus editor={editor} loaded={status.loaded} />
      <TopBar
        session={session}
        onRename={() => setDialog('identity')}
        onShare={() => void share()}
        menu={
          <BoardMenu
            hasContent={hasContent}
            hasSelection={hasSelection}
            theme={preference}
            onTheme={setPreference}
            onExport={(format) => void exportBoard(format)}
            onShortcuts={openShortcuts}
          />
        }
      />
      <StylePanel editor={editor} theme={theme} />
      <Toolbar editor={editor} />
      <HistoryControls editor={editor} />
      <ZoomControls editor={editor} />
      {debug && <DebugHud editor={editor} renderer={renderer} />}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <p className="toast panel">{toast}</p>}
      </div>

      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} />
      <IdentityDialog
        open={dialog === 'identity'}
        user={presence.user}
        onSave={saveUser}
        onClose={() => setDialog(null)}
      />
    </main>
  )
}
