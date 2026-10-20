export interface Vec {
  readonly x: number
  readonly y: number
}

export const vec = (x: number, y: number): Vec => ({ x, y })

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })

export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })

export const len = (a: Vec): number => Math.hypot(a.x, a.y)

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)

export const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

export const mid = (a: Vec, b: Vec): Vec => lerp(a, b, 0.5)

export const equals = (a: Vec, b: Vec, epsilon = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
