import { FONT_SIZE, LINE_HEIGHT, STICKY_FONT_SIZE, STICKY_PADDING, type Editor } from '@weft/core'
import { useEffect, useRef } from 'react'
import type { Theme } from '../canvas/palette.ts'
import { BOARD_FONT } from '../canvas/palette.ts'
import { measureTextBlock } from '../canvas/text-layout.ts'
import { useEditor } from '../app/hooks.ts'

export function TextEditor({ editor, theme }: { editor: Editor; theme: Theme }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const view = useEditor(editor, (e) => {
    const id = e.editingId
    const shape = id ? e.board.get(id) : undefined
    if (!shape || (shape.type !== 'sticky' && shape.type !== 'text')) return null
    const cam = e.camera
    return {
      id: shape.id,
      type: shape.type,
      text: shape.text,
      color: shape.color,
      size: shape.type === 'text' ? shape.size : null,
      left: (shape.x - cam.x) * cam.z,
      top: (shape.y - cam.y) * cam.z,
      width: shape.w * cam.z,
      height: shape.h * cam.z,
      zoom: cam.z,
    }
  })

  const editingId = view?.id
  useEffect(() => {
    const el = ref.current
    if (!el || !editingId) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editingId])

  if (!view) return null

  const isSticky = view.type === 'sticky'
  const fontSize = (isSticky ? STICKY_FONT_SIZE : FONT_SIZE[view.size ?? 'm']) * view.zoom
  const padding = isSticky ? STICKY_PADDING * view.zoom : 0
  const colors = theme.content[view.color]

  return (
    <textarea
      ref={ref}
      className={`text-editor ${isSticky ? 'is-sticky' : 'is-text'}`}
      aria-label={isSticky ? 'Sticky note text' : 'Text'}
      value={view.text}
      wrap={isSticky ? 'soft' : 'off'}
      spellCheck
      style={{
        left: view.left,
        top: view.top,
        width: isSticky ? view.width : Math.max(view.width, fontSize) + fontSize,
        height: view.height,
        padding,
        fontFamily: BOARD_FONT,
        fontSize,
        lineHeight: LINE_HEIGHT,
        color: isSticky ? colors.stickyText : colors.stroke,
      }}
      onChange={(e) => {
        const text = e.target.value
        if (view.type === 'text') {
          const size = FONT_SIZE[view.size ?? 'm']
          editor.updateText(view.id, text, measureTextBlock(text, size, LINE_HEIGHT))
        } else {
          editor.updateText(view.id, text)
        }
      }}
      onKeyDown={(e) => {
        const finish = e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
        if (finish) {
          e.preventDefault()
          editor.stopEditing()
        }
      }}
      onBlur={() => editor.stopEditing()}
    />
  )
}
