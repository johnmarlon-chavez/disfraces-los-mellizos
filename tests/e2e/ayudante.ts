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
  /** Variables de entorno extra, por ejemplo DISFRACES_RESPALDO_CADA_MS. */
  entornoExtra?: Record<string, string>
}

/** Abre la app compilada con una carpeta de datos temporal y vacía. */
export async function lanzarApp(opciones: OpcionesLanzar = {}): Promise<AppDePrueba> {
  const { cuentas = true, sesion = 'duena', inactividadMs = 60 * 60_000, args = [] } = opciones
  const carpetaDatos = opciones.carpetaDatos ?? mkdtempSync(join(tmpdir(), 'disfraces-e2e-'))
  // Terminales como la de VS Code definen ELECTRON_RUN_AS_NODE; con eso Electron no abriría ventanas.
  const { ELECTRON_RUN_AS_NODE: _, ...entorno } = process.env
  // DISFRACES_E2E_EXE: el programa empaquetado (npm run test:instalado); si no, la app compilada.
  const exe = process.env.DISFRACES_E2E_EXE
  const app = await electron.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: exe ? args : ['.', ...args],
    env: { ...entorno, DISFRACES_DATOS_DIR: carpetaDatos, DISFRACES_INACTIVIDAD_MS: String(inactividadMs), DISFRACES_NO_RELANZAR: '1', ...opciones.entornoExtra } as Record<string, string>
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

/**
 * Ejecuta código sobre la base de una carpeta de datos (con la app cerrada), con el binario de
 * Electron en modo Node: better-sqlite3 está compilado para Electron. `db` y `bcrypt` quedan a mano.
 */
export async function enBase(carpetaDatos: string, codigo: string): Promise<string> {
  const { spawnSync } = await import('node:child_process')
  const electronRuta = (await import('electron')).default as unknown as string
  const script = `
    const Database = require(${JSON.stringify(join(process.cwd(), 'node_modules', 'better-sqlite3'))})
    const bcrypt = require(${JSON.stringify(join(process.cwd(), 'node_modules', 'bcryptjs'))})
    const db = new Database(${JSON.stringify(join(carpetaDatos, 'datos.db'))})
    try { const r = (() => { ${codigo} })(); if (r !== undefined) console.log(JSON.stringify(r)) } finally { db.close() }
  `
  const r = spawnSync(electronRuta, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr || `Salida ${r.status}`)
  return r.stdout.trim()
}
