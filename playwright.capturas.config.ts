import { defineConfig } from '@playwright/test'

// Capturas de pantalla de la guía de uso (npm run capturas), con datos de prueba ficticios.
export default defineConfig({
  testDir: 'tests/capturas',
  timeout: 90_000,
  workers: 1,
  reporter: 'list'
})
