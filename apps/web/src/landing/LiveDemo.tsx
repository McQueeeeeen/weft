import { cameraToFit, type PointerInput } from '@weft/core'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../app/theme.ts'
import type { Theme } from '../canvas/palette.ts'
import { Renderer } from '../canvas/renderer.ts'
import { Demo, SCENE } from './demo.ts'

export function LiveDemo({ theme }: { theme: Theme }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const themeRef = useRef(theme)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    themeRef.current = theme
    rendererRef.current?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    const demo = new Demo()
    const { editor } = demo
    const canvas = canvasRef.current!
    const container = containerRef.current!
    const renderer = new Renderer(canvas, editor, themeRef.current, () => reducedMotion)
    rendererRef.current = renderer

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      editor.setViewport(width, height)
      editor.setCamera(cameraToFit(SCENE, width, height, 16, 1))
      renderer.resize(width, height, window.devicePixelRatio || 1)
    }
    const sizes = new ResizeObserver(resize)
    sizes.observe(container)
    resize()
    const offCursor = editor.subscribe(() => (container.style.cursor = editor.cursor))
    void document.fonts.ready.then(() => renderer.invalidate())

    let visible = false
    const sync = () => demo.setActive(visible && !document.hidden)
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      sync()
    })
    seen.observe(container)
    document.addEventListener('visibilitychange', sync)

    const toInput = (e: PointerEvent): PointerInput => {
      const rect = canvas.getBoundingClientRect()
      return {
        point: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        pointerId: e.pointerId,
        pointerType: 'mouse',
        button: e.button,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: false,
      }
    }
    const mouse = (handler: (e: PointerEvent) => void) => (e: PointerEvent) => {
      if (e.pointerType !== 'touch') handler(e)
    }
    const down = mouse((e) => {
      canvas.setPointerCapture(e.pointerId)
      editor.pointerDown(toInput(e))
    })
    const move = mouse((e) => editor.pointerMove(toInput(e)))
    const up = mouse((e) => editor.pointerUp(toInput(e)))
    const leave = () => editor.pointerLeave()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', leave)

    demo.start(!reducedMotion)

    return () => {
      offCursor()
      sizes.disconnect()
      seen.disconnect()
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointerleave', leave)
      renderer.destroy()
      rendererRef.current = null
      demo.destroy()
    }
  }, [reducedMotion])

  return (
    <div ref={containerRef} className="demo-board">
      <canvas
        ref={canvasRef}
        className="demo-canvas"
        role="img"
        aria-label="A live board where Mira and Theo plan launch week: notes move, a new note is typed and linked with an arrow, and a heading is circled."
      />
    </div>
  )
}
