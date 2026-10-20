import { createId } from '@weft/core'

export interface BoardTarget {
  readonly id: string
  readonly readOnly: boolean
}

const BOARD_PATH = /^\/(b|v)\/([A-Za-z0-9_-]{1,64})\/?$/

export function boardFromPath(): BoardTarget | null {
  const match = BOARD_PATH.exec(location.pathname)
  return match ? { id: match[2]!, readOnly: match[1] === 'v' } : null
}

export const newBoardUrl = () => `/b/${createId()}`
