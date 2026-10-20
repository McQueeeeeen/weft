import {
  Board,
  Editor,
  FONT_SIZE,
  LINE_HEIGHT,
  Presence,
  boxFromRect,
  type PresenceUser,
  type ShapeInput,
  type Vec,
} from '@weft/core'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { measureTextBlock } from '../canvas/text-layout.ts'

export const SCENE = boxFromRect(0, 0, 1120, 600)

const NOTE = 170
const ids = { frame: 'demo-frame', copy: 'demo-copy', banner: 'demo-banner', video: 'demo-video' }
const title = 'Ready by Friday'
const checklist = 'Landing page\nOffline mode\nDemo video\nRelease notes'

const SEED: (ShapeInput & { id: string })[] = [
  {
    id: ids.frame,
    type: 'frame',
    x: 40,
    y: 60,
    w: 660,
    h: 500,
    title: 'Launch week',
    color: 'ink',
  },
  {
    id: ids.copy,
    type: 'sticky',
    x: 80,
    y: 100,
    w: NOTE,
    h: NOTE,
    text: 'Write the hero copy',
    color: 'yellow',
  },
  {
    id: ids.banner,
    type: 'sticky',
    x: 290,
    y: 100,
    w: NOTE,
    h: NOTE,
    text: 'Fix the offline banner',
    color: 'blue',
  },
  {
    id: ids.video,
    type: 'sticky',
    x: 500,
    y: 100,
    w: NOTE,
    h: NOTE,
    text: 'Record a demo',
    color: 'green',
  },
  {
    id: 'demo-title',
    type: 'text',
    x: 780,
    y: 96,
    ...measureTextBlock(title, FONT_SIZE.m, LINE_HEIGHT),
    text: title,
    size: 'm',
    color: 'ink',
  },
  {
    id: 'demo-list',
    type: 'text',
    x: 782,
    y: 170,
    ...measureTextBlock(checklist, FONT_SIZE.s, LINE_HEIGHT),
    text: checklist,
    size: 's',
    color: 'blue',
  },
]

class Client {
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)
  readonly board = new Board(this.doc)
  readonly presence: Presence

  constructor(user: PresenceUser) {
    this.presence = new Presence(this.awareness, user)
  }

  destroy() {
    this.presence.destroy()
    this.awareness.destroy()
    this.doc.destroy()
  }
}

