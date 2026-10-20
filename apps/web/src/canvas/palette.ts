import type { ColorToken, PaletteRole } from '@weft/core'

export type ThemeName = 'light' | 'dark'

export interface Theme {
  readonly name: ThemeName
  readonly paper: string
  readonly dot: string
  readonly ink: string
  readonly accent: string
  readonly accentWash: string
  readonly content: Record<ColorToken, Record<PaletteRole, string>>
}

const STICKY_TEXT = '#1D1B18'

const LIGHT: Theme = {
  name: 'light',
  paper: '#F6F4EF',
  dot: '#CFC9BD',
  ink: '#1D1B18',
  accent: '#C2410C',
  accentWash: 'rgba(194, 65, 12, 0.08)',
  content: {
    ink: { stroke: '#1D1B18', tint: '#E9E6DF', sticky: '#E9E6DF', stickyText: STICKY_TEXT },
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
  paper: '#17181A',
  dot: '#34353A',
  ink: '#ECE9E2',
  accent: '#FF8A4C',
  accentWash: 'rgba(255, 138, 76, 0.1)',
  content: {
    ink: { stroke: '#ECE9E2', tint: '#2C2B29', sticky: '#D9D5CC', stickyText: STICKY_TEXT },
    red: { stroke: '#FF8787', tint: '#4A2426', sticky: '#F2B8B8', stickyText: STICKY_TEXT },
    orange: { stroke: '#FFA94D', tint: '#4A3020', sticky: '#F2C894', stickyText: STICKY_TEXT },
    yellow: { stroke: '#FFD43B', tint: '#463D1C', sticky: '#EBD67E', stickyText: STICKY_TEXT },
    green: { stroke: '#69DB7C', tint: '#1F3B26', sticky: '#A3DDAB', stickyText: STICKY_TEXT },
    blue: { stroke: '#74C0FC', tint: '#1B3247', sticky: '#9CC8EB', stickyText: STICKY_TEXT },
    violet: { stroke: '#B197FC', tint: '#2F2747', sticky: '#C2B4EB', stickyText: STICKY_TEXT },
  },
}

export const THEMES: Record<ThemeName, Theme> = { light: LIGHT, dark: DARK }

export const PRESENCE_COLORS: readonly { name: string; fill: string; text: string }[] = [
  { name: 'Vermilion', fill: '#C2410C', text: '#FFFFFF' },
  { name: 'Blue', fill: '#1864AB', text: '#FFFFFF' },
  { name: 'Green', fill: '#237032', text: '#FFFFFF' },
  { name: 'Purple', fill: '#9C36B5', text: '#FFFFFF' },
  { name: 'Yellow', fill: '#FCC419', text: '#1D1B18' },
  { name: 'Teal', fill: '#0B7285', text: '#FFFFFF' },
  { name: 'Red', fill: '#C92A2A', text: '#FFFFFF' },
  { name: 'Violet', fill: '#5F3DC4', text: '#FFFFFF' },
]

export const presenceColor = (index: number) =>
  PRESENCE_COLORS[index % PRESENCE_COLORS.length] ?? PRESENCE_COLORS[0]!

export const BOARD_FONT = '"IBM Plex Sans", system-ui, sans-serif'
