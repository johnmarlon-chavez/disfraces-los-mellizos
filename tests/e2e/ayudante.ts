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
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        return !!win && win.isVisible() && win.isMaximized()
      })
    )
    .toBe(true)
  // En equipos con dos monitores la ventana puede abrir en el segundo, y el primer ajuste a veces
  // no se aplica: se lleva al monitor principal y se reintenta hasta que el contenido mida 1366 px.
  await expect
    .poll(
      async () => {
        await app.evaluate(({ BrowserWindow, screen }) => {
          const win = BrowserWindow.getAllWindows()[0]
          if (win.isMaximized()) win.unmaximize()
          const area = screen.getPrimaryDisplay().workArea
          win.setPosition(area.x, area.y)
          win.setContentSize(1366, 768)
        })
        return ventana.evaluate(() => window.innerWidth)
      },
      { intervals: [200, 500, 1000], timeout: 15_000 }
    )
    .toBe(1366)
}

export async function hayDesbordeHorizontal(ventana: Page): Promise<boolean> {
  return ventana.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}
