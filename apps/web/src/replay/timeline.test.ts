import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { MAX_GAP_MS, Timeline, decodeReplay, type ReplayEntry } from './timeline.ts'

function encode(base: Uint8Array, entries: readonly ReplayEntry[]): Uint8Array {
  const bytes: number[] = []
  const uint = (n: number) => {
    for (; n >= 128; n = Math.floor(n / 128)) bytes.push((n & 127) | 128)
    bytes.push(n)
  }
  const chunk = (data: Uint8Array) => {
    uint(data.length)
    bytes.push(...data)
  }
  chunk(base)
  for (const e of entries) {
    uint(e.at)
    chunk(e.update)
  }
  return new Uint8Array(bytes)
}

function history(count: number) {
  const doc = new Y.Doc()
  const map = doc.getMap<number>('shapes')
  map.set('seed', 0)
  const base = Y.encodeStateAsUpdate(doc)
  const updates: Uint8Array[] = []
  const states: unknown[] = [map.toJSON()]
  doc.on('update', (update: Uint8Array) => updates.push(update))
  for (let i = 0; i < count; i++) {
    if (i % 5 === 4) map.delete(`k${i - 2}`)
    else map.set(`k${i}`, i)
    states.push(map.toJSON())
  }
  const entries = updates.map((update, i) => ({ at: 1_700_000_000_000 + i * 1000, update }))
  return { base, entries, states }
}

describe('replay timeline', () => {
  it('decodes the server payload', () => {
    const { base, entries } = history(3)
    expect(decodeReplay(encode(base, entries))).toEqual({ base, entries })
    expect(decodeReplay(encode(new Uint8Array(), []))).toEqual({
      base: new Uint8Array(),
      entries: [],
    })
  })

  it('compresses idle gaps and maps playback time to entries', () => {
    const at = [1000, 1100, 1100, 9_000_000]
    const timeline = new Timeline({
      base: new Uint8Array(),
      entries: at.map((t) => ({ at: t, update: new Uint8Array([0, 0]) })),
    })
    expect(timeline.offsets).toEqual([MAX_GAP_MS, 500, 500, 900])
    expect(timeline.duration).toBe(900)
    expect(timeline.indexAt(0)).toBe(0)
    expect(timeline.indexAt(499)).toBe(1)
    expect(timeline.indexAt(500)).toBe(3)
    expect(timeline.indexAt(10_000)).toBe(4)
    expect(timeline.timeAt(0)).toBe(0)
    expect(timeline.timeAt(4)).toBe(900)
    expect(timeline.dateAt(0)).toBe(1000)
    expect(timeline.dateAt(4)).toBe(9_000_000)
  })

  it('seeks anywhere from the nearest checkpoint', () => {
    const { base, entries, states } = history(100)
    let reads = 0
    const counted = entries.map((e) => ({
      at: e.at,
      get update() {
        reads++
        return e.update
      },
    }))
    const timeline = new Timeline({ base, entries: counted }, 8)
    for (const target of [100, 37, 3, 64, 64, 0, 99, 50, 51, 12]) {
      reads = 0
      timeline.seek(target)
      expect(timeline.index).toBe(target)
      expect(timeline.doc.getMap('shapes').toJSON()).toEqual(states[target])
      expect(reads).toBeLessThan(8)
    }
  })
})
