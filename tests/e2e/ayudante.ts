import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

export interface AppDePrueba {
  app: ElectronApplication
  ventana: Page
  carpetaDatos: string
  cerrar: () => Promise<void>
}

/** Abre la app compilada con una carpeta de datos temporal y vacía. */
export async function lanzarApp(): Promise<AppDePrueba> {
  const carpetaDatos = mkdtempSync(join(tmpdir(), 'disfraces-e2e-'))
  // Terminales como la de VS Code definen ELECTRON_RUN_AS_NODE; con eso Electron no abriría ventanas.
  const { ELECTRON_RUN_AS_NODE: _, ...entorno } = process.env
  const app = await electron.launch({
    args: ['.'],
    env: { ...entorno, DISFRACES_DATOS_DIR: carpetaDatos } as Record<string, string>
  })
  const ventana = await app.firstWindow()
  await ventana.waitForLoadState('domcontentloaded')
  return {
    app,
    ventana,
    carpetaDatos,
    cerrar: async () => {
      await app.close()
      rmSync(carpetaDatos, { recursive: true, force: true })
    }
  }
}

/** Ajusta la ventana a 1366×768 (resolución mínima del CLAUDE.md). */
export async function ventanaMinima(app: ElectronApplication, ventana: Page): Promise<void> {
  // La app maximiza la ventana al mostrarla; esperar a eso para que no pise el nuevo tamaño.
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false))
    .toBe(true)
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setContentSize(1366, 768)
  })
  await ventana.waitForFunction(() => window.innerWidth === 1366)
}

export async function hayDesbordeHorizontal(ventana: Page): Promise<boolean> {
  return ventana.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}
