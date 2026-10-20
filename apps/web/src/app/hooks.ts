import type { Editor, Peer, Presence, PresenceUser } from '@weft/core'
import { useMemo } from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

export function useEditor<T>(editor: Editor, select: (editor: Editor) => T): T {
  return useSyncExternalStoreWithSelector(
    (onChange) => editor.subscribe(onChange),
    () => editor.version,
    null,
    () => select(editor),
    shallowEqual,
  )
}

export interface PersonSummary {
  readonly clientId: number
  readonly user: PresenceUser
}

export function usePeople(presence: Presence): readonly PersonSummary[] {
  const key = useSyncExternalStoreWithSelector(
    (onChange) => presence.subscribe(onChange),
    () => presence.peers(),
    null,
    (peers: readonly Peer[]) =>
      JSON.stringify(peers.map((p) => [p.clientId, p.user.name, p.user.color])),
  )
  return useMemo(() => {
    const rows = JSON.parse(key) as [number, string, number][]
    return rows.map(([clientId, name, color]) => ({ clientId, user: { name, color } }))
  }, [key])
}
