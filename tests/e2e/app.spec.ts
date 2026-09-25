import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

let app: ElectronApplication
let ventana: Page
let carpetaDatos: string

test.beforeAll(async () => {
  carpetaDatos = mkdtempSync(join(tmpdir(), 'disfraces-e2e-'))
  // Terminales como la de VS Code definen ELECTRON_RUN_AS_NODE; con eso Electron no abriría ventanas.
  const { ELECTRON_RUN_AS_NODE: _, ...entorno } = process.env
  app = await electron.launch({
    args: ['.'],
    env: { ...entorno, DISFRACES_DATOS_DIR: carpetaDatos } as Record<string, string>
  })
  ventana = await app.firstWindow()
  await ventana.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
  rmSync(carpetaDatos, { recursive: true, force: true })
})

test('abre con el nombre de la tienda y crea la base de datos', async () => {
  await expect(ventana).toHaveTitle('Disfraces Los Mellizos')
  await expect(ventana.getByRole('heading', { name: 'Inicio' })).toBeVisible()
  expect(existsSync(join(carpetaDatos, 'datos.db'))).toBe(true)
  expect(existsSync(join(carpetaDatos, 'fotos'))).toBe(true)
})

test('el renderer no tiene acceso a Node', async () => {
  const tipos = await ventana.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    api: typeof (window as unknown as { api?: unknown }).api
  }))
  expect(tipos).toEqual({ require: 'undefined', process: 'undefined', api: 'object' })
})

test('el menú lateral navega por todas las secciones', async () => {
  const menu = ventana.getByRole('navigation', { name: 'Menú principal' })
  for (const seccion of ['Alquileres', 'Disfraces', 'Clientes', 'Reportes', 'Configuración', 'Inicio']) {
    await menu.getByRole('link', { name: seccion }).click()
    await expect(ventana.getByRole('heading', { level: 1, name: seccion })).toBeVisible()
  }
})

test('Configuración muestra datos leídos por IPC desde SQLite', async () => {
  await ventana.getByRole('link', { name: 'Configuración' }).click()
  await expect(ventana.getByText('S/ 5.00')).toBeVisible()
  await expect(ventana.getByText(carpetaDatos)).toBeVisible()
})

test('a 1366×768 el menú y el contenido se ven sin desbordarse', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setContentSize(1366, 768)
  })
  await ventana.waitForFunction(() => window.innerWidth === 1366)
  const desborde = await ventana.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > window.innerWidth,
    vertical: document.documentElement.scrollHeight > window.innerHeight
  }))
  expect(desborde).toEqual({ horizontal: false, vertical: false })
  await expect(ventana.getByRole('link', { name: 'Configuración' })).toBeInViewport()
})
