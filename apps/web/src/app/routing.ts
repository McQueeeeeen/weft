import { createId } from '@weft/core'

const BOARD_PATH = /^\/b\/([A-Za-z0-9_-]{1,64})\/?$/

export function resolveBoardId(): string {
  const match = BOARD_PATH.exec(location.pathname)
  if (match) return match[1]!
  const id = createId()
  history.replaceState(null, '', `/b/${id}${location.search}`)
  return id
}

export const newBoardUrl = () => `/b/${createId()}`
