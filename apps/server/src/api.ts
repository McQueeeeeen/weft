import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import * as Y from 'yjs'
import type { Persistence } from './persistence.ts'

export const ID = '[A-Za-z0-9_-]{1,64}'
const MAX_ASSET_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
const EXTENSION_TYPES = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([t, e]) => [e, t]))

const routes = {
  asset: new RegExp(`^/assets/([a-f0-9]{64}\\.(?:png|jpg|gif|webp))$`),
  view: new RegExp(`^/api/rooms/(${ID})/view$`),
  versions: new RegExp(`^/api/rooms/(${ID})/versions$`),
  version: new RegExp(`^/api/rooms/(${ID})/versions/(\\d{1,16})$`),
}

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function resolveView(
  persistence: Persistence,
  viewId: string,
): Promise<string | null> {
  const room = await persistence.get(`views/${viewId}`)
  return room ? new TextDecoder().decode(room) : null
}

export function createApi(persistence: Persistence) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? '/', 'http://local').pathname
    let match: RegExpExecArray | null

    if (req.method === 'POST' && path === '/api/assets') {
      const ext = IMAGE_TYPES[req.headers['content-type'] ?? '']
      if (!ext) throw new HttpError(415, 'Only PNG, JPEG, GIF and WebP images are accepted.')
      const body = await readBody(req, MAX_ASSET_BYTES)
      const name = `${createHash('sha256').update(body).digest('hex')}.${ext}`
      if (!(await persistence.get(`assets/${name}`))) await persistence.put(`assets/${name}`, body)
      return json(res, 201, { url: `/assets/${name}` })
    }

    if (req.method === 'GET' && (match = routes.asset.exec(path))) {
      const name = match[1]!
      const data = await persistence.get(`assets/${name}`)
      if (!data) throw new HttpError(404, 'Not found')
      res.writeHead(200, {
        'Content-Type': EXTENSION_TYPES[name.split('.')[1]!]!,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(data)
      return true
    }

    if (req.method === 'POST' && (match = routes.view.exec(path))) {
      const room = match[1]!
      const existing = await persistence.get(`view-of/${room}`)
      if (existing) return json(res, 200, { viewId: new TextDecoder().decode(existing) })
      const viewId = randomBytes(9).toString('base64url')
      await persistence.put(`views/${viewId}`, new TextEncoder().encode(room))
      await persistence.put(`view-of/${room}`, new TextEncoder().encode(viewId))
      return json(res, 201, { viewId })
    }

    if (req.method === 'GET' && (match = routes.versions.exec(path))) {
      const dir = `versions/${match[1]!}`
      const ids = (await persistence.list(dir)).map(Number).sort((a, b) => b - a)
      const versions = await Promise.all(
        ids.map(async (at) => ({
          at,
          objects: countShapes((await persistence.get(`${dir}/${at}`))!),
        })),
      )
      return json(res, 200, versions)
    }

    if (req.method === 'GET' && (match = routes.version.exec(path))) {
      const data = await persistence.get(`versions/${match[1]!}/${match[2]!}`)
      if (!data) throw new HttpError(404, 'Not found')
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(data)
      return true
    }

    return false
  }
}

function countShapes(state: Uint8Array): number {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  const size = doc.getMap('shapes').size
  doc.destroy()
  return size
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
  return true
}

function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, 'Images are limited to 5 MB.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}
