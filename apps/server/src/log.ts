import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'
import type { Persistence } from './persistence.ts'

export type LogEntry = [at: number, update: Uint8Array]

export const logDir = (room: string) => `log/${room}`
export const logBaseKey = (room: string) => `log-base/${room}`

export function encodeEntries(entries: readonly LogEntry[], encoder = encoding.createEncoder()) {
  for (const [at, update] of entries) {
    encoding.writeVarUint(encoder, at)
    encoding.writeVarUint8Array(encoder, update)
  }
  return encoding.toUint8Array(encoder)
}

export function decodeEntries(data: Uint8Array): LogEntry[] {
  const decoder = decoding.createDecoder(data)
  const entries: LogEntry[] = []
  while (decoding.hasContent(decoder)) {
    entries.push([decoding.readVarUint(decoder), decoding.readVarUint8Array(decoder)])
  }
  return entries
}

async function chunks(persistence: Persistence, room: string): Promise<string[]> {
  const names = await persistence.list(logDir(room))
  names.sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b))
  return names.map((name) => `${logDir(room)}/${name}`)
}

const read = async (persistence: Persistence, keys: readonly string[]) =>
  (await Promise.all(keys.map((key) => persistence.get(key)))).flatMap((data) =>
    data ? decodeEntries(data) : [],
  )

export async function seedLog(persistence: Persistence, room: string, state: Uint8Array) {
  if (await persistence.get(logBaseKey(room))) return
  if ((await persistence.list(logDir(room))).length === 0) {
    await persistence.put(logBaseKey(room), state)
  }
}

export async function compactLog(persistence: Persistence, room: string, maxChunks: number) {
  const keys = await chunks(persistence, room)
  if (keys.length <= maxChunks) return
  const old = keys.slice(0, keys.length - Math.floor(maxChunks / 2))
  const doc = new Y.Doc()
  const base = await persistence.get(logBaseKey(room))
  if (base) Y.applyUpdate(doc, base)
  for (const [, update] of await read(persistence, old)) Y.applyUpdate(doc, update)
  await persistence.put(logBaseKey(room), Y.encodeStateAsUpdate(doc))
  doc.destroy()
  await Promise.all(old.map((key) => persistence.delete(key)))
}

export async function readReplay(persistence: Persistence, room: string): Promise<Uint8Array> {
  const entries = await read(persistence, await chunks(persistence, room))
  entries.sort((a, b) => a[0] - b[0])
  const encoder = encoding.createEncoder()
  encoding.writeVarUint8Array(
    encoder,
    (await persistence.get(logBaseKey(room))) ?? new Uint8Array(),
  )
  return encodeEntries(entries, encoder)
}
