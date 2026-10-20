import { useEffect, useRef, useState } from 'react'
import type { Session } from '../collab/session.ts'

type Link = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'error' }

function LinkRow({ label, link }: { label: string; link: Link }) {
  const [copied, setCopied] = useState(false)
  const url = link.state === 'ready' ? link.url : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      document.getElementById(`${label}-link`)?.focus()
    }
  }

  return (
    <div className="share-row">
      <label htmlFor={`${label}-link`}>{label}</label>
      <div className="share-field">
        <input
          id={`${label}-link`}
          readOnly
          value={link.state === 'ready' ? url : link.state === 'loading' ? 'Creating link…' : ''}
          placeholder={link.state === 'error' ? 'Needs a connection to the server' : undefined}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="secondary" disabled={!url} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function ShareMenu({ session }: { session: Session }) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<Link>(
    session.readOnly ? { state: 'ready', url: location.href } : { state: 'loading' },
  )

  useEffect(() => {
    const menu = ref.current
    if (!menu || session.readOnly) return
    const load = (e: Event) => {
      if ((e as ToggleEvent).newState !== 'open' || view.state === 'ready') return
      setView({ state: 'loading' })
      fetch(`/api/rooms/${session.room}/view`, { method: 'POST' })
        .then((res) =>
          res.ok
            ? (res.json() as Promise<{ viewId: string }>)
            : Promise.reject(new Error(res.statusText)),
        )
        .then(({ viewId }) => setView({ state: 'ready', url: `${location.origin}/v/${viewId}` }))
        .catch(() => setView({ state: 'error' }))
    }
    menu.addEventListener('toggle', load)
    return () => menu.removeEventListener('toggle', load)
  }, [session, view.state])

  return (
    <div id="share-menu" ref={ref} className="menu share-menu panel" popover="auto">
      <h2>Share this board</h2>
      {!session.readOnly && (
        <LinkRow label="Can edit" link={{ state: 'ready', url: location.href }} />
      )}
      <LinkRow label="Can view" link={view} />
      <p className="menu-note">
        {session.readOnly
          ? 'You are viewing. Ask an editor for the edit link to make changes.'
          : 'Viewers see every change live but cannot edit.'}
      </p>
    </div>
  )
}
