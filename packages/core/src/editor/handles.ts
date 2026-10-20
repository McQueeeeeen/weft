import { worldToScreen, type Camera } from '../camera.ts'
import type { Box } from '../geometry/box.ts'
import { dist, type Vec } from '../geometry/vec.ts'
import { arrowEndpoints, type ShapeLookup } from '../model/geometry.ts'
import type { Shape } from '../model/shapes.ts'
import type { CursorKind, Handle, ResizeHandle } from './types.ts'

export interface HandlePosition {
  readonly handle: Handle
  readonly point: Vec
}

const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const MIN_SIZE_FOR_EDGE_HANDLES = 40

function resizeHandlePositions(bounds: Box, cam: Camera): HandlePosition[] {
  const a = worldToScreen(cam, { x: bounds.minX, y: bounds.minY })
  const b = worldToScreen(cam, { x: bounds.maxX, y: bounds.maxY })
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const positions: Record<ResizeHandle, Vec> = {
    nw: a,
    n: { x: cx, y: a.y },
    ne: { x: b.x, y: a.y },
    e: { x: b.x, y: cy },
    se: b,
    s: { x: cx, y: b.y },
    sw: { x: a.x, y: b.y },
    w: { x: a.x, y: cy },
  }
  const small = Math.min(b.x - a.x, b.y - a.y) < MIN_SIZE_FOR_EDGE_HANDLES
  return RESIZE_HANDLES.filter((h) => !small || h.length === 2).map((handle) => ({
    handle,
    point: positions[handle],
  }))
}

export function selectionHandles(
  selected: readonly Shape[],
  bounds: Box | null,
  cam: Camera,
  lookup: ShapeLookup,
): HandlePosition[] {
  const only = selected.length === 1 ? selected[0] : undefined
  if (only?.type === 'arrow') {
    const { start, end } = arrowEndpoints(only, lookup)
    return [
      { handle: 'start', point: worldToScreen(cam, start) },
      { handle: 'end', point: worldToScreen(cam, end) },
    ]
  }
  if (!bounds || selected.length === 0) return []
  return resizeHandlePositions(bounds, cam)
}

export function handleAt(
  handles: readonly HandlePosition[],
  screenPoint: Vec,
  radius: number,
): Handle | null {
  let best: Handle | null = null
  let bestDist = radius
  for (const { handle, point } of handles) {
    const d = dist(point, screenPoint)
    if (d <= bestDist) {
      best = handle
      bestDist = d
    }
  }
  return best
}

export function cursorForHandle(handle: Handle): CursorKind {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'start':
    case 'end':
      return 'move'
  }
}

export function resizeBox(
  start: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepAspect: boolean,
): Box {
  let { minX, minY, maxX, maxY } = start
  if (handle.includes('w')) minX += dx
  if (handle.includes('e')) maxX += dx
  if (handle.includes('n')) minY += dy
  if (handle.includes('s')) maxY += dy

  if (keepAspect) {
    const w0 = start.maxX - start.minX
    const h0 = start.maxY - start.minY
    if (w0 > 0 && h0 > 0) {
      const ratio = w0 / h0
      let w = maxX - minX
      let h = maxY - minY
      const horizontalOnly = handle === 'e' || handle === 'w'
      const verticalOnly = handle === 'n' || handle === 's'
      if (horizontalOnly || (!verticalOnly && Math.abs(w / w0) >= Math.abs(h / h0))) {
        h = (Math.abs(w) / ratio) * Math.sign(h || 1)
      } else {
        w = Math.abs(h) * ratio * Math.sign(w || 1)
      }
      if (handle.includes('w')) minX = maxX - w
      else maxX = minX + w
      if (handle.includes('n')) minY = maxY - h
      else if (handle.includes('s')) maxY = minY + h
      else {
        const cy = (start.minY + start.maxY) / 2
        minY = cy - h / 2
        maxY = cy + h / 2
      }
      if (verticalOnly) {
        const cx = (start.minX + start.maxX) / 2
        minX = cx - w / 2
        maxX = cx + w / 2
      }
    }
  }

  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  }
}
