import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { FilePersistence, MemoryPersistence, type Persistence } from './persistence.ts'
import { startServer, type RunningServer, type ServerOptions } from './server.ts'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function start(options: Partial<ServerOptions> = {}): Promise<RunningServer> {
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    persistence: new MemoryPersistence(),
    saveDebounceMs: 10,
    unloadDelayMs: 20,
    ...options,
  })
  cleanups.push(() => server.close())
  return server
}

function connect(server: RunningServer, room: string) {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/ws`, room, doc, {
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  })
  cleanups.push(() => {
    provider.destroy()
    doc.destroy()
  })
  return { doc, provider, map: doc.getMap<number>('test') }
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('sync server', () => {
  it('relays document updates between clients in the same room', async () => {
    const server = await start()
    const a = connect(server, 'room-1')
    const b = connect(server, 'room-1')
    await waitFor(() => a.provider.synced && b.provider.synced)

    a.map.set('x', 1)
    await waitFor(() => b.map.get('x') === 1)
    b.map.set('y', 2)
    await waitFor(() => a.map.get('y') === 2)
  })

  it('isolates rooms', async () => {
    const server = await start()
    const a = connect(server, 'room-a')
    const b = connect(server, 'room-b')
    await waitFor(() => a.provider.synced && b.provider.synced)
    a.map.set('x', 1)
    await new Promise((r) => setTimeout(r, 100))
    expect(b.map.get('x')).toBeUndefined()
  })

  it('brings a late joiner up to date', async () => {
    const server = await start()
    const a = connect(server, 'late')
    await waitFor(() => a.provider.synced)
    for (let i = 0; i < 50; i++) a.map.set(`k${i}`, i)
    const b = connect(server, 'late')
    await waitFor(() => b.map.size === 50)
  })

  it('relays presence and clears it when a client leaves', async () => {
    const server = await start()
    const a = connect(server, 'presence')
    const b = connect(server, 'presence')
    await waitFor(() => a.provider.synced && b.provider.synced)

    a.provider.awareness.setLocalState({ user: { name: 'Alice', color: 1 } })
    const aliceId = a.doc.clientID
    await waitFor(() => b.provider.awareness.getStates().has(aliceId))

    a.provider.destroy()
    await waitFor(() => !b.provider.awareness.getStates().has(aliceId))
  })

  it('persists rooms and restores them after a restart', async () => {
    const persistence = new MemoryPersistence()
    const first = await startServer({ port: 0, host: '127.0.0.1', persistence, saveDebounceMs: 10 })
    const a = connect(first, 'durable')
    await waitFor(() => a.provider.synced)
    a.map.set('kept', 42)
    await waitFor(() => persistence.rooms.has('durable'))
    a.provider.destroy()
    await first.close()

    const second = await start({ persistence })
    const b = connect(second, 'durable')
    await waitFor(() => b.map.get('kept') === 42)
  })

  it('does not lose the first messages of a client that connects while the room loads', async () => {
    const stored = new Y.Doc()
    stored.getMap('test').set('from-disk', 1)
    const slow: Persistence = {
      load: () =>
        new Promise((resolve) => setTimeout(() => resolve(Y.encodeStateAsUpdate(stored)), 150)),
      save: () => Promise.resolve(),
    }
    const server = await start({ persistence: slow })
    const a = connect(server, 'slow')
    await waitFor(() => a.map.get('from-disk') === 1)
    expect(a.provider.synced).toBe(true)
  })

  it('unloads empty rooms after writing them', async () => {
    const persistence = new MemoryPersistence()
    const server = await start({ persistence })
    const a = connect(server, 'transient')
    await waitFor(() => a.provider.synced)
    a.map.set('x', 1)
    a.provider.destroy()
    await waitFor(() => server.roomCount === 0)
    expect(persistence.rooms.has('transient')).toBe(true)
  })

  it('rejects invalid room names', async () => {
    const server = await start()
    const status = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/bad%20room`)
      ws.onopen = () => resolve('open')
      ws.onerror = () => resolve('error')
    })
    expect(status).toBe('error')
  })

  it('closes connections that send garbage', async () => {
    const server = await start()
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/garbage`)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => ws.send(new Uint8Array([0, 255, 255, 255, 255, 255]))
      ws.onclose = (event) => resolve(event.code)
    })
    expect(code).toBe(1007)
  })

  it('reports health', async () => {
    const server = await start()
    const res = await fetch(`http://127.0.0.1:${server.port}/health`)
    expect(await res.json()).toEqual({ status: 'ok', rooms: 0, connections: 0 })
  })
})

describe('static files', () => {
  it('serves the app, falls back to index.html and refuses path traversal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-static-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    await writeFile(join(dir, 'index.html'), '<!doctype html>app')
    const server = await start({ staticDir: dir })
    const base = `http://127.0.0.1:${server.port}`

    const index = await fetch(`${base}/`)
    expect(await index.text()).toContain('app')
    expect(index.headers.get('cache-control')).toBe('no-cache')

    const deepLink = await fetch(`${base}/board/abc`)
    expect(await deepLink.text()).toContain('app')

    const traversal = await fetch(`${base}/..%2F..%2F..%2Fetc%2Fpasswd`)
    expect(await traversal.text()).not.toContain('root:')
  })
})

describe('FilePersistence', () => {
  it('round-trips snapshots and leaves no temp files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-data-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const persistence = new FilePersistence(join(dir, 'nested'))
    expect(await persistence.load('missing')).toBeNull()
    await persistence.save('room', new Uint8Array([1, 2, 3]))
    await persistence.save('room', new Uint8Array([4, 5]))
    expect(await persistence.load('room')).toEqual(new Uint8Array([4, 5]))
    expect(await readdir(join(dir, 'nested'))).toEqual(['room.ydoc'])
  })
})
