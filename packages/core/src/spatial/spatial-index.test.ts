import { describe, expect, it } from 'vitest'
import { boxFromRect, boxIntersects, type Box } from '../geometry/box.ts'
import { SpatialIndex } from './spatial-index.ts'

/** Small deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomBox(rand: () => number, spread: number, maxSize: number): Box {
  return boxFromRect(
    (rand() - 0.5) * spread,
    (rand() - 0.5) * spread,
    rand() * maxSize,
    rand() * maxSize,
  )
}

describe('SpatialIndex', () => {
  it('finds what it stores and forgets what it deletes', () => {
    const index = new SpatialIndex(100)
    index.set('a', boxFromRect(0, 0, 10, 10))
    index.set('b', boxFromRect(500, 500, 10, 10))
    expect(index.query(boxFromRect(-5, -5, 20, 20))).toEqual(['a'])
    index.delete('a')
    expect(index.query(boxFromRect(-5, -5, 20, 20))).toEqual([])
    expect(index.size).toBe(1)
  })

  it('moves entries on update', () => {
    const index = new SpatialIndex(100)
    index.set('a', boxFromRect(0, 0, 10, 10))
    index.set('a', boxFromRect(1000, 1000, 10, 10))
    expect(index.query(boxFromRect(0, 0, 50, 50))).toEqual([])
    expect(index.query(boxFromRect(990, 990, 50, 50))).toEqual(['a'])
  })

  it('handles negative coordinates and oversized entries', () => {
    const index = new SpatialIndex(10)
    index.set('huge', boxFromRect(-10_000, -10_000, 20_000, 20_000))
    index.set('neg', boxFromRect(-55, -55, 5, 5))
    expect(index.query(boxFromRect(-60, -60, 10, 10)).sort()).toEqual(['huge', 'neg'])
    index.delete('huge')
    expect(index.query(boxFromRect(-60, -60, 10, 10))).toEqual(['neg'])
  })

  it('matches a brute-force scan on random data', () => {
    const rand = mulberry32(42)
    const index = new SpatialIndex(128)
    const truth = new Map<string, Box>()

    for (let step = 0; step < 3000; step++) {
      const id = `s${Math.floor(rand() * 400)}`
      const op = rand()
      if (op < 0.75) {
        const box = randomBox(rand, 10_000, rand() < 0.02 ? 5000 : 300)
        index.set(id, box)
        truth.set(id, box)
      } else {
        index.delete(id)
        truth.delete(id)
      }

      if (step % 50 === 0) {
        const query = randomBox(rand, 10_000, rand() < 0.1 ? 20_000 : 2000)
        const expected = [...truth].filter(([, b]) => boxIntersects(b, query)).map(([k]) => k)
        expect(index.query(query).sort()).toEqual(expected.sort())
      }
    }
    expect(index.size).toBe(truth.size)
  })
})
