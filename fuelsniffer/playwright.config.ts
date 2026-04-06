import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: '**/*.playwright.ts',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4000',
    headless: true,
  },
  timeout: 30_000,
})
