import { join } from 'node:path'
import { defineConfig } from '@playwright/test'
import paquete from './package.json' with { type: 'json' }

// Las mismas pruebas E2E, pero contra el programa empaquetado por electron-builder
// (release/<versión>/win-unpacked): verifica que el instalador lleva todo lo necesario
// (better-sqlite3 fuera del .asar, fflate, fotos, herramientas de soporte).
process.env.DISFRACES_E2E_EXE ??= join(__dirname, 'release', paquete.version, 'win-unpacked', 'Disfraces Los Mellizos.exe')

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list'
})
