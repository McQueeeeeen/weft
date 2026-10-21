import type { Editor, Vec } from '@weft/core'
import { useEffect, useRef } from 'react'
import { useEditor } from '../app/hooks.ts'
import type { Theme } from '../canvas/palette.ts'
import { Renderer } from '../canvas/renderer.ts'
import { bindKeyboard, bindPointer } from './board-input.ts'
import { TextEditor } from './TextEditor.tsx'

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
    const options = { lastPointer, onNotice: (m: string) => onNoticeRef.current(m) }
    const offPointer = bindPointer(canvasRef.current!, editor, options)
    const offKeyboard = bindKeyboard(editor, onShortcuts, options)
    return () => {
      offPointer()
      offKeyboard()
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
