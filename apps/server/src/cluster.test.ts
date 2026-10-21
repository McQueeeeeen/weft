import { createServer, type AddressInfo, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryBus, type Bus } from './bus.ts'
import { MemoryPersistence } from './persistence.ts'
import { RedisBus, encodeCommand, parseReply } from './redis.ts'
import type { ServerOptions } from './server.ts'
import { cleanup, cleanups, connect, replay, sleep, start, waitFor } from './test-utils.ts'

afterEach(cleanup)

async function cluster(options: Partial<ServerOptions> = {}, buses: Bus[] = [new MemoryBus()]) {
  const persistence = new MemoryPersistence()
  const [a, b] = await Promise.all(
    [0, 1].map((i) => start({ persistence, bus: buses[i] ?? buses[0], ...options })),
  )
  return { persistence, a: a!, b: b! }
}

const text = (bytes: unknown) => Buffer.from(bytes as Uint8Array).toString()

async function fakeRedis() {
  const subscribers = new Map<string, Set<Socket>>()
  const sockets = new Set<Socket>()
  const commands: string[][] = []
  const received: Buffer[] = []
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => {
      sockets.delete(socket)
      for (const set of subscribers.values()) set.delete(socket)
    })
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      received.push(chunk)
      buffer = Buffer.concat([buffer, chunk])
      let parsed
      while ((parsed = parseReply(buffer))) {
        buffer = buffer.subarray(parsed[1])
        const [name, ...args] = parsed[0] as Uint8Array[]
        const command = text(name).toUpperCase()
        commands.push([command, ...args.map(text)])
        if (command === 'PUBLISH') {
          const targets = subscribers.get(text(args[0])) ?? new Set()
          for (const target of targets) target.write(encodeCommand(['message', args[0]!, args[1]!]))
          socket.write(`:${targets.size}\r\n`)
        } else if (command === 'SUBSCRIBE' || command === 'UNSUBSCRIBE') {
          for (const channel of args.map(text)) {
            const set = subscribers.get(channel) ?? new Set()
            subscribers.set(channel, set)
            if (command === 'SUBSCRIBE') set.add(socket)
            else set.delete(socket)
            const kind = command.toLowerCase()
            socket.write(
              `*3\r\n$${kind.length}\r\n${kind}\r\n$${channel.length}\r\n${channel}\r\n:1\r\n`,
            )
          }
        } else {
          socket.write('+OK\r\n')
        }
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => {
    for (const socket of sockets) socket.destroy()
    return new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const { port } = server.address() as AddressInfo
  return { port, sockets, commands, received }
}

function redisBus(url: string) {
  const bus = new RedisBus(url, undefined, 20)
  cleanups.push(() => bus.close())
  return bus
}

describe('multiple instances', () => {
  it('relays edits between instances', async () => {
    const { a, b } = await cluster()
    const x = connect(a, 'shared')
    const y = connect(b, 'shared')
    await waitFor(() => x.provider.synced && y.provider.synced)
    x.map.set('x', 1)
    await waitFor(() => y.map.get('x') === 1)
    y.map.set('y', 2)
    await waitFor(() => x.map.get('y') === 2)
  })

  it('catches a late instance up on state that is not saved yet', async () => {
    const { persistence, a, b } = await cluster({ saveDebounceMs: 60_000, saveMaxWaitMs: 60_000 })
    const x = connect(a, 'unsaved')
    await waitFor(() => x.provider.synced)
    for (let i = 0; i < 20; i++) x.map.set(`k${i}`, i)
    await sleep(50)
    expect(persistence.entries.has('rooms/unsaved')).toBe(false)
    const y = connect(b, 'unsaved')
    await waitFor(() => y.map.size === 20)
  })

  it('shows presence across instances and removes it on disconnect', async () => {
    const { a, b } = await cluster()
    const x = connect(a, 'presence')
    await waitFor(() => x.provider.synced)
    x.provider.awareness.setLocalState({ user: { name: 'Alice' } })
    const alice = x.doc.clientID
    const y = connect(b, 'presence')
    await waitFor(() => y.provider.awareness.getStates().has(alice))
    y.provider.awareness.setLocalState({ user: { name: 'Bob' } })
    await waitFor(() => x.provider.awareness.getStates().has(y.doc.clientID))
    x.provider.destroy()
    await waitFor(() => !y.provider.awareness.getStates().has(alice))
  })

  it('keeps view-only sockets read-only on another instance', async () => {
    const { a, b } = await cluster()
    const editor = connect(a, 'viewed')
    await waitFor(() => editor.provider.synced)
    editor.map.set('x', 1)
    const res = await fetch(`http://127.0.0.1:${a.port}/api/rooms/viewed/view`, { method: 'POST' })
    const { viewId } = (await res.json()) as { viewId: string }
    const viewer = connect(b, viewId, 'ws-view')
    await waitFor(() => viewer.map.get('x') === 1)
    viewer.map.set('y', 2)
    editor.map.set('z', 3)
    await waitFor(() => viewer.map.get('z') === 3)
    await sleep(100)
    expect(editor.map.get('y')).toBeUndefined()
  })

  it('records one version per interval across instances', async () => {
    const { persistence, a, b } = await cluster({ versionIntervalMs: 60_000 })
    const x = connect(a, 'versions')
    const y = connect(b, 'versions')
    await waitFor(() => x.provider.synced && y.provider.synced)
    x.map.set('x', 1)
    y.map.set('y', 2)
    await waitFor(() => persistence.entries.has('rooms/versions'))
    await sleep(100)
    expect(await persistence.list('versions/versions')).toHaveLength(1)
  })

  it('logs each edit once, on the instance that received it', async () => {
    const { a, b } = await cluster()
    const x = connect(a, 'logged')
    const y = connect(b, 'logged')
    await waitFor(() => x.provider.synced && y.provider.synced)
    x.map.set('x', 1)
    await waitFor(() => y.map.get('x') === 1)
    await sleep(70)
    y.map.set('y', 2)
    await waitFor(() => x.map.get('y') === 2)
    await replay(b, 'logged')
    const log = await replay(a, 'logged')
    expect(log.sizes).toEqual([1, 2])
    expect(log.map.toJSON()).toEqual(x.map.toJSON())
  })

  it('syncs instances through a Redis server', async () => {
    const redis = await fakeRedis()
    const url = `redis://127.0.0.1:${redis.port}`
    const { a, b } = await cluster({}, [redisBus(url), redisBus(url)])
    const x = connect(a, 'redis')
    const y = connect(b, 'redis')
    await waitFor(() => x.provider.synced && y.provider.synced)
    x.map.set('x', 1)
    await waitFor(() => y.map.get('x') === 1)
  })
})

describe('RedisBus', () => {
  it('parses replies split at any byte', () => {
    const payload = new Uint8Array([13, 10, 0, 255, 36, 42])
    const wire = encodeCommand(['message', 'room', payload])
    for (let i = 0; i < wire.length; i++) expect(parseReply(wire.subarray(0, i))).toBeNull()
    const bytes = (s: string) => new Uint8Array(Buffer.from(s))
    expect(parseReply(wire)).toEqual([[bytes('message'), bytes('room'), payload], wire.length])
    expect(parseReply(Buffer.from('$-1\r\n'))).toEqual([null, 5])
    expect(parseReply(Buffer.from(':7\r\n'))).toEqual([7, 4])
    expect(parseReply(Buffer.from('-ERR no\r\n'))?.[0]).toEqual(new Error('ERR no'))
  })

  it('publishes binary messages, authenticates, unsubscribes and reconnects', async () => {
    const redis = await fakeRedis()
    const bus = redisBus(`redis://:secret@127.0.0.1:${redis.port}`)
    const got: Uint8Array[] = []
    const unsubscribe = bus.subscribe('c', (message) => got.push(message))
    await waitFor(() => redis.commands.some(([name]) => name === 'SUBSCRIBE'))
    expect(redis.commands).toContainEqual(['AUTH', 'secret'])

    const payload = new Uint8Array(200_000).map((_, i) => i % 256)
    bus.publish('c', new Uint8Array([13, 10, 255, 0]))
    bus.publish('c', payload)
    await waitFor(() => got.length === 2)
    expect(got).toEqual([new Uint8Array([13, 10, 255, 0]), payload])
    expect(
      Buffer.concat(redis.received).includes('*3\r\n$7\r\nPUBLISH\r\n$1\r\nc\r\n$4\r\n\r\n'),
    ).toBe(true)

    for (const socket of redis.sockets) socket.destroy()
    await waitFor(() => {
      bus.publish('c', new Uint8Array([1]))
      return got.length > 2
    })
    expect(redis.commands.filter(([name]) => name === 'SUBSCRIBE')).toHaveLength(2)

    unsubscribe()
    await waitFor(() => redis.commands.some(([name]) => name === 'UNSUBSCRIBE'))
    const count = got.length
    bus.publish('c', new Uint8Array([2]))
    await sleep(50)
    expect(got).toHaveLength(count)
  })
})
