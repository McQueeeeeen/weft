import { Board } from '@weft/core'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { ago } from '../app/time.ts'
import type { Session } from '../collab/session.ts'
import { Dialog } from './Dialog.tsx'

interface Version {
  readonly at: number
  readonly objects: number
}

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; versions: readonly Version[] }

interface VersionsDialogProps {
  readonly open: boolean
  readonly session: Session
  readonly onClose: () => void
  readonly onRestored: (message: string) => void
}

export function VersionsDialog({ open, session, onClose, onRestored }: VersionsDialogProps) {
  return (
    <Dialog open={open} title="Version history" onClose={onClose}>
      <Versions session={session} onClose={onClose} onRestored={onRestored} />
    </Dialog>
  )
}

function Versions({ session, onClose, onRestored }: Omit<VersionsDialogProps, 'open'>) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/rooms/${session.room}/versions`)
      .then((res) =>
        res.ok ? (res.json() as Promise<Version[]>) : Promise.reject(new Error(res.statusText)),
      )
      .then((versions) => setState({ status: 'ready', versions }))
      .catch(() => setState({ status: 'error' }))
  }, [session.room])

  const restore = async (version: Version) => {
    setBusy(version.at)
    try {
      const res = await fetch(`/api/rooms/${session.room}/versions/${version.at}`)
      if (!res.ok) throw new Error()
      const doc = new Y.Doc()
      Y.applyUpdate(doc, new Uint8Array(await res.arrayBuffer()))
      const snapshot = new Board(doc).all()
      doc.destroy()
      const { editor } = session
      editor.history.stopCapturing()
      editor.board.replaceAll(snapshot)
      editor.history.stopCapturing()
      onRestored(`Restored the board from ${ago(version.at)}. Undo brings back what was there.`)
      onClose()
    } catch {
      onRestored('That version could not be loaded. Check the connection and try again.')
      setBusy(null)
    }
  }

  if (state.status === 'loading') return <p className="dialog-note">Loading saved versions…</p>
  if (state.status === 'error') {
    return <p className="dialog-note">Saved versions need a connection to the server.</p>
  }
  if (state.versions.length === 0) {
    return (
      <p className="dialog-note">
        No saved versions yet. The board is saved as a version every 10 minutes while people edit
        it.
      </p>
    )
  }
  return (
    <ul className="versions">
      {state.versions.map((v) => (
        <li key={v.at}>
          <span className="version-time">{ago(v.at)}</span>
          <span className="version-meta">
            {new Date(v.at).toLocaleString()} · {v.objects} {v.objects === 1 ? 'object' : 'objects'}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={busy !== null}
            onClick={() => void restore(v)}
          >
            {busy === v.at ? 'Restoring…' : 'Restore'}
          </button>
        </li>
      ))}
    </ul>
  )
}
