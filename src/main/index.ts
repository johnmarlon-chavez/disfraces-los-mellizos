import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import type Database from 'better-sqlite3'
import { NOMBRE_TIENDA } from '../shared/constantes'
import { crearServicioAcceso } from './acceso'
import { abrirBaseDeDatos } from './db/conexion'
import { registrarAperturaSoporte } from './db/soporte'
import { mensajeParaUsuario } from './errores'
import { atenderProtocoloFotos, registrarEsquemaFotos } from './fotos'
import { registrarManejadores, registrarManejadoresSoporte } from './ipc'
import { obtenerRutas } from './rutas'

let db: Database.Database | null = null
let ventana: BrowserWindow | null = null

/**
 * Herramientas de soporte (con el programa cerrado), protegidas por la clave de soporte:
 * - "<programa>.exe --definir-clave-soporte": el técnico define (o cambia) la clave al instalar.
 * - "<programa>.exe --restablecer-duena": con la clave, código de recuperación nuevo para la dueña.
 * Abren una ventana pequeña que solo tiene los canales de soporte; el resto del programa no existe.
 */
type ModoSoporte = 'restablecer' | 'definir-clave'
const modoSoporte: ModoSoporte | null = process.argv.includes('--restablecer-duena')
  ? 'restablecer'
  : process.argv.includes('--definir-clave-soporte')
    ? 'definir-clave'
    : null

function crearVentana(soporte: ModoSoporte | null = null): BrowserWindow {
  const win = new BrowserWindow({
    title: soporte ? `${NOMBRE_TIENDA} · Soporte` : NOMBRE_TIENDA,
    width: soporte ? 820 : 1366,
    height: soporte ? 680 : 768,
    minWidth: soporte ? 640 : 1024,
    minHeight: soporte ? 560 : 700,
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
    if (!soporte) win.maximize()
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

  const hash = soporte ? `/soporte/${soporte}` : ''
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash ? `#${hash}` : ''}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
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

  const info = {
    nombreTienda: NOMBRE_TIENDA,
    version: app.getVersion(),
    carpetaDatos: rutas.carpetaDatos,
    esDesarrollo: !app.isPackaged
  }
  Menu.setApplicationMenu(null)
  if (modoSoporte) {
    registrarAperturaSoporte(db, modoSoporte === 'restablecer' ? 'restablecer_duena' : 'definir_clave')
    registrarManejadoresSoporte(db, info)
    ventana = crearVentana(modoSoporte)
    return
  }

  atenderProtocoloFotos(rutas.fotos)
  // DISFRACES_INACTIVIDAD_MS: solo para las pruebas E2E (no esperar 10 minutos reales).
  const inactividadMs = Number(process.env.DISFRACES_INACTIVIDAD_MS) || undefined
  registrarManejadores(db, info, rutas, crearServicioAcceso(db, { inactividadMs }))
  ventana = crearVentana()
}

// Con una carpeta de datos propia (pruebas E2E), también userData va aparte: así el bloqueo de
// instancia única no choca con la app abierta de todos los días.
if (process.env.DISFRACES_DATOS_DIR) app.setPath('userData', join(process.env.DISFRACES_DATOS_DIR, 'electron'))

// Una sola instancia: dos procesos escribiendo la misma base sería un riesgo.
if (!app.requestSingleInstanceLock()) {
  if (modoSoporte) {
    // Con el programa abierto no se puede: avisar en vez de salir sin decir nada.
    void app.whenReady().then(() => {
      dialog.showErrorBox(NOMBRE_TIENDA, 'Primero cierre el programa y vuelva a ejecutar la herramienta.')
      app.exit(1)
    })
  } else {
    app.quit()
  }
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
