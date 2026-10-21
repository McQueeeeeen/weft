import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { FilePersistence, MemoryPersistence } from './persistence.ts'
import { startServer } from './server.ts'
import { cleanup, cleanups, connect, replay, sleep, start, waitFor } from './test-utils.ts'

afterEach(cleanup)

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
    await waitFor(() => persistence.entries.has('rooms/durable'))
    a.provider.destroy()
    await first.close()

    const second = await start({ persistence })
    const b = connect(second, 'durable')
    await waitFor(() => b.map.get('kept') === 42)
  })

  it('does not lose the first messages of a client that connects while the room loads', async () => {
    const stored = new Y.Doc()
    stored.getMap('test').set('from-disk', 1)
    const slow = new MemoryPersistence()
    slow.entries.set('rooms/slow', Y.encodeStateAsUpdate(stored))
    const get = slow.get.bind(slow)
    slow.get = (key) => new Promise((resolve) => setTimeout(() => resolve(get(key)), 150))
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
    expect(persistence.entries.has('rooms/transient')).toBe(true)
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
    expect(await persistence.get('rooms/missing')).toBeNull()
    expect(await persistence.list('rooms')).toEqual([])
    await persistence.put('rooms/a', new Uint8Array([1, 2, 3]))
    await persistence.put('rooms/a', new Uint8Array([4, 5]))
    expect(await persistence.get('rooms/a')).toEqual(new Uint8Array([4, 5]))
    expect(await readdir(join(dir, 'nested', 'rooms'))).toEqual(['a'])
    await persistence.delete('rooms/a')
    expect(await persistence.list('rooms')).toEqual([])
  })
})

describe('view-only links', () => {
  it('lets viewers see the board but drops their edits', async () => {
    const server = await start()
    const base = `http://127.0.0.1:${server.port}`
    const editor = connect(server, 'shared')
    await waitFor(() => editor.provider.synced)
    editor.map.set('x', 1)

    const created = await fetch(`${base}/api/rooms/shared/view`, { method: 'POST' })
    const { viewId } = (await created.json()) as { viewId: string }
    const again = await fetch(`${base}/api/rooms/shared/view`, { method: 'POST' })
    expect(((await again.json()) as { viewId: string }).viewId).toBe(viewId)

    const viewer = connect(server, viewId, 'ws-view')
    await waitFor(() => viewer.map.get('x') === 1)
    viewer.map.set('y', 2)
    editor.map.set('z', 3)
    await waitFor(() => viewer.map.get('z') === 3)
    await new Promise((r) => setTimeout(r, 100))
    expect(editor.map.get('y')).toBeUndefined()
  })

  it('refuses unknown view links', async () => {
    const server = await start()
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws-view/nope`)
      ws.onclose = (event) => resolve(event.code)
    })
    expect(code).toBe(4404)
  })
})

describe('version history', () => {
  it('keeps snapshots and serves them back', async () => {
    const server = await start({ versionIntervalMs: 0, maxVersions: 2 })
    const base = `http://127.0.0.1:${server.port}`
    const a = connect(server, 'history')
    await waitFor(() => a.provider.synced)
    const shapes = a.doc.getMap('shapes')
    for (const id of ['one', 'two', 'three']) {
      shapes.set(id, new Y.Map())
      await new Promise((r) => setTimeout(r, 60))
    }
    const list = async () =>
      (await (await fetch(`${base}/api/rooms/history/versions`)).json()) as {
        at: number
        objects: number
      }[]
    let versions = await list()
    for (let i = 0; i < 20 && versions[0]?.objects !== 3; i++) {
      await new Promise((r) => setTimeout(r, 50))
      versions = await list()
    }
    expect(versions).toHaveLength(2)
    expect(versions[0]!.objects).toBe(3)
    expect(versions[0]!.at).toBeGreaterThan(versions[1]!.at)

    const res = await fetch(`${base}/api/rooms/history/versions/${versions[1]!.at}`)
    const restored = new Y.Doc()
    Y.applyUpdate(restored, new Uint8Array(await res.arrayBuffer()))
    expect(restored.getMap('shapes').size).toBe(2)
  })
})

describe('replay log', () => {
  const edit = async (map: Y.Map<number>, keys: string[]) => {
    for (const key of keys) {
      map.set(key, 1)
      await sleep(70)
    }
  }

  it('records client edits and serves them in order', async () => {
    const server = await start()
    const a = connect(server, 'log')
    await waitFor(() => a.provider.synced)
    await edit(a.map, ['one', 'two', 'three'])
    const log = await replay(server, 'log')
    expect(log.sizes).toEqual([1, 2, 3])
    expect(log.times).toEqual([...log.times].sort((x, y) => x - y))
    expect(log.map.toJSON()).toEqual(a.map.toJSON())
  })

  it('keeps the history across a room reload', async () => {
    const persistence = new MemoryPersistence()
    const first = await startServer({ port: 0, host: '127.0.0.1', persistence, saveDebounceMs: 10 })
    const a = connect(first, 'reload')
    await waitFor(() => a.provider.synced)
    await edit(a.map, ['one', 'two'])
    a.provider.destroy()
    await first.close()

    const second = await start({ persistence })
    const b = connect(second, 'reload')
    await waitFor(() => b.map.size === 2)
    await edit(b.map, ['three'])
    const log = await replay(second, 'reload')
    expect(log.sizes).toEqual([1, 2, 3])
    expect(persistence.entries.has('log-base/reload')).toBe(false)
  })

  it('folds old chunks into a base that still ends at the live state', async () => {
    const persistence = new MemoryPersistence()
    const server = await start({ persistence, maxLogChunks: 2 })
    const a = connect(server, 'fold')
    await waitFor(() => a.provider.synced)
    await edit(a.map, ['one', 'two', 'three', 'four', 'five'])
    a.map.delete('two')
    const log = await replay(server, 'fold')
    expect(persistence.entries.has('log-base/fold')).toBe(true)
    expect((await persistence.list('log/fold')).length).toBeLessThanOrEqual(2)
    expect(log.times.length).toBeLessThan(6)
    expect(log.map.toJSON()).toEqual(a.map.toJSON())
  })

  it('starts the replay of an older board from its saved state', async () => {
    const stored = new Y.Doc()
    stored.getMap('test').set('old', 1)
    const persistence = new MemoryPersistence()
    persistence.entries.set('rooms/legacy', Y.encodeStateAsUpdate(stored))
    const server = await start({ persistence })
    const a = connect(server, 'legacy')
    await waitFor(() => a.map.get('old') === 1)
    await edit(a.map, ['new'])
    const log = await replay(server, 'legacy')
    expect(log.sizes).toEqual([2])
  })
})

describe('image assets', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

  it('stores images by content and serves them', async () => {
    const server = await start()
    const base = `http://127.0.0.1:${server.port}`
    const upload = () =>
      fetch(`${base}/api/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: png,
      })
    const first = (await (await upload()).json()) as { url: string }
    const second = (await (await upload()).json()) as { url: string }
    expect(first.url).toBe(second.url)
    expect(first.url).toMatch(/^\/assets\/[a-f0-9]{64}\.png$/)
    const served = await fetch(`${base}${first.url}`)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
  })

  it('rejects other file types and oversized uploads', async () => {
    const server = await start()
    const base = `http://127.0.0.1:${server.port}`
    const svg = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/svg+xml' },
      body: '<svg/>',
    })
    expect(svg.status).toBe(415)
    const big = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(5 * 1024 * 1024 + 1),
    }).catch(() => null)
    expect(big === null || big.status === 413).toBe(true)
  })
})
