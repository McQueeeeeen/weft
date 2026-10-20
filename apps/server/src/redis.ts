import { connect as connectTcp, type Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'
import type { Bus, BusListener } from './bus.ts'
import { silentLogger, type Logger } from './logger.ts'

export type Reply = string | number | Uint8Array | Error | null | Reply[]

type Arg = string | Uint8Array

interface Connection {
  send(...args: Arg[]): void
  close(): void
}

const CRLF = Buffer.from('\r\n')

export function encodeCommand(args: readonly Arg[]): Buffer {
  const parts: Uint8Array[] = [Buffer.from(`*${args.length}\r\n`)]
  for (const arg of args) {
    const bytes = typeof arg === 'string' ? Buffer.from(arg) : arg
    parts.push(Buffer.from(`$${bytes.length}\r\n`), bytes, CRLF)
  }
  return Buffer.concat(parts)
}

export function parseReply(buffer: Buffer, start = 0): [Reply, number] | null {
  const end = buffer.indexOf(CRLF, start)
  if (end < 0) return null
  const line = buffer.toString('utf8', start + 1, end)
  const next = end + 2
  switch (buffer[start]) {
    case 0x2b:
      return [line, next]
    case 0x2d:
      return [new Error(line), next]
    case 0x3a:
      return [Number(line), next]
    case 0x24: {
      const length = Number(line)
      if (length < 0) return [null, next]
      if (buffer.length < next + length + 2) return null
      return [new Uint8Array(buffer.subarray(next, next + length)), next + length + 2]
    }
    case 0x2a: {
      const count = Number(line)
      if (count < 0) return [null, next]
      const items: Reply[] = []
      let offset = next
      for (let i = 0; i < count; i++) {
        const item = parseReply(buffer, offset)
        if (!item) return null
        items.push(item[0])
        offset = item[1]
      }
      return [items, offset]
    }
    default:
      throw new Error('invalid RESP reply')
  }
}

function openConnection(
  url: URL,
  retryMs: number,
  logger: Logger,
  onReady: () => void,
  onReply: (reply: Reply) => void,
): Connection {
  let socket: Socket | null = null
  let ready = false
  let closed = false
  let retry: NodeJS.Timeout | undefined

  const send = (...args: Arg[]) => {
    if (ready) socket?.write(encodeCommand(args))
  }

  const open = () => {
    const options = { host: url.hostname, port: Number(url.port || 6379) }
    const connected = () => {
      ready = true
      if (url.password) {
        const user = url.username ? [decodeURIComponent(url.username)] : []
        send('AUTH', ...user, decodeURIComponent(url.password))
      }
      onReady()
    }
    const current =
      url.protocol === 'rediss:' ? connectTls(options, connected) : connectTcp(options, connected)
    socket = current
    let buffer = Buffer.alloc(0)
    current.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      try {
        let parsed: [Reply, number] | null
        while ((parsed = parseReply(buffer))) {
          buffer = buffer.subarray(parsed[1])
          if (parsed[0] instanceof Error) logger.warn('redis error', { error: parsed[0].message })
          else onReply(parsed[0])
        }
      } catch (error) {
        logger.warn('redis protocol error', { error: String(error) })
        current.destroy()
      }
    })
    current.on('error', (error) => logger.warn('redis connection error', { error: String(error) }))
    current.on('close', () => {
      ready = false
      if (!closed) retry = setTimeout(open, retryMs)
    })
  }

  open()
  return {
    send,
    close() {
      closed = true
      clearTimeout(retry)
      socket?.destroy()
    },
  }
}

const text = (reply: Reply | undefined) =>
  reply instanceof Uint8Array ? Buffer.from(reply).toString() : String(reply)

export class RedisBus implements Bus {
  private readonly listeners = new Map<string, Set<BusListener>>()
  private readonly publisher: Connection
  private readonly subscriber: Connection

  constructor(url: string, logger: Logger = silentLogger, retryMs = 1000) {
    const target = new URL(url)
    this.publisher = openConnection(
      target,
      retryMs,
      logger,
      () => {},
      () => {},
    )
    this.subscriber = openConnection(
      target,
      retryMs,
      logger,
      () => {
        if (this.listeners.size > 0) this.subscriber.send('SUBSCRIBE', ...this.listeners.keys())
      },
      (reply) => {
        if (!Array.isArray(reply) || text(reply[0]) !== 'message') return
        const payload = reply[2]
        if (!(payload instanceof Uint8Array)) return
        for (const listener of this.listeners.get(text(reply[1])) ?? []) listener(payload)
      },
    )
  }

  publish(channel: string, message: Uint8Array): void {
    this.publisher.send('PUBLISH', channel, message)
  }

  subscribe(channel: string, listener: BusListener): () => void {
    let listeners = this.listeners.get(channel)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(channel, listeners)
      this.subscriber.send('SUBSCRIBE', channel)
    }
    const set = listeners.add(listener)
    return () => {
      set.delete(listener)
      if (set.size > 0 || this.listeners.get(channel) !== set) return
      this.listeners.delete(channel)
      this.subscriber.send('UNSUBSCRIBE', channel)
    }
  }

  close(): void {
    this.publisher.close()
    this.subscriber.close()
  }
}
