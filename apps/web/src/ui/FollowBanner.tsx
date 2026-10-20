import type { Presence } from '@weft/core'
import { usePeople } from '../app/hooks.ts'
import { thread } from '../canvas/palette.ts'

interface FollowBannerProps {
  readonly presence: Presence
  readonly following: number | null
  readonly onStop: () => void
}

export function FollowBanner({ presence, following, onStop }: FollowBannerProps) {
  const person = usePeople(presence).find((p) => p.clientId === following)
  if (!person) return null
  const color = thread(person.user.color)
  return (
    <div className="follow" style={{ '--follow': color.fill } as React.CSSProperties}>
      <p className="follow-tag" style={{ background: color.fill, color: color.text }}>
        Following {person.user.name}
        <button type="button" onClick={onStop}>
          Stop
        </button>
      </p>
    </div>
  )
}
