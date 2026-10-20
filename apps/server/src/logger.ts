type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export function createLogger(
  minLevel: Level = 'info',
  write = (line: string) => process.stdout.write(line),
): Logger {
  const log = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel]) return
    write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }) + '\n')
  }
  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
  }
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} }

export const isLevel = (v: string | undefined): v is Level => v !== undefined && v in ORDER
