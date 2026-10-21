import {
  FONT_SIZE,
  LINE_HEIGHT,
  type Editor,
  type KeyInput,
  type PointerInput,
  type Vec,
} from '@weft/core'
import { measureTextBlock } from '../canvas/text-layout.ts'
import { imageFiles, insertImages } from '../collab/assets.ts'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const LINE_DELTA_PX = 16
const NATIVE_CONTROL_KEYS = new Set([
  ' ',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Tab',
])

type Handlers = { [K in keyof WindowEventMap]?: (e: WindowEventMap[K]) => void }

function listen(target: EventTarget, handlers: Handlers): () => void {
  const entries = Object.entries(handlers) as [string, EventListener][]
  for (const [type, handler] of entries) target.addEventListener(type, handler, { passive: false })
  return () => {
    for (const [type, handler] of entries) target.removeEventListener(type, handler)
  }
}

const keyInput = (e: KeyboardEvent): KeyInput => ({
  key: e.key,
  shift: e.shiftKey,
  alt: e.altKey,
  mod: isMac ? e.metaKey : e.ctrlKey,
})

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    return !['radio', 'checkbox', 'button', 'submit', 'range', 'color'].includes(target.type)
  }
  return target instanceof HTMLSelectElement
}

function shouldIgnoreKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing || isEditable(e.target)) return true
  if (document.querySelector('dialog[open], :popover-open')) return true
  const isControl =
    e.target instanceof HTMLButtonElement ||
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLAnchorElement
  return isControl && NATIVE_CONTROL_KEYS.has(e.key)
}

const hasTextSelection = () => (window.getSelection()?.toString().length ?? 0) > 0

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

export interface InputOptions {
  readonly lastPointer: { current: Vec | null }
  readonly onNotice: (message: string) => void
}

const addImages = (
  editor: Editor,
  files: File[],
  at: Vec | undefined,
  onNotice: (m: string) => void,
) =>
  insertImages(editor, files, at).catch((error: unknown) =>
    onNotice(
      navigator.onLine ? String((error as Error).message) : 'Images need a connection to upload.',
    ),
  )

export function bindPointer(canvas: HTMLCanvasElement, editor: Editor, options: InputOptions) {
  const local = (e: MouseEvent): Vec => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const input = (e: PointerEvent | MouseEvent): PointerInput => {
    const point = local(e)
    options.lastPointer.current = point
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

  return listen(canvas, {
    pointerdown(e) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      canvas.focus({ preventScroll: true })
      editor.pointerDown(input(e))
    },
    pointermove(e) {
      const events = editor.tool === 'pen' && e.getCoalescedEvents ? e.getCoalescedEvents() : []
      for (const ev of events.length > 0 ? events : [e]) editor.pointerMove(input(ev))
    },
    pointerup(e) {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      editor.pointerUp(input(e))
    },
    pointercancel: () => editor.cancel(),
    pointerleave() {
      options.lastPointer.current = null
      editor.pointerLeave()
    },
    dblclick: (e) => editor.doubleClick(input(e)),
    wheel(e) {
      e.preventDefault()
      const scale = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_DELTA_PX : 1
      editor.wheel({
        point: local(e),
        deltaX: e.deltaX * scale,
        deltaY: e.deltaY * scale,
        mod: e.ctrlKey || e.metaKey,
      })
    },
    contextmenu: (e) => e.preventDefault(),
    dragover(e) {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    },
    drop(e) {
      const images = imageFiles(e.dataTransfer?.files)
      if (images.length === 0) return
      e.preventDefault()
      void addImages(editor, images, local(e), options.onNotice)
    },
  })
}

export function bindKeyboard(editor: Editor, onShortcuts: () => void, options: InputOptions) {
  const write = (e: ClipboardEvent, take: () => string | null) => {
    if (isEditable(e.target) || hasTextSelection()) return
    const text = take()
    if (!text || !e.clipboardData) return
    e.clipboardData.setData('text/plain', text)
    e.preventDefault()
  }

  return listen(window, {
    keydown(e) {
      if (shouldIgnoreKey(e)) return
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        return onShortcuts()
      }
      if (editor.keyDown(keyInput(e))) e.preventDefault()
    },
    keyup: (e) => editor.keyUp(keyInput(e)),
    blur() {
      editor.keyUp({ key: ' ', shift: false, alt: false, mod: false })
      editor.cancel()
    },
    copy: (e) => write(e, () => editor.copy()),
    cut: (e) => write(e, () => editor.cut()),
    paste(e) {
      if (isEditable(e.target)) return
      const at = options.lastPointer.current ?? undefined
      const images = imageFiles(e.clipboardData?.files)
      if (images.length > 0) {
        e.preventDefault()
        return void addImages(editor, images, at, options.onNotice)
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return
      e.preventDefault()
      if (!editor.paste(text, at)) pastePlainText(editor, text, at)
    },
  })
}
