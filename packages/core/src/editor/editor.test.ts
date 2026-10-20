import { describe, expect, it } from 'vitest'
import { worldToScreen } from '../camera.ts'
import { arrowEndpoints } from '../model/geometry.ts'
import { Board } from '../model/board.ts'
import { createEditor, key, pointer, rect } from '../test-utils.ts'
import { Editor } from './editor.ts'

describe('Editor', () => {
  describe('creating shapes', () => {
    it('draws a rectangle by dragging and returns to the select tool', () => {
      const editor = createEditor()
      editor.setTool('rect')
      pointer(editor).drag({ x: 10, y: 20 }, { x: 110, y: 70 })
      const [shape] = editor.board.all()
      expect(shape).toMatchObject({ type: 'rect', x: 10, y: 20, w: 100, h: 50 })
      expect(editor.tool).toBe('select')
      expect(editor.selection).toEqual([shape!.id])
    })

    it('undoes a drawn shape in one step even if the drag paused', async () => {
      const editor = createEditor()
      editor.setTool('rect')
      const p = pointer(editor)
      p.down(0, 0)
      p.move(50, 50)
      await new Promise((resolve) => setTimeout(resolve, 450))
      p.move(100, 100)
      p.up(100, 100)
      editor.undo()
      expect(editor.board.size).toBe(0)
    })

    it('draws from any corner and constrains to a square with shift', () => {
      const editor = createEditor()
      editor.setTool('ellipse')
      pointer(editor).drag({ x: 100, y: 100 }, { x: 40, y: 80 }, { shift: true })
      expect(editor.board.all()[0]).toMatchObject({ x: 40, y: 40, w: 60, h: 60 })
    })

    it('places a default-sized shape on a plain click', () => {
      const editor = createEditor()
      editor.setTool('rect')
      pointer(editor).click(0, 0)
      expect(editor.board.all()[0]).toMatchObject({ x: -80, y: -50, w: 160, h: 100 })
    })

    it('uses the current style for new shapes', () => {
      const editor = createEditor()
      editor.setStyle({ color: 'green', fill: 'tint', size: 'l' })
      editor.setTool('rect')
      pointer(editor).click(0, 0)
      expect(editor.board.all()[0]).toMatchObject({ color: 'green', fill: 'tint', size: 'l' })
    })

    it('creates a sticky note and starts editing it', () => {
      const editor = createEditor()
      editor.setTool('sticky')
      pointer(editor).click(0, 0)
      const [sticky] = editor.board.all()
      expect(sticky).toMatchObject({ type: 'sticky', color: 'yellow', text: '' })
      expect(editor.editingId).toBe(sticky!.id)
    })

    it('removes a text box left empty', () => {
      const editor = createEditor()
      editor.setTool('text')
      pointer(editor).click(0, 0)
      expect(editor.board.size).toBe(1)
      editor.stopEditing()
      expect(editor.board.size).toBe(0)
    })

    it('creates text on double-click on empty canvas', () => {
      const editor = createEditor()
      pointer(editor).dblclick(0, 0)
      expect(editor.board.all()[0]).toMatchObject({ type: 'text' })
      expect(editor.editingId).not.toBeNull()
    })

    it('draws a freehand stroke and simplifies it', () => {
      let t = 0
      const editor = createEditor(undefined, () => (t += 100))
      editor.setTool('pen')
      const p = pointer(editor)
      p.down(0, 0)
      for (let x = 1; x <= 100; x++) p.move(x, 0)
      p.up(100, 0)
      const [stroke] = editor.board.all()
      expect(stroke).toMatchObject({ type: 'pen', x: 0, y: 0, w: 100, h: 0 })
      if (stroke?.type !== 'pen') throw new Error('expected pen')
      expect(stroke.points).toEqual([0, 0, 100, 0])
      expect(editor.tool).toBe('pen')
    })
  })

  describe('arrows', () => {
    it('binds both ends to the shapes they start and end on', () => {
      const editor = createEditor()
      const a = editor.board.create(rect(0, 0, 100, 100))
      const b = editor.board.create(rect(300, 0, 100, 100))
      editor.setTool('arrow')
      pointer(editor).drag({ x: 50, y: 50 }, { x: 350, y: 50 })
      const arrow = editor.board.all().find((s) => s.type === 'arrow')
      expect(arrow).toMatchObject({ start: a, end: b })
    })

    it('follows a bound shape when it is moved', () => {
      const editor = createEditor()
      editor.board.create(rect(0, 0, 100, 100))
      const b = editor.board.create(rect(300, 0, 100, 100))
      editor.setTool('arrow')
      pointer(editor).drag({ x: 50, y: 50 }, { x: 350, y: 50 })
      editor.board.update(b, { y: 300 })
      const arrow = editor.board.all().find((s) => s.type === 'arrow')
      if (arrow?.type !== 'arrow') throw new Error('expected arrow')
      expect(arrowEndpoints(arrow, editor.board.lookup).end.y).toBeGreaterThan(290)
    })

    it('discards an arrow too short to see', () => {
      const editor = createEditor()
      editor.setTool('arrow')
      pointer(editor).drag({ x: 0, y: 0 }, { x: 3, y: 0 })
      expect(editor.board.size).toBe(0)
    })

    it('rebinds an end by dragging its handle', () => {
      const editor = createEditor()
      const target = editor.board.create(rect(500, 500, 100, 100))
      editor.setTool('arrow')
      pointer(editor).drag({ x: 0, y: 0 }, { x: 200, y: 0 })
      const arrowId = editor.selection[0]!
      pointer(editor).drag({ x: 200, y: 0 }, { x: 550, y: 550 })
      expect(editor.board.get(arrowId)).toMatchObject({ end: target })
    })
  })

  describe('selection', () => {
    it('selects on click and clears on empty canvas', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 100))
      const p = pointer(editor)
      p.click(50, 50)
      expect(editor.selection).toEqual([id])
      p.click(500, 300)
      expect(editor.selection).toEqual([])
    })

    it('toggles membership with shift', () => {
      const editor = createEditor()
      const a = editor.board.create(rect(0, 0, 100, 100))
      const b = editor.board.create(rect(200, 0, 100, 100))
      const p = pointer(editor)
      p.click(50, 50)
      p.click(250, 50, { shift: true })
      expect(editor.selection).toEqual([a, b])
      p.click(50, 50, { shift: true })
      expect(editor.selection).toEqual([b])
    })

    it('selects shapes fully inside a marquee', () => {
      const editor = createEditor()
      const inside = editor.board.create(rect(10, 10, 20, 20))
      editor.board.create(rect(90, 90, 50, 50))
      pointer(editor).drag({ x: 0, y: 0 }, { x: 100, y: 100 })
      expect(editor.selection).toEqual([inside])
      expect(editor.marquee).toBeNull()
    })

    it('selects everything with mod+A', () => {
      const editor = createEditor()
      editor.board.create(rect(0, 0, 10, 10))
      editor.board.create(rect(20, 0, 10, 10))
      expect(editor.keyDown(key('a', { mod: true }))).toBe(true)
      expect(editor.selection).toHaveLength(2)
    })

    it('drops deleted shapes from the selection, including deletes by peers', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 10, 10))
      editor.select([id])
      editor.board.delete([id])
      expect(editor.selection).toEqual([])
    })
  })

  describe('transforming', () => {
    it('moves the selection by dragging, as one undo step', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 100))
      editor.history.stopCapturing()
      pointer(editor).drag({ x: 50, y: 50 }, { x: 150, y: 80 })
      expect(editor.board.get(id)).toMatchObject({ x: 100, y: 30 })
      editor.undo()
      expect(editor.board.get(id)).toMatchObject({ x: 0, y: 0 })
    })

    it('locks movement to one axis with shift', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 100))
      pointer(editor).drag({ x: 50, y: 50 }, { x: 150, y: 70 }, { shift: true })
      expect(editor.board.get(id)).toMatchObject({ x: 100, y: 0 })
    })

    it('duplicates while dragging with alt', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 100))
      pointer(editor).drag({ x: 50, y: 50 }, { x: 250, y: 50 }, { alt: true })
      expect(editor.board.size).toBe(2)
      expect(editor.board.get(id)).toMatchObject({ x: 0 })
      expect(editor.selectedShapes()[0]).toMatchObject({ x: 200 })
    })

    it('resizes from a corner handle', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 100))
      editor.select([id])
      pointer(editor).drag({ x: 100, y: 100 }, { x: 200, y: 150 })
      expect(editor.board.get(id)).toMatchObject({ x: 0, y: 0, w: 200, h: 150 })
    })

    it('keeps the aspect ratio when resizing with shift', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 50))
      editor.select([id])
      pointer(editor).drag({ x: 100, y: 50 }, { x: 300, y: 60 }, { shift: true })
      expect(editor.board.get(id)).toMatchObject({ w: 300, h: 150 })
    })

    it('scales a multi-selection around its shared frame', () => {
      const editor = createEditor()
      const a = editor.board.create(rect(0, 0, 50, 50))
      const b = editor.board.create(rect(50, 50, 50, 50))
      editor.select([a, b])
      pointer(editor).drag({ x: 100, y: 100 }, { x: 200, y: 200 })
      expect(editor.board.get(a)).toMatchObject({ x: 0, y: 0, w: 100, h: 100 })
      expect(editor.board.get(b)).toMatchObject({ x: 100, y: 100, w: 100, h: 100 })
    })

    it('reverts a drag cancelled with Escape', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 100, 100))
      const p = pointer(editor)
      p.down(50, 50)
      p.move(150, 150)
      p.move(300, 300)
      editor.keyDown(key('Escape'))
      expect(editor.board.get(id)).toMatchObject({ x: 0, y: 0 })
      expect(editor.isInteracting).toBe(false)
    })

    it('nudges with the arrow keys', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 10, 10))
      editor.select([id])
      editor.keyDown(key('ArrowRight'))
      editor.keyDown(key('ArrowDown', { shift: true }))
      expect(editor.board.get(id)).toMatchObject({ x: 1, y: 10 })
    })

    it('applies style changes to the selection', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 10, 10))
      editor.select([id])
      editor.setStyle({ color: 'violet', fill: 'none' })
      expect(editor.board.get(id)).toMatchObject({ color: 'violet', fill: 'none' })
      expect(editor.style).toMatchObject({ color: 'violet', fill: 'none' })
    })
  })

  describe('clipboard', () => {
    it('round-trips through copy and paste with new ids', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 10, 10))
      editor.select([id])
      const text = editor.copy()!
      expect(editor.paste(text)).toBe(true)
      expect(editor.board.size).toBe(2)
      expect(editor.selection[0]).not.toBe(id)
      expect(editor.selectedShapes()[0]).toMatchObject({ x: 24, y: 24 })
    })

    it('keeps bindings inside the pasted group and drops the rest', () => {
      const editor = createEditor()
      const a = editor.board.create(rect(0, 0, 100, 100))
      const b = editor.board.create(rect(300, 0, 100, 100))
      editor.setTool('arrow')
      pointer(editor).drag({ x: 50, y: 50 }, { x: 350, y: 50 })
      const arrow = editor.selection[0]!

      editor.select([a, arrow])
      editor.paste(editor.copy()!)
      const pasted = editor.selectedShapes()
      const newArrow = pasted.find((s) => s.type === 'arrow')
      const newRect = pasted.find((s) => s.type === 'rect')
      expect(newArrow).toMatchObject({ start: newRect!.id, end: null })
      expect(b).toBeTruthy()
    })

    it('rejects foreign clipboard content', () => {
      const editor = createEditor()
      expect(editor.paste('hello')).toBe(false)
      expect(editor.paste(JSON.stringify({ format: 'other', shapes: [] }))).toBe(false)
      expect(editor.board.size).toBe(0)
    })

    it('cuts', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 10, 10))
      editor.select([id])
      expect(editor.cut()).not.toBeNull()
      expect(editor.board.size).toBe(0)
    })
  })

  describe('camera', () => {
    it('zooms around the pointer with mod+wheel', () => {
      const editor = createEditor()
      const anchor = { x: 200, y: 150 }
      const before = editor.screenToWorld(anchor)
      editor.wheel({ point: anchor, deltaX: 0, deltaY: -40, mod: true })
      expect(editor.camera.z).toBeGreaterThan(1)
      const after = editor.screenToWorld(anchor)
      expect(after.x).toBeCloseTo(before.x)
      expect(after.y).toBeCloseTo(before.y)
    })

    it('pans with a plain wheel and with the hand tool', () => {
      const editor = createEditor()
      const start = editor.camera
      editor.wheel({ point: { x: 0, y: 0 }, deltaX: 10, deltaY: 20, mod: false })
      expect(editor.camera).toMatchObject({ x: start.x + 10, y: start.y + 20 })
      editor.setTool('hand')
      editor.pointerDown({
        point: { x: 0, y: 0 },
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        shift: false,
        alt: false,
        mod: false,
      })
      editor.pointerMove({
        point: { x: 50, y: 0 },
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        shift: false,
        alt: false,
        mod: false,
      })
      expect(editor.camera.x).toBeCloseTo(start.x + 10 - 50)
    })

    it('pinch-zooms with two fingers around their midpoint', () => {
      const editor = createEditor()
      const touch = (id: number, x: number, y: number) => ({
        point: { x, y },
        pointerId: id,
        pointerType: 'touch' as const,
        button: 0,
        shift: false,
        alt: false,
        mod: false,
      })
      const anchorWorld = editor.screenToWorld({ x: 500, y: 400 })
      editor.pointerDown(touch(1, 450, 400))
      editor.pointerDown(touch(2, 550, 400))
      editor.pointerMove(touch(1, 400, 400))
      editor.pointerMove(touch(2, 600, 400))
      expect(editor.camera.z).toBeCloseTo(2)
      const after = editor.screenToWorld({ x: 500, y: 400 })
      expect(after.x).toBeCloseTo(anchorWorld.x)
      editor.pointerUp(touch(1, 400, 400))
      editor.pointerUp(touch(2, 600, 400))
      expect(editor.board.size).toBe(0)
    })

    it('fits all content in view', () => {
      const editor = createEditor()
      editor.board.create(rect(5000, 5000, 100, 100))
      editor.zoomToFit()
      const center = worldToScreen(editor.camera, { x: 5050, y: 5050 })
      expect(center.x).toBeCloseTo(500)
      expect(center.y).toBeCloseTo(400)
    })
  })

  describe('keyboard', () => {
    it('switches tools with single-letter shortcuts', () => {
      const editor = createEditor()
      editor.keyDown(key('r'))
      expect(editor.tool).toBe('rect')
      editor.keyDown(key('Escape'))
      expect(editor.tool).toBe('select')
    })

    it('leaves keys alone while a text is being edited', () => {
      const editor = createEditor()
      editor.setTool('sticky')
      pointer(editor).click(0, 0)
      expect(editor.keyDown(key('r'))).toBe(false)
      expect(editor.tool).toBe('select')
      expect(editor.keyDown(key('Escape'))).toBe(true)
      expect(editor.editingId).toBeNull()
    })

    it('deletes the selection and undoes it', () => {
      const editor = createEditor()
      const id = editor.board.create(rect(0, 0, 10, 10))
      editor.select([id])
      editor.keyDown(key('Delete'))
      expect(editor.board.size).toBe(0)
      editor.keyDown(key('z', { mod: true }))
      expect(editor.board.has(id)).toBe(true)
      expect(editor.selection).toEqual([id])
    })

    it('holds space to pan with the primary button', () => {
      const editor = createEditor()
      editor.board.create(rect(0, 0, 100, 100))
      editor.keyDown(key(' '))
      const before = editor.camera
      pointer(editor).drag({ x: 50, y: 50 }, { x: 150, y: 50 })
      editor.keyUp(key(' '))
      expect(editor.camera.x).not.toBe(before.x)
      expect(editor.board.all()[0]).toMatchObject({ x: 0 })
    })
  })

  describe('frames', () => {
    it('draws a frame behind existing content', () => {
      const editor = createEditor()
      const note = editor.board.create(rect(50, 50, 40, 40))
      editor.setTool('frame')
      pointer(editor).drag({ x: 0, y: 0 }, { x: 300, y: 200 })
      const [first, second] = editor.board.all()
      expect(first).toMatchObject({ type: 'frame', title: 'Frame 1', w: 300, h: 200 })
      expect(second!.id).toBe(note)
    })

    it('moves the shapes inside a frame along with it', () => {
      const editor = createEditor()
      const inside = editor.board.create(rect(50, 50, 40, 40))
      const outside = editor.board.create(rect(500, 50, 40, 40))
      const frame = editor.board.create({
        type: 'frame',
        x: 0,
        y: 0,
        w: 300,
        h: 200,
        title: 'A',
        color: 'ink',
      })
      pointer(editor).drag({ x: 20, y: -10 }, { x: 120, y: -10 })
      expect(editor.board.get(frame)).toMatchObject({ x: 100 })
      expect(editor.board.get(inside)).toMatchObject({ x: 150 })
      expect(editor.board.get(outside)).toMatchObject({ x: 500 })
    })

    it('renames a frame by double-clicking its title', () => {
      const editor = createEditor()
      const frame = editor.board.create({
        type: 'frame',
        x: 0,
        y: 0,
        w: 300,
        h: 200,
        title: 'A',
        color: 'ink',
      })
      pointer(editor).dblclick(20, -10)
      expect(editor.editingId).toBe(frame)
      editor.updateText(frame, 'Backlog')
      expect(editor.board.get(frame)).toMatchObject({ title: 'Backlog' })
    })
  })

  describe('read-only', () => {
    it('allows looking around but never changes the document', () => {
      const board = new Board()
      const id = board.create(rect(0, 0, 100, 100))
      const editor = new Editor({ board, readOnly: true })
      editor.setViewport(1000, 800)
      const p = pointer(editor)

      editor.setTool('rect')
      expect(editor.tool).toBe('select')
      p.click(50, 50)
      expect(editor.selection).toEqual([id])
      expect(editor.handles()).toEqual([])
      p.drag({ x: 50, y: 50 }, { x: 250, y: 250 })
      editor.keyDown(key('Delete'))
      editor.keyDown(key('ArrowRight'))
      p.dblclick(400, 400)
      expect(editor.paste(editor.copy()!)).toBe(false)
      expect(board.size).toBe(1)
      expect(board.get(id)).toMatchObject({ x: 0, y: 0 })

      editor.setTool('hand')
      expect(editor.tool).toBe('hand')
    })
  })
})
