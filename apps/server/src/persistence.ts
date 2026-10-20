import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Persistence {
  load(room: string): Promise<Uint8Array | null>
  save(room: string, state: Uint8Array): Promise<void>
}

export class MemoryPersistence implements Persistence {
  readonly rooms = new Map<string, Uint8Array>()

  load(room: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.rooms.get(room) ?? null)
  }

  save(room: string, state: Uint8Array): Promise<void> {
    this.rooms.set(room, state)
    return Promise.resolve()
  }
}

export class FilePersistence implements Persistence {
  private readonly dir: string
  private ready: Promise<void> | null = null

  constructor(dir: string) {
    this.dir = dir
  }

  async load(room: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.pathFor(room)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async save(room: string, state: Uint8Array): Promise<void> {
    this.ready ??= mkdir(this.dir, { recursive: true }).then(() => undefined)
    await this.ready
    const target = this.pathFor(room)
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, state)
    await rename(temp, target)
  }

  private pathFor(room: string): string {
    return join(this.dir, `${room}.ydoc`)
  }
}
