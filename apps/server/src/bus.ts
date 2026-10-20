export type BusListener = (message: Uint8Array) => void

export interface Bus {
  publish(channel: string, message: Uint8Array): void
  subscribe(channel: string, listener: BusListener): () => void
}

export class MemoryBus implements Bus {
  private readonly channels = new Map<string, Set<BusListener>>()

  publish(channel: string, message: Uint8Array): void {
    queueMicrotask(() => {
      for (const listener of this.channels.get(channel) ?? []) listener(message)
    })
  }

  subscribe(channel: string, listener: BusListener): () => void {
    const listeners = this.channels.get(channel) ?? new Set()
    this.channels.set(channel, listeners)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
