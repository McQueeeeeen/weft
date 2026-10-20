import { XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, type ReactNode } from 'react'

interface DialogProps {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
  readonly wide?: boolean
  readonly children: ReactNode
}

export function Dialog({ open, title, onClose, wide = false, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-autofocus], h2')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog panel${wide ? ' wide' : ''}`}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title" tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <XIcon />
        </button>
      </div>
      {open && children}
    </dialog>
  )
}
