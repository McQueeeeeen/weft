import { boxTranslate, type Box } from '../geometry/box.ts'
import type { ResizeHandle } from './types.ts'

export interface Guide {
  readonly axis: 'x' | 'y'
  readonly at: number
  readonly from: number
  readonly to: number
}

export interface Snap {
  readonly dx: number
  readonly dy: number
  readonly guides: readonly Guide[]
}

export interface SnapEdges {
  readonly x: readonly number[]
  readonly y: readonly number[]
}

export const ALL_EDGES: SnapEdges = { x: [0, 1, 2], y: [0, 1, 2] }

const EPSILON = 0.01

const lines = (b: Box, axis: 'x' | 'y'): number[] =>
  axis === 'x' ? [b.minX, (b.minX + b.maxX) / 2, b.maxX] : [b.minY, (b.minY + b.maxY) / 2, b.maxY]

export function resizeEdges(handle: ResizeHandle): SnapEdges {
  const pick = (low: string, high: string) =>
    handle.includes(low) ? [0] : handle.includes(high) ? [2] : []
  return { x: pick('w', 'e'), y: pick('n', 's') }
}

function offset(
  box: Box,
  targets: readonly Box[],
  axis: 'x' | 'y',
  edges: readonly number[],
  threshold: number,
) {
  const moving = lines(box, axis).filter((_, i) => edges.includes(i))
  let best = 0
  let found = false
  for (const target of targets) {
    for (const c of lines(target, axis)) {
      for (const m of moving) {
        const d = c - m
        if (Math.abs(d) <= threshold && (!found || Math.abs(d) < Math.abs(best))) {
          best = d
          found = true
        }
      }
    }
  }
  return best
}

function guides(
  box: Box,
  targets: readonly Box[],
  axis: 'x' | 'y',
  edges: readonly number[],
): Guide[] {
  const moving = lines(box, axis).filter((_, i) => edges.includes(i))
  const across = (b: Box): [number, number] => (axis === 'x' ? [b.minY, b.maxY] : [b.minX, b.maxX])
  const found = new Map<number, Guide>()
  for (const target of targets) {
    for (const at of lines(target, axis)) {
      if (!moving.some((m) => Math.abs(m - at) < EPSILON)) continue
      const key = Math.round(at * 100)
      const prev = found.get(key)
      const [a0, a1] = across(box)
      const [b0, b1] = across(target)
      found.set(key, {
        axis,
        at,
        from: Math.min(a0, b0, prev?.from ?? Infinity),
        to: Math.max(a1, b1, prev?.to ?? -Infinity),
      })
    }
  }
  return [...found.values()]
}

export function snapBox(
  box: Box,
  targets: readonly Box[],
  threshold: number,
  edges: SnapEdges = ALL_EDGES,
): Snap {
  const dx = offset(box, targets, 'x', edges.x, threshold)
  const dy = offset(box, targets, 'y', edges.y, threshold)
  const moved = boxTranslate(box, dx, dy)
  return {
    dx,
    dy,
    guides: [...guides(moved, targets, 'x', edges.x), ...guides(moved, targets, 'y', edges.y)],
  }
}
