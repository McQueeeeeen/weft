import {
  boxExpand,
  boxUnionAll,
  viewportBox,
  worldToScreen,
  screenToWorld,
  type Box,
  type Camera,
  type Editor,
  type Presence,
} from '@weft/core'
import { useEffect, useRef } from 'react'
import { thread, withAlpha, type Theme } from '../canvas/palette.ts'

const WIDTH = 200
const HEIGHT = 128
const PADDING = 8

function fit(box: Box): Camera {
  const z = Math.min(
    (WIDTH - PADDING * 2) / Math.max(1, box.maxX - box.minX),
    (HEIGHT - PADDING * 2) / Math.max(1, box.maxY - box.minY),
  )
  return {
    x: (box.minX + box.maxX) / 2 - WIDTH / 2 / z,
    y: (box.minY + box.maxY) / 2 - HEIGHT / 2 / z,
    z,
  }
}

export function Minimap({
  editor,
  presence,
  theme,
}: {
  editor: Editor
  presence: Presence
  theme: Theme
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const camera = useRef<Camera>({ x: 0, y: 0, z: 1 })
  const dragging = useRef(false)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    let frame = 0

    const rect = (box: Box) => {
      const a = worldToScreen(camera.current, { x: box.minX, y: box.minY })
      const b = worldToScreen(camera.current, { x: box.maxX, y: box.maxY })
      return [a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y)] as const
    }

    const draw = () => {
      frame = 0
      const { width, height } = editor.viewport
      const view = viewportBox(editor.camera, width, height)
      const shapes = editor.board.all()
      const peers = presence.peers()
      const content = editor.board.boundsOfAll(shapes.map((s) => s.id))
      const views = peers.flatMap((p) => (p.view ? [p.view] : []))
      if (!dragging.current) {
        camera.current = fit(
          boxExpand(boxUnionAll([view, ...views, ...(content ? [content] : [])])!, 40),
        )
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      for (const shape of shapes) {
        const box = editor.board.boundsOf(shape.id)
        if (!box) continue
        const colors = theme.content[shape.color]
        ctx.fillStyle =
          shape.type === 'sticky'
            ? colors.sticky
            : shape.type === 'frame'
              ? theme.surface
              : withAlpha(colors.stroke, 0.55)
        ctx.fillRect(...rect(box))
      }
      ctx.lineWidth = 1.5
      for (const peer of peers) {
        if (!peer.view) continue
        ctx.strokeStyle = thread(peer.user.color).fill
        ctx.strokeRect(...rect(peer.view))
      }
      ctx.strokeStyle = theme.name === 'light' ? '#14161A' : '#E9EBEE'
      ctx.strokeRect(...rect(view))
    }

    const schedule = () => {
      frame ||= requestAnimationFrame(draw)
    }
    const offEditor = editor.subscribe(schedule)
    const offPresence = presence.subscribe(schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      offEditor()
      offPresence()
    }
  }, [editor, presence, theme])

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return
    const bounds = e.currentTarget.getBoundingClientRect()
    editor.centerOn(
      screenToWorld(camera.current, { x: e.clientX - bounds.left, y: e.clientY - bounds.top }),
    )
  }

  return (
    <canvas
      ref={ref}
      className="minimap panel"
      style={{ width: WIDTH, height: HEIGHT }}
      aria-label="Board overview. Click or drag to move your view."
      role="img"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        jump(e)
      }}
      onPointerMove={jump}
      onPointerUp={() => (dragging.current = false)}
    />
  )
}
