import { MAX_NAME_LENGTH, PRESENCE_COLOR_COUNT, type PresenceUser } from '@weft/core'
import { useState } from 'react'
import { presenceColor } from '../canvas/palette.ts'
import { Dialog } from './Dialog.tsx'

interface IdentityDialogProps {
  readonly open: boolean
  readonly user: PresenceUser
  readonly onSave: (user: PresenceUser) => void
  readonly onClose: () => void
}

export function IdentityDialog({ open, user, onSave, onClose }: IdentityDialogProps) {
  return (
    <Dialog open={open} title="How others see you" onClose={onClose}>
      <IdentityForm user={user} onSave={onSave} />
    </Dialog>
  )
}

function IdentityForm({ user, onSave }: { user: PresenceUser; onSave: (u: PresenceUser) => void }) {
  const [name, setName] = useState(user.name)
  const [color, setColor] = useState(user.color)
  const trimmed = name.trim()

  return (
    <form
      className="identity-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSave({ name: trimmed, color })
      }}
    >
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          autoComplete="nickname"
          aria-describedby="name-hint"
          aria-invalid={trimmed === ''}
        />
      </label>
      <p id="name-hint" className={trimmed === '' ? 'field-error' : 'field-hint'}>
        {trimmed === ''
          ? 'Enter a name so others know who is editing.'
          : 'Shown next to your cursor.'}
      </p>
      <fieldset className="style-group">
        <legend>Color</legend>
        <div className="swatches">
          {Array.from({ length: PRESENCE_COLOR_COUNT }, (_, i) => (
            <label key={i} className="swatch">
              <input
                type="radio"
                name="presence-color"
                checked={color === i}
                onChange={() => setColor(i)}
                aria-label={presenceColor(i).name}
              />
              <span style={{ background: presenceColor(i).fill }} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="dialog-actions">
        <button type="submit" className="primary" disabled={trimmed === ''}>
          Save
        </button>
      </div>
    </form>
  )
}
