import { PauseIcon, PlayIcon, XIcon } from '@phosphor-icons/react'
import { Board, Editor } from '@weft/core'
import { useEffect, useRef, useState } from 'react'
import type * as Y from 'yjs'
import { usePrefersReducedMotion } from '../app/theme.ts'
import type { Theme } from '../canvas/palette.ts'
import { Renderer } from '../canvas/renderer.ts'
import type { Session } from '../collab/session.ts'
import { Timeline, decodeReplay } from './timeline.ts'

const SPEEDS = [1, 4, 16]
const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

interface Stage {
  readonly doc: Y.Doc
  readonly board: Board
  readonly editor: Editor
  readonly renderer: Renderer
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; timeline: Timeline }

interface ReplayViewProps {
  readonly session: Session
  readonly theme: Theme
  readonly onClose: () => void
}

export function ReplayView({ session, theme, onClose }: ReplayViewProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    const dialog = ref.current!
    if (!dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    const abort = new AbortController()
    const scope = session.readOnly ? 'views' : 'rooms'
    fetch(`/api/${scope}/${session.room}/replay`, { signal: abort.signal })
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
      .then((data) => {
        const timeline = new Timeline(decodeReplay(new Uint8Array(data)))
        setLoad({ status: 'ready', timeline })
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoad({ status: 'error' })
      })
    return () => abort.abort()
  }, [session])

  return (
    <dialog ref={ref} className="replay" aria-labelledby="replay-title" onClose={onClose}>
      <div className="replay-head panel">
        <h2 id="replay-title">Replay</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close replay">
          <XIcon />
        </button>
      </div>
      {load.status === 'ready' ? (
        <Player timeline={load.timeline} theme={theme} />
      ) : (
        <p className="replay-note panel" role="status">
          {load.status === 'loading'
            ? 'Loading the board history…'
            : 'The history needs a connection to the server.'}
        </p>
      )}
    </dialog>
  )
}

function createStage(doc: Y.Doc, canvas: HTMLCanvasElement, theme: Theme): Stage {
  const board = new Board(doc)
  const editor = new Editor({ board, readOnly: true })
  return { doc, board, editor, renderer: new Renderer(canvas, editor, theme, () => true) }
}

function destroyStage({ board, editor, renderer }: Stage): void {
  renderer.destroy()
  editor.destroy()
  board.destroy()
}

function Player({ timeline, theme }: { timeline: Timeline; theme: Theme }) {
  const reducedMotion = usePrefersReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const themeRef = useRef(theme)
  const clock = useRef(0)
  const [index, setIndex] = useState(() => (reducedMotion ? timeline.length : 0))
  const [playing, setPlaying] = useState(() => !reducedMotion && timeline.length > 0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    themeRef.current = theme
    stageRef.current?.renderer.setTheme(theme)
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current!
    timeline.seek(timeline.length)
    const stage = createStage(timeline.doc, canvas, themeRef.current)
    stageRef.current = stage
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const { editor, renderer } = stageRef.current!
      editor.setViewport(width, height)
      renderer.resize(width, height, window.devicePixelRatio || 1)
    }
    resize()
    stage.editor.zoomToFit()
    const sizes = new ResizeObserver(resize)
    sizes.observe(canvas)
    return () => {
      sizes.disconnect()
      destroyStage(stageRef.current!)
      stageRef.current = null
    }
  }, [timeline])

  useEffect(() => {
    timeline.seek(index)
    const stage = stageRef.current!
    if (stage.doc === timeline.doc) return
    const next = createStage(timeline.doc, canvasRef.current!, themeRef.current)
    const { width, height } = canvasRef.current!.getBoundingClientRect()
    next.editor.setViewport(width, height)
    next.editor.setCamera(stage.editor.camera)
    next.renderer.resize(width, height, window.devicePixelRatio || 1)
    destroyStage(stage)
    stageRef.current = next
  }, [timeline, index])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      clock.current += (now - last) * speed
      last = now
      const next = timeline.indexAt(clock.current)
      setIndex(next)
      if (next < timeline.length) frame = requestAnimationFrame(tick)
      else setPlaying(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, timeline])

  const seek = (target: number) => {
    clock.current = timeline.timeAt(target)
    setIndex(target)
  }

  const toggle = () => {
    if (!playing && index >= timeline.length) seek(0)
    setPlaying(!playing)
  }

  const at = timeline.dateAt(index)
  const when = at === undefined ? '' : dateTime.format(at)
  const count = `${index} of ${timeline.length} ${timeline.length === 1 ? 'edit' : 'edits'}`

  return (
    <>
      <canvas
        ref={canvasRef}
        className="replay-canvas"
        role="img"
        aria-label={`The board after ${count}`}
      />
      <div className="replay-controls panel">
        <button
          type="button"
          className="icon-button"
          onClick={toggle}
          disabled={timeline.length === 0}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
        </button>
        <input
          type="range"
          className="replay-slider"
          min={0}
          max={timeline.length}
          step={1}
          value={index}
          disabled={timeline.length === 0}
          aria-label="Timeline"
          aria-valuetext={`${count}, ${when}`}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <output className="replay-time" data-testid="replay-summary">
          {timeline.length === 0 ? 'No edits recorded yet' : `${count} · ${when}`}
        </output>
        <fieldset className="segmented replay-speed">
          <legend className="visually-hidden">Playback speed</legend>
          {SPEEDS.map((s) => (
            <label key={s}>
              <input
                type="radio"
                name="replay-speed"
                value={s}
                checked={speed === s}
                onChange={() => setSpeed(s)}
              />
              <span>{s}×</span>
            </label>
          ))}
        </fieldset>
      </div>
    </>
  )
}