function link(a: Client, b: Client) {
  const forward = (from: Client, to: Client) => {
    from.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== to) Y.applyUpdate(to.doc, update, from)
    })
    from.awareness.on(
      'update',
      (
        { added, updated, removed }: Record<'added' | 'updated' | 'removed', number[]>,
        origin: unknown,
      ) => {
        if (origin === to) return
        const changed = [...added, ...updated, ...removed]
        applyAwarenessUpdate(to.awareness, encodeAwarenessUpdate(from.awareness, changed), from)
      },
    )
  }
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc))
  forward(a, b)
  forward(b, a)
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class Demo {
  private readonly you = new Client({ name: 'You', color: 0 })
  private readonly mira = new Client({ name: 'Mira', color: 1 })
  private readonly theo = new Client({ name: 'Theo', color: 6 })
  readonly editor: Editor
  private active = false
  private stopped = false
  private wake: (() => void) | null = null

  constructor() {
    this.you.board.createMany(SEED)
    link(this.you, this.mira)
    link(this.you, this.theo)
    this.editor = new Editor({ board: this.you.board, presence: this.you.presence })
  }

  setActive(active: boolean) {
    this.active = active
    if (active) this.wake?.()
  }

  start(animate: boolean) {
    if (!animate) {
      this.mira.presence.setCursor({ x: 380, y: 230 })
      this.mira.presence.setSelection([ids.banner])
      this.theo.presence.setCursor({ x: 930, y: 270 })
      return
    }
    void this.loop()
  }

  destroy() {
    this.stopped = true
    this.wake?.()
    this.editor.destroy()
    for (const c of [this.you, this.mira, this.theo]) c.destroy()
  }

  private async frame(): Promise<number> {
    while (!this.active && !this.stopped) await new Promise<void>((r) => (this.wake = r))
    if (this.stopped) throw new Error('stopped')
    return new Promise((r) => requestAnimationFrame(r))
  }

  private async tween(ms: number, step: (t: number) => void) {
    let elapsed = 0
    let last = await this.frame()
    while (elapsed < ms) {
      const now = await this.frame()
      elapsed += Math.min(now - last, 50)
      last = now
      step(ease(Math.min(1, elapsed / ms)))
    }
  }

  private wait(ms: number) {
    return this.tween(ms, () => {})
  }

  private glide(who: Client, to: Vec, ms = 700) {
    const from = this.cursorOf(who)
    return this.tween(ms, (t) =>
      who.presence.setCursor({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
    )
  }

  private cursorOf(who: Client): Vec {
    const state = who.awareness.getLocalState() as { cursor: Vec | null } | null
    return state?.cursor ?? { x: SCENE.maxX + 40, y: SCENE.maxY / 2 }
  }

  private async drag(who: Client, id: string, to: Vec, ms = 900) {
    const shape = who.board.get(id)
    if (!shape || shape.type === 'arrow') return
    const grab = this.cursorOf(who)
    const offset = { x: grab.x - shape.x, y: grab.y - shape.y }
    const from = { x: shape.x, y: shape.y }
    await this.tween(ms, (t) => {
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      who.board.update(id, { x, y })
      who.presence.setCursor({ x: x + offset.x, y: y + offset.y })
    })
  }

  private async type(who: Client, id: string, text: string) {
    for (let i = 1; i <= text.length; i++) {
      who.board.update(id, { text: text.slice(0, i) })
      await this.wait(45 + Math.random() * 60)
    }
  }

  private async loop() {
    const { mira, theo } = this
    try {
      for (;;) {
        await this.wait(600)
        await Promise.all([
          this.glide(mira, { x: 370, y: 140 }, 900),
          this.glide(theo, { x: 900, y: 420 }, 1100),
        ])
        mira.presence.setSelection([ids.banner])
        await this.drag(mira, ids.banner, { x: 290, y: 340 })
        mira.presence.setSelection([])

        await this.glide(theo, { x: 140, y: 380 }, 800)
        const review = 'Ask Sam for a review'
        const note = theo.board.create({
          type: 'sticky',
          x: 80,
          y: 340,
          w: NOTE,
          h: NOTE,
          text: '',
          color: 'orange',
        })
        theo.presence.setSelection([note])
        await Promise.all([
          this.type(theo, note, review),
          this.glide(mira, { x: 600, y: 470 }, 1200),
        ])
        theo.presence.setSelection([])

        await this.glide(theo, { x: 250, y: 425 }, 500)
        const arrow = theo.board.create({
          type: 'arrow',
          x1: 250,
          y1: 425,
          x2: 250,
          y2: 425,
          start: note,
          end: null,
          size: 'm',
          color: 'ink',
          route: 'straight',
        })
        await this.tween(700, (t) => {
          const x2 = 250 + 40 * t
          theo.board.update(arrow, { x2, y2: 425 })
          theo.presence.setCursor({ x: x2, y: 425 })
        })
        theo.board.update(arrow, { end: ids.banner })

        await this.glide(mira, { x: 760, y: 130 }, 700)
        const loop = mira.board.create({
          type: 'pen',
          x: 760,
          y: 130,
          w: 0,
          h: 0,
          points: [0, 0],
          size: 'm',
          color: 'red',
        })
        const center = { x: 880, y: 116 }
        await this.tween(1100, (t) => {
          const points: number[] = []
          const steps = Math.max(2, Math.round(48 * t))
          for (let i = 0; i <= steps; i++) {
            const a = Math.PI * 0.9 + (i / 48) * Math.PI * 2.15
            points.push(center.x + Math.cos(a) * 130 - 750, center.y + Math.sin(a) * 42 - 74)
          }
          const xs = points.filter((_, i) => i % 2 === 0)
          const ys = points.filter((_, i) => i % 2 === 1)
          mira.board.update(loop, {
            x: 750,
            y: 74,
            w: Math.max(...xs),
            h: Math.max(...ys),
            points,
          })
          mira.presence.setCursor({ x: 750 + xs.at(-1)!, y: 74 + ys.at(-1)! })
        })

        await Promise.all([
          this.glide(mira, { x: SCENE.maxX + 60, y: 240 }, 1200),
          this.glide(theo, { x: 470, y: SCENE.maxY + 40 }, 1400),
        ])
        await this.wait(2400)

        await this.glide(theo, { x: 160, y: 420 }, 900)
        theo.presence.setSelection([note, arrow])
        await this.wait(500)
        theo.board.delete([note, arrow])
        theo.presence.setSelection([])
        await this.glide(mira, { x: 880, y: 116 }, 900)
        mira.board.delete([loop])
        await this.glide(mira, { x: 370, y: 380 }, 700)
        mira.presence.setSelection([ids.banner])
        await this.drag(mira, ids.banner, { x: 290, y: 100 })
        mira.presence.setSelection([])
      }
    } catch {
      return
    }
  }
}
