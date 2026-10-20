import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface Persistence {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, value: Uint8Array): Promise<void>
  list(dir: string): Promise<string[]>
  delete(key: string): Promise<void>
}

export class MemoryPersistence implements Persistence {
  readonly entries = new Map<string, Uint8Array>()

  get(key: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.entries.get(key) ?? null)
  }

  put(key: string, value: Uint8Array): Promise<void> {
    this.entries.set(key, value)
    return Promise.resolve()
  }

  list(dir: string): Promise<string[]> {
    const prefix = `${dir}/`
    return Promise.resolve(
      [...this.entries.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length)),
    )
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key)
    return Promise.resolve()
  }
}

export class FilePersistence implements Persistence {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(join(this.root, key)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    const target = join(this.root, key)
    await mkdir(dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, value)
    await rename(temp, target)
  }

  async list(dir: string): Promise<string[]> {
    try {
      const names = await readdir(join(this.root, dir), { withFileTypes: true })
      return names.filter((d) => d.isFile() && !d.name.endsWith('.tmp')).map((d) => d.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true })
  }
}
