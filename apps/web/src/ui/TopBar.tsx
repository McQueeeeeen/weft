import { DotsThreeIcon } from '@phosphor-icons/react'
import type { Presence } from '@weft/core'
import { useState, useSyncExternalStore } from 'react'
import { usePeople } from '../app/hooks.ts'
import { thread } from '../canvas/palette.ts'
import { initials } from '../collab/identity.ts'
import type { Session, SessionStatus } from '../collab/session.ts'
import { Logo } from './Logo.tsx'
import { ShareMenu } from './ShareMenu.tsx'

const MAX_AVATARS = 4

interface TopBarProps {
  readonly session: Session
  readonly onRename: () => void
  readonly following: number | null
  readonly onFollow: (clientId: number | null) => void
  readonly menu: React.ReactNode
}

export function TopBar({ session, onRename, following, onFollow, menu }: TopBarProps) {
  const status = useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.status,
  )

  return (
    <>
      <header className="brand panel">
        <Logo />
        <ConnectionLabel status={status} />
        {session.readOnly && <span className="view-badge">View only</span>}
      </header>
      <div className="top-actions">
        <People
          presence={session.presence}
          onRename={onRename}
          following={following}
          onFollow={onFollow}
        />
        <button type="button" className="primary" popoverTarget="share-menu">
          Share
        </button>
        <ShareMenu session={session} />
        <button
          type="button"
          className="icon-button panel"
          popoverTarget="board-menu"
          aria-label="Board menu"
          title="Board menu"
        >
          <DotsThreeIcon weight="bold" />
        </button>
        {menu}
      </div>
    </>
  )
}

function ConnectionLabel({ status }: { status: SessionStatus }) {
  const [label, detail] =
    status.connection === 'online'
      ? ['Live', 'Changes are shared as you make them.']
      : status.connection === 'connecting'
        ? ['Connecting', 'Reaching the sync server.']
        : ['Offline', 'Edits are kept on this device and sync when the connection returns.']
  return (
    <span className="connection" data-state={status.connection} title={detail}>
      <span className="connection-mark" aria-hidden="true" />
      <span>{label}</span>
      <span className="visually-hidden">. {detail}</span>
    </span>
  )
}

interface PeopleProps {
  readonly presence: Presence
  readonly onRename: () => void
  readonly following: number | null
  readonly onFollow: (clientId: number | null) => void
}

function People({ presence, onRename, following, onFollow }: PeopleProps) {
  const people = usePeople(presence)
  const me = useSyncExternalStore(
    (onChange) => presence.subscribe(onChange),
    () => presence.user,
  )
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? people : people.slice(0, MAX_AVATARS - 1)
  const hidden = people.length - shown.length

  return (
    <div className="people" role="group" aria-label={`${people.length + 1} people on this board`}>
      <button
        type="button"
        className="avatar me"
        style={avatarStyle(me.color)}
        onClick={onRename}
        title={`${me.name} (you). Change name or color`}
        aria-label={`You: ${me.name}. Change name or color`}
      >
        {initials(me.name)}
      </button>
      {shown.map((p) => (
        <button
          type="button"
          key={p.clientId}
          className="avatar"
          style={avatarStyle(p.user.color)}
          aria-pressed={following === p.clientId}
          onClick={() => onFollow(following === p.clientId ? null : p.clientId)}
          title={
            following === p.clientId ? `Stop following ${p.user.name}` : `Follow ${p.user.name}`
          }
          aria-label={`Follow ${p.user.name}`}
        >
          {initials(p.user.name)}
        </button>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          className="avatar more"
          onClick={() => setExpanded(true)}
          aria-label={`Show ${hidden} more people`}
        >
          +{hidden}
        </button>
      )}
    </div>
  )
}

function avatarStyle(color: number): React.CSSProperties {
  const c = thread(color)
  return { background: c.fill, color: c.text, '--ring': c.fill } as React.CSSProperties
}
