import * as Y from 'yjs'

export const MAX_GAP_MS = 400

export interface ReplayEntry {
  readonly at: number
  readonly update: Uint8Array
}

export interface ReplayLog {
  readonly base: Uint8Array
  readonly entries: readonly ReplayEntry[]
}

export function decodeReplay(bytes: Uint8Array): ReplayLog {
  let pos = 0
  const uint = () => {
    let value = 0
    let scale = 1
    let byte: number
    do {
      byte = bytes[pos++] ?? 0
      value += (byte & 127) * scale
      scale *= 128
    } while (byte >= 128)
    return value
  }
  const chunk = () => {
    const length = uint()
    pos += length
    return bytes.subarray(pos - length, pos)
  }
  const base = chunk()
  const entries: ReplayEntry[] = []
  while (pos < bytes.length) entries.push({ at: uint(), update: chunk() })
  return { base, entries }
}

export class Timeline {
  readonly entries: readonly ReplayEntry[]
  readonly offsets: readonly number[]
  private readonly interval: number
  private readonly checkpoints: Uint8Array[] = []
  doc = new Y.Doc()
  index = 0

  constructor({ base, entries }: ReplayLog, interval = 64) {
    this.entries = entries
    this.interval = interval
    let clock = 0
    this.offsets = entries.map(
      (e, i) => (clock += i === 0 ? MAX_GAP_MS : Math.min(MAX_GAP_MS, e.at - entries[i - 1]!.at)),
    )
    const scratch = new Y.Doc()
    if (base.length > 0) Y.applyUpdate(scratch, base)
    this.checkpoints.push(Y.encodeStateAsUpdate(scratch))
    entries.forEach((e, i) => {
      Y.applyUpdate(scratch, e.update)
      if ((i + 1) % interval === 0) this.checkpoints.push(Y.encodeStateAsUpdate(scratch))
    })
    scratch.destroy()
    Y.applyUpdate(this.doc, this.checkpoints[0]!)
  }

  get length(): number {
    return this.entries.length
  }

  get duration(): number {
    return this.offsets.at(-1) ?? 0
  }

  timeAt(index: number): number {
    return index === 0 ? 0 : this.offsets[index - 1]!
  }

  dateAt(index: number): number | undefined {
    return this.entries[Math.max(0, index - 1)]?.at
  }

  indexAt(ms: number): number {
    let lo = 0
    let hi = this.offsets.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.offsets[mid]! <= ms) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  seek(index: number): void {
    const target = Math.max(0, Math.min(this.length, index))
    const checkpoint = Math.floor(target / this.interval)
    if (target < this.index || checkpoint * this.interval > this.index) {
      this.doc = new Y.Doc()
      Y.applyUpdate(this.doc, this.checkpoints[checkpoint]!)
      this.index = checkpoint * this.interval
    }
    this.doc.transact(() => {
      for (; this.index < target; this.index++) {
        Y.applyUpdate(this.doc, this.entries[this.index]!.update)
      }
    })
  }
}
