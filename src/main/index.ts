import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import type Database from 'better-sqlite3'
import { NOMBRE_TIENDA } from '../shared/constantes'
import { abrirBaseDeDatos } from './db/conexion'
import { mensajeParaUsuario } from './errores'
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

  registrarManejadores(db, {
    nombreTienda: NOMBRE_TIENDA,
    version: app.getVersion(),
    carpetaDatos: rutas.carpetaDatos,
    esDesarrollo: !app.isPackaged
  })

  Menu.setApplicationMenu(null)
  ventana = crearVentana()
}

// Una sola instancia: dos procesos escribiendo la misma base sería un riesgo.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!ventana) return
    if (ventana.isMinimized()) ventana.restore()
    ventana.focus()
  })

  app.whenReady().then(iniciar)

  app.on('window-all-closed', () => app.quit())

  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}
