import { boxCenter, boxExpand, type Box } from './box.ts'
import type { Vec } from './vec.ts'

const DIRS: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
]
const NONE = 4
const BEND_COST = 32

export interface RouteEnd {
  readonly point: Vec
  readonly box: Box | null
}

interface Port {
  readonly at: Vec
  readonly out: Vec
  readonly dir: number
}

function ports(end: RouteEnd, gap: number, margin: number): Port[] {
  const { box } = end
  if (!box) return [{ at: end.point, out: end.point, dir: NONE }]
  const c = boxCenter(box)
  const anchors = [
    { x: box.maxX, y: c.y },
    { x: c.x, y: box.maxY },
    { x: box.minX, y: c.y },
    { x: c.x, y: box.minY },
  ]
  return anchors.map((a, dir) => {
    const d = DIRS[dir]!
    return {
      at: { x: a.x + d.x * gap, y: a.y + d.y * gap },
      out: { x: a.x + d.x * margin, y: a.y + d.y * margin },
      dir,
    }
  })
}

const inside = (b: Box, p: Vec) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY

const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b)

class Heap {
  private readonly keys: number[] = []
  private readonly values: number[] = []

  get size() {
    return this.keys.length
  }

  push(key: number, value: number) {
    const { keys, values } = this
    let i = keys.length
    keys.push(key)
    values.push(value)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent]! <= key) break
      keys[i] = keys[parent]!
      values[i] = values[parent]!
      i = parent
    }
    keys[i] = key
    values[i] = value
  }

  pop(): [number, number] {
    const { keys, values } = this
    const top: [number, number] = [keys[0]!, values[0]!]
    const key = keys.pop()!
    const value = values.pop()!
    const n = keys.length
    if (n === 0) return top
    let i = 0
    for (;;) {
      let child = 2 * i + 1
      if (child >= n) break
      if (child + 1 < n && keys[child + 1]! < keys[child]!) child++
      if (keys[child]! >= key) break
      keys[i] = keys[child]!
      values[i] = values[child]!
      i = child
    }
    keys[i] = key
    values[i] = value
    return top
  }
}

const manhattan = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function search(
  from: Port,
  to: Port,
  obstacles: readonly Box[],
  bound: number,
): { cost: number; path: Vec[] } | null {
  const xs = unique([
    from.out.x,
    to.out.x,
    (from.out.x + to.out.x) / 2,
    ...obstacles.flatMap((b) => [b.minX, b.maxX]),
  ])
  const ys = unique([
    from.out.y,
    to.out.y,
    (from.out.y + to.out.y) / 2,
    ...obstacles.flatMap((b) => [b.minY, b.maxY]),
  ])
  const node = (p: Vec) => xs.indexOf(p.x) * ys.length + ys.indexOf(p.y)
  const point = (n: number): Vec => ({ x: xs[Math.floor(n / ys.length)]!, y: ys[n % ys.length]! })
  const blocked = (p: Vec) => obstacles.some((b) => inside(b, p))

  const states = xs.length * ys.length * 5
  const cost = new Float64Array(states).fill(Infinity)
  const prev = new Int32Array(states).fill(-1)
  const start = node(from.out) * 5 + from.dir
  const goal = node(to.out)
  const arrive = to.dir === NONE ? NONE : (to.dir + 2) % 4
  const open = new Heap()
  cost[start] = 0
  open.push(manhattan(from.out, to.out), start)

  let best = -1
  let bestCost = bound
  while (open.size > 0) {
    const [f, s] = open.pop()
    if (f >= bestCost) break
    const n = Math.floor(s / 5)
    const dir = s % 5
    const p = point(n)
    if (f > cost[s]! + manhattan(p, to.out)) continue
    if (n === goal) {
      const total = cost[s]! + (arrive !== NONE && dir !== NONE && dir !== arrive ? BEND_COST : 0)
      if (total < bestCost) {
        bestCost = total
        best = s
      }
      continue
    }
    const i = Math.floor(n / ys.length)
    const j = n % ys.length
    for (let d = 0; d < 4; d++) {
      if (dir !== NONE && d === (dir + 2) % 4) continue
      const ni = i + DIRS[d]!.x
      const nj = j + DIRS[d]!.y
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue
      const q = { x: xs[ni]!, y: ys[nj]! }
      if (blocked(q) || blocked({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })) continue
      const next = (ni * ys.length + nj) * 5 + d
      const c = cost[s]! + manhattan(p, q) + (dir !== NONE && dir !== d ? BEND_COST : 0)
      if (c < cost[next]!) {
        cost[next] = c
        prev[next] = s
        open.push(c + manhattan(q, to.out), next)
      }
    }
  }
  if (best < 0) return null
  const path: Vec[] = []
  for (let s = best; s >= 0; s = prev[s]!) path.push(point(Math.floor(s / 5)))
  return { cost: bestCost, path: path.reverse() }
}

function simplify(points: Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    const before = out[out.length - 2]
    if (
      last &&
      before &&
      ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))
    )
      out.pop()
    out.push(p)
  }
  return out
}

function cheapest(
  a: RouteEnd,
  b: RouteEnd,
  gap: number,
  margin: number,
  obstacles: readonly Box[],
) {
  let best: { cost: number; path: Vec[]; from: Port; to: Port } | null = null
  for (const from of ports(a, gap, margin)) {
    if (obstacles.some((o) => inside(o, from.out))) continue
    for (const to of ports(b, gap, margin)) {
      if (obstacles.some((o) => inside(o, to.out))) continue
      const found = search(from, to, obstacles, best?.cost ?? Infinity)
      if (found) best = { ...found, from, to }
    }
  }
  return best
}

export function elbowRoute(a: RouteEnd, b: RouteEnd, gap: number, margin: number): Vec[] {
  const obstacles = [a.box, b.box]
    .filter((box) => box !== null)
    .map((box) => boxExpand(box, margin - 0.5))
  const best = cheapest(a, b, gap, margin, obstacles) ?? cheapest(a, b, gap, margin, [])!
  return simplify([best.from.at, ...best.path, best.to.at])
}
