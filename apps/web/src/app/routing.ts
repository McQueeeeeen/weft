import { createId } from '@weft/core'

const BOARD_PATH = /^\/b\/([A-Za-z0-9_-]{1,64})\/?$/

export const boardIdFromPath = (): string | null => BOARD_PATH.exec(location.pathname)?.[1] ?? null

export const newBoardUrl = () => `/b/${createId()}`
