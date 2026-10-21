import { CheckIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import {
  MAX_COMMENT_LENGTH,
  threadPosition,
  worldToScreen,
  type CommentAuthor,
  type Editor,
  type Thread,
} from '@weft/core'
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { useEditor } from '../app/hooks.ts'
import { ago } from '../app/time.ts'
import { thread as threadColor } from '../canvas/palette.ts'

interface CommentsLayerProps {
  readonly editor: Editor
  readonly author: CommentAuthor
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

function Composer({
  label,
  action,
  onSubmit,
  onCancel,
}: {
  label: string
  action: string
  onSubmit: (text: string) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState('')
  const submit = () => {
    if (text.trim() === '') return
    onSubmit(text)
    setText('')
  }
  return (
    <form
      className="comment-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        aria-label={label}
        placeholder={label}
        value={text}
        maxLength={MAX_COMMENT_LENGTH}
        rows={2}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') onCancel?.()
        }}
      />
      <div className="comment-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary" disabled={text.trim() === ''}>
          {action}
        </button>
      </div>
    </form>
  )
}

function ThreadCard({
  thread,
  editor,
  author,
  onClose,
}: {
  thread: Thread
  editor: Editor
  author: CommentAuthor
  onClose: () => void
}) {
  const { comments, readOnly } = editor
  return (
    <div
      className="comment-card panel"
      role="dialog"
      aria-label="Comment thread"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="comment-toolbar">
        {!readOnly && (
          <>
            <button
              type="button"
              className="icon-button"
              aria-label="Resolve thread"
              title="Resolve"
              onClick={() => {
                comments.resolve(thread.id, true)
                onClose()
              }}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Delete thread"
              title="Delete"
              onClick={() => {
                comments.remove(thread.id)
                onClose()
              }}
            >
              <TrashIcon />
            </button>
          </>
        )}
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <XIcon />
        </button>
      </div>
      <ol className="comment-messages">
        {thread.messages.map((m) => (
          <li key={m.id}>
            <span className="comment-author">
              <span
                className="comment-dot"
                style={{ background: threadColor(m.author.color).fill }}
              />
              {m.author.name}
              <time dateTime={new Date(m.at).toISOString()}>{ago(m.at)}</time>
            </span>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      {!readOnly && (
        <Composer
          label="Reply"
          action="Reply"
          onSubmit={(text) => comments.reply(thread.id, author, text.trim(), Date.now())}
        />
      )}
    </div>
  )
}

export function CommentsLayer({ editor, author }: CommentsLayerProps) {
  const { comments, board } = editor
  const threads = useSyncExternalStore(
    (onChange) => comments.subscribe(onChange),
    () => comments.threads(),
  )
  const { camera, draft } = useEditor(editor, (e) => ({
    camera: e.camera,
    draft: e.commentDraft,
    version: e.version,
  }))
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (open === null) return
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.comment-card, .comment-pin')) setOpen(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const place = (anchor: Parameters<typeof threadPosition>[0]): CSSProperties => {
    const p = worldToScreen(camera, threadPosition(anchor, board.lookup))
    return { left: p.x, top: p.y }
  }

  return (
    <div className="comments-layer">
      {threads
        .filter((t) => !t.resolved)
        .map((t) => {
          const first = t.messages[0]!
          const color = threadColor(first.author.color)
          return (
            <div key={t.id} className="comment-anchor" style={place(t)}>
              <button
                type="button"
                className="comment-pin"
                style={{ background: color.fill, color: color.text }}
                aria-expanded={open === t.id}
                aria-label={`Comment by ${first.author.name}: ${first.text}`}
                onClick={() => setOpen(open === t.id ? null : t.id)}
              >
                {initials(first.author.name)}
                {t.messages.length > 1 && (
                  <span className="comment-count">{t.messages.length}</span>
                )}
              </button>
              {open === t.id && (
                <ThreadCard
                  thread={t}
                  editor={editor}
                  author={author}
                  onClose={() => setOpen(null)}
                />
              )}
            </div>
          )
        })}
      {draft && (
        <div className="comment-anchor" style={place(draft)}>
          <span className="comment-pin is-draft" aria-hidden="true" />
          <div className="comment-card panel" role="dialog" aria-label="New comment">
            <Composer
              label="Add a comment"
              action="Comment"
              onSubmit={(text) => {
                const id = editor.submitComment(text, author)
                if (id) setOpen(id)
              }}
              onCancel={() => editor.cancelComment()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
