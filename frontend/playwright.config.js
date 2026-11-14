import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    // Keep the allowed localhost origin while selecting our IPv4 Vite instance.
    launchOptions: { args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] },
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === 'win32' ? 'msedge' : undefined),
    screenshot: 'only-on-failure',
  },
  webServer: [{
    command: 'java ../execution/src/main/java/lk/codecrew/execution/ExecutionServer.java',
    env: { EXECUTION_HOST: '127.0.0.1', EXECUTION_PORT: '8090', EXECUTION_ORIGIN: 'http://localhost:5173' },
    url: 'http://127.0.0.1:8090/health',
    reuseExistingServer: true,
    timeout: 30000,
  }, {
    command: 'mvn -f ../backend/pom.xml compile exec:java',
    env: { CODECREW_PORT: '18080', CODECREW_HOST: '127.0.0.1' },
    port: 18080,
    reuseExistingServer: false,
    timeout: 60000,
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    env: { VITE_COLLABORATION_URL: 'ws://127.0.0.1:18080/collaboration' },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 30000,
  }],
})
