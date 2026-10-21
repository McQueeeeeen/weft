import type { PresenceUser } from '@weft/core'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { boardToPng, boardToSvg, download } from '../canvas/export.ts'
import { thread } from '../canvas/palette.ts'
import type { Renderer } from '../canvas/renderer.ts'
import { saveIdentity } from '../collab/identity.ts'
import type { Session } from '../collab/session.ts'
import { ReplayView } from '../replay/ReplayView.tsx'
import { BoardCanvas } from '../ui/BoardCanvas.tsx'
import { BoardMenu } from '../ui/BoardMenu.tsx'
import { BoardStatus } from '../ui/BoardStatus.tsx'
import { CommentsLayer } from '../ui/CommentsLayer.tsx'
import { HistoryControls, ZoomControls } from '../ui/CornerControls.tsx'
import { DebugHud } from '../ui/DebugHud.tsx'
import { IdentityDialog } from '../ui/IdentityDialog.tsx'
import { Minimap } from '../ui/Minimap.tsx'
import { ShortcutsDialog } from '../ui/ShortcutsDialog.tsx'
import { StylePanel } from '../ui/StylePanel.tsx'
import { Toolbar } from '../ui/Toolbar.tsx'
import { TopBar } from '../ui/TopBar.tsx'
import { FollowBanner } from '../ui/FollowBanner.tsx'
import { VersionsDialog } from '../ui/VersionsDialog.tsx'
import { useFollow } from './follow.ts'
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
  const [dialog, setDialog] = useState<'shortcuts' | 'identity' | 'versions' | 'replay' | null>(
    null,
  )
  const [following, setFollowing] = useFollow(editor, presence)
  const { readOnly } = session
  const [toast, setToast] = useState<string | null>(null)
  const [minimap, setMinimap] = useState(() => matchMedia('(min-width: 769px)').matches)
  const me = useSyncExternalStore(
    (onChange) => presence.subscribe(onChange),
    () => presence.user,
  )
  const myColor = me.color

  useEffect(() => {
    const { fill, text } = thread(myColor)
    document.documentElement.style.setProperty('--thread', fill)
    document.documentElement.style.setProperty('--on-thread', text)
  }, [myColor])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !status.loaded || editor.board.size === 0 || editor.history.canUndo)
      return
    fitted.current = true
    editor.zoomToFit()
  }, [status.loaded, status.synced, editor])

  const openShortcuts = useCallback(() => setDialog('shortcuts'), [])

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
        onNotice={setToast}
      />
      <BoardStatus editor={editor} loaded={status.loaded} readOnly={readOnly} />
      <CommentsLayer editor={editor} author={me} />
      <FollowBanner presence={presence} following={following} onStop={() => setFollowing(null)} />
      <TopBar
        session={session}
        onRename={() => setDialog('identity')}
        following={following}
        onFollow={setFollowing}
        menu={
          <BoardMenu
            hasContent={hasContent}
            hasSelection={hasSelection}
            theme={preference}
            onTheme={setPreference}
            onExport={(format) => void exportBoard(format)}
            onShortcuts={openShortcuts}
            onHistory={readOnly ? null : () => setDialog('versions')}
            onReplay={() => setDialog('replay')}
          />
        }
      />
      {!readOnly && <StylePanel editor={editor} theme={theme} />}
      {!readOnly && <Toolbar editor={editor} />}
      {!readOnly && <HistoryControls editor={editor} />}
      {minimap && hasContent && <Minimap editor={editor} presence={presence} theme={theme} />}
      <ZoomControls editor={editor} minimap={minimap} onMinimap={() => setMinimap((v) => !v)} />
      {debug && <DebugHud editor={editor} renderer={renderer} />}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <p className="toast panel">{toast}</p>}
      </div>

      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} />
      {dialog === 'replay' && (
        <ReplayView session={session} theme={theme} onClose={() => setDialog(null)} />
      )}
      <VersionsDialog
        open={dialog === 'versions'}
        session={session}
        onClose={() => setDialog(null)}
        onRestored={setToast}
      />
      <IdentityDialog
        open={dialog === 'identity'}
        user={presence.user}
        onSave={saveUser}
        onClose={() => setDialog(null)}
      />
    </main>
  )
}
