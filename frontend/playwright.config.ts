import { defineConfig } from '@playwright/test'

// Roda contra a stack do docker compose (http://localhost:8080) por padrão.
// PW_CHANNEL=msedge|chrome usa um navegador já instalado; sem ele, use `npx playwright install chromium`.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    channel: process.env.PW_CHANNEL || undefined,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
