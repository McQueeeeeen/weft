import type { ColorToken, PaletteRole } from '@weft/core'

export type ThemeName = 'light' | 'dark'

export interface Theme {
  readonly name: ThemeName
  readonly board: string
  readonly grid: string
  readonly surface: string
  readonly content: Record<ColorToken, Record<PaletteRole, string>>
}

export interface Thread {
  readonly name: string
  readonly fill: string
  readonly text: string
}

const STICKY_TEXT = '#14161A'

const LIGHT: Theme = {
  name: 'light',
  board: '#F1F2F4',
  grid: '#D2D6DC',
  surface: '#FCFCFD',
  content: {
    ink: { stroke: '#14161A', tint: '#E2E4E8', sticky: '#E2E4E8', stickyText: STICKY_TEXT },
    red: { stroke: '#C92A2A', tint: '#FFE3E3', sticky: '#FFC9C9', stickyText: STICKY_TEXT },
    orange: { stroke: '#B35309', tint: '#FFE8CC', sticky: '#FFD8A8', stickyText: STICKY_TEXT },
    yellow: { stroke: '#7A5D00', tint: '#FFF3BF', sticky: '#FFEC99', stickyText: STICKY_TEXT },
    green: { stroke: '#24753A', tint: '#D3F9D8', sticky: '#B2F2BB', stickyText: STICKY_TEXT },
    blue: { stroke: '#1864AB', tint: '#D0EBFF', sticky: '#A5D8FF', stickyText: STICKY_TEXT },
    violet: { stroke: '#6741D9', tint: '#E5DBFF', sticky: '#D0BFFF', stickyText: STICKY_TEXT },
  },
}

const DARK: Theme = {
  name: 'dark',
  board: '#1A1C20',
  grid: '#30343B',
  surface: '#24272C',
  content: {
    ink: { stroke: '#E9EBEE', tint: '#2E3138', sticky: '#D5D8DE', stickyText: STICKY_TEXT },
    red: { stroke: '#FF8787', tint: '#4A2426', sticky: '#F2B8B8', stickyText: STICKY_TEXT },
    orange: { stroke: '#FFA94D', tint: '#4A3020', sticky: '#F2C894', stickyText: STICKY_TEXT },
    yellow: { stroke: '#FFD43B', tint: '#463D1C', sticky: '#EBD67E', stickyText: STICKY_TEXT },
    green: { stroke: '#69DB7C', tint: '#1F3B26', sticky: '#A3DDAB', stickyText: STICKY_TEXT },
    blue: { stroke: '#74C0FC', tint: '#1B3247', sticky: '#9CC8EB', stickyText: STICKY_TEXT },
    violet: { stroke: '#B197FC', tint: '#2F2747', sticky: '#C2B4EB', stickyText: STICKY_TEXT },
  },
}

export const THEMES: Record<ThemeName, Theme> = { light: LIGHT, dark: DARK }

export const THREADS: readonly Thread[] = [
  { name: 'Orange', fill: '#E8590C', text: '#14161A' },
  { name: 'Cobalt', fill: '#4263EB', text: '#FFFFFF' },
  { name: 'Green', fill: '#2F9E44', text: '#14161A' },
  { name: 'Violet', fill: '#7950F2', text: '#FFFFFF' },
  { name: 'Teal', fill: '#1098AD', text: '#14161A' },
  { name: 'Red', fill: '#E03131', text: '#FFFFFF' },
  { name: 'Pink', fill: '#D6336C', text: '#FFFFFF' },
  { name: 'Blue', fill: '#1971C2', text: '#FFFFFF' },
]

export const thread = (index: number): Thread => THREADS[index % THREADS.length] ?? THREADS[0]!

export const withAlpha = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const BOARD_FONT = '"Onest Variable", system-ui, sans-serif'
