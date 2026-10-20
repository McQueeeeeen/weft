import { resolve } from 'node:path'
import { createLogger, isLevel } from './logger.ts'
import { FilePersistence } from './persistence.ts'
import { startServer } from './server.ts'

const env = process.env
const logger = createLogger(isLevel(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info')

const server = await startServer({
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  persistence: new FilePersistence(resolve(env.DATA_DIR ?? 'data')),
  staticDir: env.STATIC_DIR ? resolve(env.STATIC_DIR) : null,
  logger,
})

let stopping = false
const shutdown = (signal: string) => {
  if (stopping) return
  stopping = true
  logger.info('shutting down', { signal })
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error('shutdown failed', { error: String(error) })
      process.exit(1)
    },
  )
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
