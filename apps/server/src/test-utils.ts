import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { MemoryPersistence } from './persistence.ts'
import { startServer, type RunningServer, type ServerOptions } from './server.ts'

export const cleanups: (() => Promise<void> | void)[] = []

export async function cleanup(): Promise<void> {
  while (cleanups.length > 0) await cleanups.pop()!()
}

export async function start(options: Partial<ServerOptions> = {}): Promise<RunningServer> {
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

export function connect(server: RunningServer, room: string, endpoint = 'ws') {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(`ws://127.0.0.1:${server.port}/${endpoint}`, room, doc, {
    WebSocketPolyfill: WebSocket,
    disableBc: true,
  })
  cleanups.push(() => {
    provider.destroy()
    doc.destroy()
  })
  return { doc, provider, map: doc.getMap<number>('test') }
}

export async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 10))
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
