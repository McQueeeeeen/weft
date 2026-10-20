import { FONT_SIZE, LINE_HEIGHT, type Editor, type PointerInput, type Vec } from '@weft/core'
import { useEffect, useRef } from 'react'
import type { Theme } from '../canvas/palette.ts'
import { Renderer } from '../canvas/renderer.ts'
import { imageFiles, insertImages } from '../collab/assets.ts'
import { measureTextBlock } from '../canvas/text-layout.ts'
import { useEditor } from '../app/hooks.ts'
import { TextEditor } from './TextEditor.tsx'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const LINE_DELTA_PX = 16

interface BoardCanvasProps {
  readonly editor: Editor
  readonly theme: Theme
  readonly reducedMotion: boolean
  readonly onRenderer?: (renderer: Renderer | null) => void
  readonly onShortcuts: () => void
  readonly onNotice: (message: string) => void
}

export function BoardCanvas({
  editor,
  theme,
  reducedMotion,
  onRenderer,
  onShortcuts,
  onNotice,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const reducedMotionRef = useRef(reducedMotion)
  const themeRef = useRef(theme)
  const onNoticeRef = useRef(onNotice)
  const lastPointer = useRef<Vec | null>(null)
  const cursor = useEditor(editor, (e) => e.cursor)

  useEffect(() => {
    reducedMotionRef.current = reducedMotion
    themeRef.current = theme
    onNoticeRef.current = onNotice
    rendererRef.current?.setTheme(theme)
  }, [reducedMotion, theme, onNotice])

  useEffect(() => {
    const canvas = canvasRef.current!
    const container = containerRef.current!
    const renderer = new Renderer(canvas, editor, themeRef.current, () => reducedMotionRef.current)
    rendererRef.current = renderer
    onRenderer?.(renderer)

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      editor.setViewport(width, height)
      renderer.resize(width, height, window.devicePixelRatio || 1)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    void document.fonts.ready.then(() => renderer.invalidate())

    return () => {
      observer.disconnect()
      renderer.destroy()
      rendererRef.current = null
      onRenderer?.(null)
    }
  }, [editor, onRenderer])

  useEffect(() => {
    const canvas = canvasRef.current!

    const toInput = (e: PointerEvent | MouseEvent): PointerInput => {
      const rect = canvas.getBoundingClientRect()
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      lastPointer.current = point
      return {
        point,
        pointerId: 'pointerId' in e ? e.pointerId : 1,
        pointerType:
          'pointerType' in e && (e.pointerType === 'touch' || e.pointerType === 'pen')
            ? e.pointerType
            : 'mouse',
        button: e.button,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: isMac ? e.metaKey : e.ctrlKey,
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      canvas.focus({ preventScroll: true })
      editor.pointerDown(toInput(e))
    }
    const onPointerMove = (e: PointerEvent) => {
      const events = editor.tool === 'pen' && e.getCoalescedEvents ? e.getCoalescedEvents() : []
      if (events.length > 0) for (const ev of events) editor.pointerMove(toInput(ev))
      else editor.pointerMove(toInput(e))
    }
    const onPointerUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      editor.pointerUp(toInput(e))
    }
    const onPointerCancel = () => editor.cancel()
    const onPointerLeave = () => {
      lastPointer.current = null
      editor.pointerLeave()
    }
    const onDoubleClick = (e: MouseEvent) => editor.doubleClick(toInput(e))
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_DELTA_PX : 1
      const rect = canvas.getBoundingClientRect()
      editor.wheel({
        point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        deltaX: e.deltaX * scale,
        deltaY: e.deltaY * scale,
        mod: e.ctrlKey || e.metaKey,
      })
    }
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      const images = imageFiles(e.dataTransfer?.files)
      if (images.length === 0) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      insertImages(editor, images, { x: e.clientX - rect.left, y: e.clientY - rect.top }).catch(
        (error: unknown) => onNoticeRef.current(String((error as Error).message)),
      )
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('dblclick', onDoubleClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('dragover', onDragOver)
    canvas.addEventListener('drop', onDrop)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('dblclick', onDoubleClick)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('dragover', onDragOver)
      canvas.removeEventListener('drop', onDrop)
    }
  }, [editor])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onShortcuts()
        return
      }
      const handled = editor.keyDown({
        key: e.key,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: isMac ? e.metaKey : e.ctrlKey,
      })
      if (handled) e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) =>
      editor.keyUp({
        key: e.key,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: isMac ? e.metaKey : e.ctrlKey,
      })
    const onBlur = () => {
      editor.keyUp({ key: ' ', shift: false, alt: false, mod: false })
      editor.cancel()
    }
    const onCopy = (e: ClipboardEvent) => {
      if (isEditable(e.target) || hasTextSelection()) return
      const text = editor.copy()
      if (text && e.clipboardData) {
        e.clipboardData.setData('text/plain', text)
        e.preventDefault()
      }
    }
    const onCut = (e: ClipboardEvent) => {
      if (isEditable(e.target) || hasTextSelection()) return
      const text = editor.cut()
      if (text && e.clipboardData) {
        e.clipboardData.setData('text/plain', text)
        e.preventDefault()
      }
    }
    const addImages = (files: File[], at?: Vec) =>
      insertImages(editor, files, at).catch((error: unknown) =>
        onNoticeRef.current(
          navigator.onLine
            ? String((error as Error).message)
            : 'Images need a connection to upload.',
        ),
      )
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const images = imageFiles(e.clipboardData?.files)
      if (images.length > 0) {
        e.preventDefault()
        void addImages(images, lastPointer.current ?? undefined)
        return
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return
      e.preventDefault()
      const at = lastPointer.current ?? undefined
      if (editor.paste(text, at)) return
      pastePlainText(editor, text, at)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [editor, onShortcuts])

  return (
    <div ref={containerRef} className="board" style={{ cursor }}>
      <canvas
        ref={canvasRef}
        className="board-canvas"
        tabIndex={0}
        role="application"
        aria-roledescription="whiteboard"
        aria-label="Board. Use the toolbar or keyboard shortcuts to draw; press question mark for the list."
      />
      <TextEditor editor={editor} theme={theme} />
    </div>
  )
}

function pastePlainText(editor: Editor, text: string, at: Vec | undefined): void {
  const clean = text.slice(0, 5000)
  const size = 'm'
  const block = measureTextBlock(clean, FONT_SIZE[size], LINE_HEIGHT)
  const { width, height } = editor.viewport
  const center = editor.screenToWorld(at ?? { x: width / 2, y: height / 2 })
  editor.history.stopCapturing()
  const id = editor.board.create({
    type: 'text',
    x: center.x - block.w / 2,
    y: center.y - block.h / 2,
    ...block,
    text: clean,
    size,
    color: editor.style.color,
  })
  editor.setTool('select')
  editor.select([id])
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    return !['radio', 'checkbox', 'button', 'submit', 'range', 'color'].includes(target.type)
  }
  return target instanceof HTMLSelectElement
}

const NATIVE_CONTROL_KEYS = new Set([
  ' ',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Tab',
])

function shouldIgnoreKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing) return true
  if (isEditable(e.target)) return true
  if (document.querySelector('dialog[open]') || document.querySelector(':popover-open')) return true
  const target = e.target as HTMLElement | null
  const isControl =
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLAnchorElement
  return isControl && NATIVE_CONTROL_KEYS.has(e.key)
}

function hasTextSelection(): boolean {
  const selection = window.getSelection()
  return !!selection && selection.toString().length > 0
}
