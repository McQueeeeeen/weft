import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { HttpError, ID, createApi, resolveView } from './api.ts'
import type { Bus } from './bus.ts'
import { silentLogger, type Logger } from './logger.ts'
import type { Persistence } from './persistence.ts'
import { Room } from './room.ts'
import { createStaticHandler } from './static.ts'

const SOCKET_PATTERN = new RegExp(`^/(ws|ws-view)/(${ID})$`)

export interface ServerOptions {
  readonly port: number
  readonly host?: string
  readonly persistence: Persistence
  readonly bus?: Bus
  readonly logger?: Logger
  readonly staticDir?: string | null
  readonly saveDebounceMs?: number
  readonly saveMaxWaitMs?: number
  readonly versionIntervalMs?: number
  readonly maxVersions?: number
  readonly maxLogChunks?: number
  readonly unloadDelayMs?: number
  readonly heartbeatMs?: number
  readonly maxPayload?: number
}

export interface RunningServer {
  readonly port: number
  readonly roomCount: number
  readonly connectionCount: number
  close(): Promise<void>
}

type AliveSocket = WebSocket & { isAlive?: boolean }

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const logger = options.logger ?? silentLogger
  const rooms = new Map<string, Promise<Room>>()
  const unloadTimers = new Map<string, NodeJS.Timeout>()
  const serveStatic = options.staticDir ? createStaticHandler(options.staticDir) : null
  const api = createApi(options.persistence, async (name) => {
    await (await rooms.get(name))?.flush()
  })
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayload ?? 2 * 1024 * 1024,
  })

  const unloadDelay = options.unloadDelayMs ?? 30_000

  const scheduleUnload = (room: Room) => {
    if (room.connectionCount > 0) return
    clearTimeout(unloadTimers.get(room.name))
    unloadTimers.set(
      room.name,
      setTimeout(() => {
        unloadTimers.delete(room.name)
        void (async () => {
          if (room.connectionCount > 0) return
          await room.flush()
          if (room.connectionCount > 0) return
          rooms.delete(room.name)
          room.destroy()
          logger.info('room unloaded', { room: room.name })
        })()
      }, unloadDelay),
    )
  }

  const getRoom = (name: string): Promise<Room> => {
    clearTimeout(unloadTimers.get(name))
    unloadTimers.delete(name)
    let room = rooms.get(name)
    if (!room) {
      room = Room.load({
        name,
        persistence: options.persistence,
        logger,
        saveDebounceMs: options.saveDebounceMs ?? 1000,
        saveMaxWaitMs: options.saveMaxWaitMs ?? 10_000,
        versionIntervalMs: options.versionIntervalMs ?? 10 * 60_000,
        maxVersions: options.maxVersions ?? 30,
        maxLogChunks: options.maxLogChunks ?? 500,
        bus: options.bus,
        onDisconnect: scheduleUnload,
      })
      rooms.set(name, room)
      room.then(
        () => logger.info('room loaded', { room: name }),
        () => rooms.delete(name),
      )
    }
    return room
  }

  const http = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, connections: wss.clients.size }))
        return
      }
      if (await api(req, res)) return
      if (serveStatic && (await serveStatic(req, res))) return
      throw new HttpError(404, 'Not found')
    })().catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500
      if (status === 500) logger.error('request failed', { url: req.url, error: String(error) })
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain' })
      res.end(error instanceof HttpError ? error.message : '')
    })
  })

  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? '/', 'http://local').pathname
    const match = SOCKET_PATTERN.exec(pathname)
    if (!match) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      return
    }
    const readOnly = match[1] === 'ws-view'
    const id = match[2]!
    wss.handleUpgrade(req, socket, head, (ws: AliveSocket) => {
      ws.isAlive = true
      ws.on('pong', () => (ws.isAlive = true))
      wss.emit('connection', ws, req)

      const buffered: Uint8Array[] = []
      const buffer = (data: Buffer) => buffered.push(new Uint8Array(data))
      ws.on('message', buffer)
      const room = readOnly
        ? resolveView(options.persistence, id).then((name) => (name ? getRoom(name) : null))
        : getRoom(id)
      room.then(
        (room) => {
          ws.off('message', buffer)
          if (!room) return ws.close(4404, 'unknown view link')
          if (ws.readyState !== ws.OPEN) return scheduleUnload(room)
          room.connect(ws, buffered, readOnly)
        },
        (error: unknown) => {
          logger.error('room load failed', { id, error: String(error) })
          ws.close(1011, 'room unavailable')
        },
      )
    })
  })

  const heartbeat = setInterval(() => {
    for (const client of wss.clients as Set<AliveSocket>) {
      if (client.isAlive === false) {
        client.terminate()
        continue
      }
      client.isAlive = false
      client.ping()
    }
  }, options.heartbeatMs ?? 30_000)

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(options.port, options.host ?? '0.0.0.0', () => {
      http.off('error', reject)
      resolve()
    })
  })
  const port = (http.address() as AddressInfo).port
  logger.info('listening', { port, staticDir: options.staticDir ?? null })

  return {
    port,
    get roomCount() {
      return rooms.size
    },
    get connectionCount() {
      return wss.clients.size
    },
    async close() {
      clearInterval(heartbeat)
      for (const timer of unloadTimers.values()) clearTimeout(timer)
      unloadTimers.clear()
      const loaded = await Promise.allSettled(rooms.values())
      for (const result of loaded) {
        if (result.status === 'fulfilled') result.value.closeAll(1001, 'server shutting down')
      }
      for (const client of wss.clients) client.terminate()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
      await new Promise<void>((resolve) => http.close(() => resolve()))
      for (const result of loaded) {
        if (result.status !== 'fulfilled') continue
        await result.value.flush()
        result.value.destroy()
      }
      rooms.clear()
      logger.info('stopped')
    },
  }
}
