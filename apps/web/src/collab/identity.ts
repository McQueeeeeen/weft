import { MAX_NAME_LENGTH, PRESENCE_COLOR_COUNT, type PresenceUser } from '@weft/core'
import { readStored, writeStored } from './storage.ts'

const KEY = 'weft:user'

function parse(raw: unknown): PresenceUser | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { name, color } = raw as Record<string, unknown>
  if (typeof name !== 'string' || name.trim() === '') return null
  if (typeof color !== 'number' || !Number.isInteger(color)) return null
  return { name: name.slice(0, MAX_NAME_LENGTH), color: Math.abs(color) % PRESENCE_COLOR_COUNT }
}

export function loadIdentity(): PresenceUser {
  const stored = readStored(KEY, parse)
  if (stored) return stored
  const identity = {
    name: `Guest ${Math.floor(100 + Math.random() * 900)}`,
    color: Math.floor(Math.random() * PRESENCE_COLOR_COUNT),
  }
  writeStored(KEY, identity)
  return identity
}

export function saveIdentity(user: PresenceUser): void {
  writeStored(KEY, user)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}
