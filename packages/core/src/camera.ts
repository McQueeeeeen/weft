import { boxCenter, boxHeight, boxWidth, type Box } from './geometry/box.ts'
import type { Vec } from './geometry/vec.ts'

/** (x, y) is the world point shown at the top-left of the viewport; z is the zoom factor. */
export interface Camera {
  readonly x: number
  readonly y: number
  readonly z: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const screenToWorld = (cam: Camera, p: Vec): Vec => ({
  x: p.x / cam.z + cam.x,
  y: p.y / cam.z + cam.y,
})

export const worldToScreen = (cam: Camera, p: Vec): Vec => ({
  x: (p.x - cam.x) * cam.z,
  y: (p.y - cam.y) * cam.z,
})

/** Changes zoom while keeping the world point under `anchor` (screen space) fixed. */
export function zoomAt(cam: Camera, anchor: Vec, nextZoom: number): Camera {
  const z = clampZoom(nextZoom)
  const world = screenToWorld(cam, anchor)
  return { x: world.x - anchor.x / z, y: world.y - anchor.y / z, z }
}

/** Pans by a screen-space delta. */
export const panBy = (cam: Camera, dx: number, dy: number): Camera => ({
  x: cam.x - dx / cam.z,
  y: cam.y - dy / cam.z,
  z: cam.z,
})

export const viewportBox = (cam: Camera, width: number, height: number): Box => ({
  minX: cam.x,
  minY: cam.y,
  maxX: cam.x + width / cam.z,
  maxY: cam.y + height / cam.z,
})

/** Camera that fits `box` in the viewport with `padding` screen pixels around it. */
export function cameraToFit(
  box: Box,
  width: number,
  height: number,
  padding = 64,
  maxZoom = 1,
): Camera {
  const availableW = Math.max(1, width - padding * 2)
  const availableH = Math.max(1, height - padding * 2)
  const z = clampZoom(
    Math.min(
      maxZoom,
      availableW / Math.max(1, boxWidth(box)),
      availableH / Math.max(1, boxHeight(box)),
    ),
  )
  const c = boxCenter(box)
  return { x: c.x - width / 2 / z, y: c.y - height / 2 / z, z }
}
