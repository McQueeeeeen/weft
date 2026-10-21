import {
  FONT_SIZE,
  FRAME_TITLE_SIZE,
  LINE_HEIGHT,
  STICKY_FONT_SIZE,
  STICKY_PADDING,
  frameTitleBox,
  shiftCaret,
  type Editor,
} from '@weft/core'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { Theme } from '../canvas/palette.ts'
import { BOARD_FONT } from '../canvas/palette.ts'
import { measureTextBlock } from '../canvas/text-layout.ts'
import { useEditor } from '../app/hooks.ts'

export function TextEditor({ editor, theme }: { editor: Editor; theme: Theme }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const view = useEditor(editor, (e) => {
    const id = e.editingId
    const shape = id ? e.board.get(id) : undefined
    if (!shape || (shape.type !== 'sticky' && shape.type !== 'text' && shape.type !== 'frame'))
      return null
    const cam = e.camera
    const box = shape.type === 'frame' ? frameTitleBox(shape) : null
    return {
      id: shape.id,
      type: shape.type,
      text: shape.type === 'frame' ? shape.title : shape.text,
      color: shape.color,
      size: shape.type === 'text' ? shape.size : null,
      left: (shape.x - cam.x) * cam.z,
      top: ((box?.minY ?? shape.y) - cam.y) * cam.z,
      width: shape.w * cam.z,
      height: (box ? box.maxY - box.minY : shape.h) * cam.z,
      zoom: cam.z,
    }
  })

  const caret = useRef({ text: '', start: 0, end: 0 })
  const remember = useCallback(
    (el: HTMLTextAreaElement) => {
      caret.current = { text: el.value, start: el.selectionStart, end: el.selectionEnd }
      editor.moveCaret(el.selectionStart, el.selectionEnd)
    },
    [editor],
  )

  const editingId = view?.id
  useEffect(() => {
    const el = ref.current
    if (!el || !editingId) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
    remember(el)
  }, [editingId, remember])

  const text = view?.text
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || text === undefined || document.activeElement !== el) return
    const { text: before, start, end } = caret.current
    if (before === text) return
    el.setSelectionRange(shiftCaret(before, text, start), shiftCaret(before, text, end))
    remember(el)
  }, [text, remember])

  if (!view) return null

  const isSticky = view.type === 'sticky'
  const isFrame = view.type === 'frame'
  const fontSize =
    (isSticky ? STICKY_FONT_SIZE : isFrame ? FRAME_TITLE_SIZE : FONT_SIZE[view.size ?? 'm']) *
    view.zoom
  const padding = isSticky ? STICKY_PADDING * view.zoom : 0
  const colors = theme.content[view.color]

  return (
    <textarea
      ref={ref}
      className={`text-editor ${isSticky ? 'is-sticky' : isFrame ? 'is-frame' : 'is-text'}`}
      aria-label={isSticky ? 'Sticky note text' : isFrame ? 'Frame title' : 'Text'}
      value={view.text}
      wrap={isSticky ? 'soft' : 'off'}
      spellCheck
      style={{
        left: view.left,
        top: view.top,
        width: isSticky || isFrame ? view.width : Math.max(view.width, fontSize) + fontSize,
        height: view.height,
        padding,
        fontFamily: BOARD_FONT,
        fontSize,
        lineHeight: LINE_HEIGHT,
        color: isSticky ? colors.stickyText : colors.stroke,
      }}
      onSelect={(e) => remember(e.currentTarget)}
      onChange={(e) => {
        const text = e.target.value
        if (isFrame) {
          editor.updateText(view.id, text.replace(/\n/g, ' '))
        } else if (view.type === 'text') {
          const size = FONT_SIZE[view.size ?? 'm']
          editor.updateText(view.id, text, measureTextBlock(text, size, LINE_HEIGHT))
        } else {
          editor.updateText(view.id, text)
        }
        remember(e.target)
      }}
      onKeyDown={(e) => {
        const finish =
          e.key === 'Escape' || (e.key === 'Enter' && (isFrame || e.metaKey || e.ctrlKey))
        if (finish) {
          e.preventDefault()
          editor.stopEditing()
        }
      }}
      onBlur={() => editor.stopEditing()}
    />
  )
}
