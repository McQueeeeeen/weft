import { useEffect, useState, useSyncExternalStore } from 'react'
import { THEMES, type Theme, type ThemeName } from '../canvas/palette.ts'
import { readStored, writeStored } from '../collab/storage.ts'

export type ThemePreference = 'system' | ThemeName

const KEY = 'weft:theme'
const query = () => window.matchMedia('(prefers-color-scheme: dark)')

const parse = (raw: unknown): ThemePreference | null =>
  raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = query()
      q.addEventListener('change', onChange)
      return () => q.removeEventListener('change', onChange)
    },
    () => query().matches,
  )
}

export function useTheme(): {
  preference: ThemePreference
  theme: Theme
  setPreference: (p: ThemePreference) => void
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readStored(KEY, parse) ?? 'system',
  )
  const systemDark = useSystemDark()
  const name: ThemeName = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.dataset.theme = name
    document.documentElement.style.colorScheme = name
  }, [name])

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p)
    writeStored(KEY, p)
  }
  return { preference, theme: THEMES[name], setPreference }
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = window.matchMedia('(prefers-reduced-motion: reduce)')
      q.addEventListener('change', onChange)
      return () => q.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
}
