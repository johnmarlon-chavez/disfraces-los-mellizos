import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import type Database from 'better-sqlite3'
import { NOMBRE_TIENDA } from '../shared/constantes'
import { crearServicioAcceso } from './acceso'
import { abrirBaseDeDatos } from './db/conexion'
import { hayCuentas, restablecerCodigoDuena } from './db/usuarios'
import { mensajeParaUsuario } from './errores'
import { atenderProtocoloFotos, registrarEsquemaFotos } from './fotos'
import { registrarManejadores } from './ipc'
import { obtenerRutas } from './rutas'

let db: Database.Database | null = null
let ventana: BrowserWindow | null = null

function crearVentana(): BrowserWindow {
  const win = new BrowserWindow({
    title: NOMBRE_TIENDA,
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // La app nunca navega fuera de sí misma; los enlaces externos se abren en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (evento, url) => {
    if (url !== win.webContents.getURL()) evento.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function iniciar(): void {
  const rutas = obtenerRutas()
  try {
    db = abrirBaseDeDatos(rutas.baseDeDatos)
  } catch (error) {
    console.error('[inicio] No se pudo abrir la base de datos:', error)
    dialog.showErrorBox(NOMBRE_TIENDA, `No se pudieron abrir los datos del sistema.\n\n${mensajeParaUsuario(error)}`)
    app.exit(1)
    return
  }

  atenderProtocoloFotos(rutas.fotos)
  // DISFRACES_INACTIVIDAD_MS: solo para las pruebas E2E (no esperar 10 minutos reales).
  const inactividadMs = Number(process.env.DISFRACES_INACTIVIDAD_MS) || undefined
  registrarManejadores(
    db,
    {
      nombreTienda: NOMBRE_TIENDA,
      version: app.getVersion(),
      carpetaDatos: rutas.carpetaDatos,
      esDesarrollo: !app.isPackaged
    },
    rutas,
    crearServicioAcceso(db, { inactividadMs })
  )

  Menu.setApplicationMenu(null)
  ventana = crearVentana()
}

/**
 * Herramienta de soporte: "<programa>.exe --restablecer-duena" (con el programa cerrado).
 * Para cuando la dueña perdió su contraseña y su código de recuperación: genera un código
 * nuevo, lo muestra y cierra. No cambia ninguna contraseña ni ningún dato del negocio.
 */
async function restablecerDuena(): Promise<void> {
  const titulo = `${NOMBRE_TIENDA} · Soporte`
  try {
    const base = abrirBaseDeDatos(obtenerRutas().baseDeDatos)
    try {
      if (!hayCuentas(base)) {
        await dialog.showMessageBox({ type: 'info', title: titulo, message: 'Todavía no se crearon las cuentas. Abra el programa normalmente.' })
        return
      }
      const codigo = restablecerCodigoDuena(base)
      await dialog.showMessageBox({
        type: 'warning',
        title: titulo,
        message: `Código de recuperación nuevo:\n\n${codigo}`,
        detail:
          'Anótelo en papel. Abra el programa, elija "Dueña" y luego "¿Olvidó su contraseña?", ' +
          'escriba este código y elija una contraseña nueva. El código anterior ya no sirve.'
      })
    } finally {
      base.close()
    }
  } catch (error) {
    console.error('[soporte] No se pudo restablecer:', error)
    dialog.showErrorBox(titulo, `No se pudo generar el código.\n\n${mensajeParaUsuario(error)}`)
  }
}

// Con una carpeta de datos propia (pruebas E2E), también userData va aparte: así el bloqueo de
// instancia única no choca con la app abierta de todos los días.
if (process.env.DISFRACES_DATOS_DIR) app.setPath('userData', join(process.env.DISFRACES_DATOS_DIR, 'electron'))

// Una sola instancia: dos procesos escribiendo la misma base sería un riesgo.
if (!app.requestSingleInstanceLock()) {
  if (process.argv.includes('--restablecer-duena')) {
    // Con el programa abierto no se puede: avisar en vez de salir sin decir nada.
    void app.whenReady().then(() => {
      dialog.showErrorBox(NOMBRE_TIENDA, 'Primero cierre el programa y vuelva a ejecutar la herramienta.')
      app.exit(1)
    })
  } else {
    app.quit()
  }
} else if (process.argv.includes('--restablecer-duena')) {
  void app.whenReady().then(async () => {
    await restablecerDuena()
    app.exit(0)
  })
} else {
  app.on('second-instance', () => {
    if (!ventana) return
    if (ventana.isMinimized()) ventana.restore()
    ventana.focus()
  })

  // Interfaz de Chromium en español de Perú: los campos de fecha muestran dd/mm/aaaa.
  app.commandLine.appendSwitch('lang', 'es-PE')
  registrarEsquemaFotos()
  app.whenReady().then(iniciar)

  app.on('window-all-closed', () => app.quit())

  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}
