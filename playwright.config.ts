import { defineConfig } from '@playwright/test'

const PORT = 4321

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    ...(!process.env.CI && { channel: 'chrome' }),
  },
  webServer: {
    command: `pnpm build && node apps/server/src/index.ts`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      STATIC_DIR: 'apps/web/dist',
      DATA_DIR: 'test-results/data',
      LOG_LEVEL: 'warn',
    },
  },
})
