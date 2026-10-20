import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  cameraToFit,
  panBy,
  screenToWorld,
  viewportBox,
  worldToScreen,
  zoomAt,
} from './camera.ts'

describe('camera', () => {
  const cam = { x: 100, y: -50, z: 2 }

  it('round-trips between screen and world space', () => {
    const p = { x: 123, y: 456 }
    const back = worldToScreen(cam, screenToWorld(cam, p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it('keeps the anchor fixed while zooming', () => {
    const anchor = { x: 300, y: 200 }
    const next = zoomAt(cam, anchor, 3.5)
    expect(screenToWorld(next, anchor).x).toBeCloseTo(screenToWorld(cam, anchor).x)
    expect(screenToWorld(next, anchor).y).toBeCloseTo(screenToWorld(cam, anchor).y)
  })

  it('clamps zoom', () => {
    expect(zoomAt(cam, { x: 0, y: 0 }, 1000).z).toBe(MAX_ZOOM)
    expect(zoomAt(cam, { x: 0, y: 0 }, 0).z).toBe(MIN_ZOOM)
  })

  it('pans by screen pixels regardless of zoom', () => {
    const next = panBy(cam, 20, 10)
    expect(next).toEqual({ x: 90, y: -55, z: 2 })
  })

  it('computes the visible world box', () => {
    expect(viewportBox(cam, 200, 100)).toEqual({ minX: 100, minY: -50, maxX: 200, maxY: 0 })
  })

  it('fits a box without zooming in past the limit', () => {
    const fit = cameraToFit({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 800, 600)
    expect(fit.z).toBe(1)
    const big = cameraToFit({ minX: 0, minY: 0, maxX: 4000, maxY: 1000 }, 800, 600, 0)
    expect(big.z).toBeCloseTo(0.2)
  })
})
