import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'

export interface AppDePrueba {
  app: ElectronApplication
  ventana: Page
  carpetaDatos: string
  /** Cierra la app y borra la carpeta de datos (salvo `conservarDatos`, para volver a abrirla). */
  cerrar: (conservarDatos?: boolean) => Promise<void>
}

export const CONTRASENA_DUENA = 'mi gato come pan 7'
export const CONTRASENA_TRABAJADORES = 'tienda de la esquina'

export interface OpcionesLanzar {
  /**
   * cuentas: crea las cuentas (primer uso) por la API. Por defecto true.
   * sesion: con qué cuenta queda abierta la app (por defecto la dueña); null = en la pantalla de ingreso.
   */
  cuentas?: boolean
  sesion?: 'duena' | 'trabajadores' | null
  /** Tiempo de inactividad de la dueña; por defecto una hora para que no interfiera con las pruebas. */
  inactividadMs?: number
  /** Reutiliza una carpeta de datos (de un lanzamiento anterior cerrado con `conservarDatos`). */
  carpetaDatos?: string
  /** Argumentos extra, por ejemplo '--restablecer-duena'. */
  args?: string[]
}

/** Abre la app compilada con una carpeta de datos temporal y vacía. */
export async function lanzarApp(opciones: OpcionesLanzar = {}): Promise<AppDePrueba> {
  const { cuentas = true, sesion = 'duena', inactividadMs = 60 * 60_000, args = [] } = opciones
  const carpetaDatos = opciones.carpetaDatos ?? mkdtempSync(join(tmpdir(), 'disfraces-e2e-'))
  // Terminales como la de VS Code definen ELECTRON_RUN_AS_NODE; con eso Electron no abriría ventanas.
  const { ELECTRON_RUN_AS_NODE: _, ...entorno } = process.env
  const app = await electron.launch({
    args: ['.', ...args],
    env: { ...entorno, DISFRACES_DATOS_DIR: carpetaDatos, DISFRACES_INACTIVIDAD_MS: String(inactividadMs), DISFRACES_NO_RELANZAR: '1' } as Record<string, string>
  })
  const ventana = await app.firstWindow()
  await ventana.waitForLoadState('domcontentloaded')
  if (cuentas) {
    await ventana.evaluate(
      async ([duena, trabajadores, cuenta]) => {
        const api = (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api
        const codigo = await api.acceso.prepararCodigo()
        if (!codigo.ok) throw new Error(codigo.error)
        const r = await api.acceso.crearCuentas({ contrasenaDuena: duena, contrasenaTrabajadores: trabajadores, codigoConfirmado: codigo.datos })
        if (!r.ok) throw new Error(r.error)
        await api.acceso.salir()
        if (cuenta) {
          const i = await api.acceso.ingresar(cuenta, cuenta === 'duena' ? duena : trabajadores)
          if (!i.ok) throw new Error(i.error)
        }
      },
      [CONTRASENA_DUENA, CONTRASENA_TRABAJADORES, sesion] as const
    )
    await ventana.reload()
    await ventana.waitForLoadState('domcontentloaded')
  }
  return {
    app,
    ventana,
    carpetaDatos,
    cerrar: async (conservarDatos = false) => {
      // Tras restaurar, la app ya terminó sola.
      await app.close().catch(() => {})
      if (!conservarDatos) rmSync(carpetaDatos, { recursive: true, force: true })
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
