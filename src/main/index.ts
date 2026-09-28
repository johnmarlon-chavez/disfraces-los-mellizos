import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import type Database from 'better-sqlite3'
import { NOMBRE_TIENDA } from '../shared/constantes'
import { crearServicioAcceso } from './acceso'
import { registrarAuditoria } from './db/auditoria'
import { abrirBaseDeDatos } from './db/conexion'
import { registrarAperturaSoporte } from './db/soporte'
import { mensajeParaUsuario } from './errores'
import { atenderProtocoloFotos, registrarEsquemaFotos } from './fotos'
import { registrarManejadores, registrarManejadoresSoporte } from './ipc'
import { RESPALDO_AUTOMATICO_MS } from './logica/respaldos'
import { alAbrir, crearRespaldo, respaldoAutomatico, type ContextoRespaldos } from './respaldos'
import { carpetaDatosAnterior, carpetaDatosElegida, prepararRutas, type Rutas } from './rutas'
import { trasladarDatos, type ResultadoTraslado } from './traslado'

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

/** Traslada los datos de Documentos (antes de la Fase 8) y devuelve la carpeta que se usará. */
async function carpetaDeDatos(): Promise<{ carpeta: string; traslado: ResultadoTraslado }> {
  const carpeta = carpetaDatosElegida()
  if (process.env.DISFRACES_DATOS_DIR) return { carpeta, traslado: { estado: 'nada' } }
  const traslado = await trasladarDatos(carpetaDatosAnterior(), carpeta)
  if (traslado.estado === 'fallo') {
    // El origen quedó intacto: se sigue usando esta vez y se reintenta en el próximo inicio.
    console.error('[inicio] No se pudieron trasladar los datos; se usa la ubicación anterior:', traslado.error)
    return { carpeta: traslado.desde, traslado }
  }
  if (traslado.estado === 'ambos') console.warn('[inicio] Hay datos en Documentos y en la carpeta nueva; se usa la nueva.')
  return { carpeta, traslado }
}

let ctxRespaldos: ContextoRespaldos | null = null
/** Respaldo en curso (el de al abrir); al cerrar se espera a que termine. */
let respaldoEnCurso: Promise<unknown> = Promise.resolve()
/** Ya se hizo el respaldo de cierre (o no corresponde): la ventana puede cerrarse. */
let cierreListo = false

async function iniciar(): Promise<void> {
  let rutas: Rutas
  let traslado: ResultadoTraslado
  try {
    const elegida = await carpetaDeDatos()
    traslado = elegida.traslado
    rutas = prepararRutas(elegida.carpeta)
    db = abrirBaseDeDatos(rutas.baseDeDatos)
  } catch (error) {
    console.error('[inicio] No se pudo abrir la base de datos:', error)
    dialog.showErrorBox(NOMBRE_TIENDA, `No se pudieron abrir los datos del sistema.\n\n${mensajeParaUsuario(error)}`)
    app.exit(1)
    return
  }
  if (traslado.estado === 'trasladado') {
    registrarAuditoria(db, null, 'datos_trasladados', 'sistema', null, { desde: traslado.desde, hacia: traslado.hacia, fotos: traslado.fotos })
  } else if (traslado.estado === 'fallo') {
    registrarAuditoria(db, null, 'traslado_fallido', 'sistema', null, { desde: traslado.desde, hacia: traslado.hacia })
  }

  const info = {
    nombreTienda: NOMBRE_TIENDA,
    version: app.getVersion(),
    carpetaDatos: rutas.carpetaDatos,
    esDesarrollo: !app.isPackaged
  }
  Menu.setApplicationMenu(null)
  if (modoSoporte) {
    cierreListo = true // las herramientas de soporte no hacen respaldos
    registrarAperturaSoporte(db, modoSoporte === 'restablecer' ? 'restablecer_duena' : 'definir_clave')
    registrarManejadoresSoporte(db, info)
    ventana = crearVentana(modoSoporte)
    return
  }

  const ctx: ContextoRespaldos = { db, rutas, versionPrograma: app.getVersion(), tienda: NOMBRE_TIENDA }
  ctxRespaldos = ctx
  atenderProtocoloFotos(rutas.fotos)
  // DISFRACES_INACTIVIDAD_MS: solo para las pruebas E2E (no esperar 10 minutos reales).
  const inactividadMs = Number(process.env.DISFRACES_INACTIVIDAD_MS) || undefined
  registrarManejadores(db, info, rutas, crearServicioAcceso(db, { inactividadMs }), {
    ctx,
    cerrarBase: () => {
      db?.close()
      db = null
    },
    reiniciar: (mensajeError) => {
      cierreListo = true
      if (mensajeError) dialog.showErrorBox(NOMBRE_TIENDA, mensajeError)
      // DISFRACES_NO_RELANZAR: las pruebas E2E vuelven a abrir la app ellas mismas.
      if (!process.env.DISFRACES_NO_RELANZAR) app.relaunch()
      setTimeout(() => app.exit(0), 300) // deja llegar la respuesta a la ventana
    }
  })
  ventana = crearVentana()
  ventana.on('close', (evento) => {
    if (cierreListo || !db) return
    evento.preventDefault()
    void respaldarAlCerrar()
  })
  // Respaldo al abrir si hubo cambios desde el último respaldo correcto o si pasaron más de 24 h;
  // si no, sube a la nube lo pendiente.
  ventana.once('ready-to-show', () => {
    setTimeout(() => enCola(() => alAbrir(ctx)), 3000)
  })
  // Con la app abierta: respaldo automático cada 2 horas si hubo cambios, sin mostrar nada
  // (si la dueña apaga la laptop sin cerrar el programa, lo más que se pierde son 2 horas).
  // DISFRACES_RESPALDO_CADA_MS: solo para las pruebas E2E.
  const cadaMs = Number(process.env.DISFRACES_RESPALDO_CADA_MS) || RESPALDO_AUTOMATICO_MS
  setInterval(() => enCola(() => respaldoAutomatico(ctx, cadaMs)), Math.min(5 * 60_000, Math.max(250, cadaMs / 4)))
}

let cerrando = false
let enCurso = false

/** Respaldos en segundo plano, uno a la vez; el cierre espera al que esté en curso. */
function enCola(tarea: () => Promise<unknown>): void {
  if (!db || cierreListo || cerrando || enCurso) return
  enCurso = true
  respaldoEnCurso = tarea()
    .catch((error) => console.error('[respaldos] Falló un respaldo en segundo plano:', error))
    .finally(() => {
      enCurso = false
    })
}

/** Al cerrar: respaldo con la pantalla "Guardando respaldo…"; si falla, "Reintentar" o "Cerrar igual". */
async function respaldarAlCerrar(): Promise<void> {
  if (cerrando || !ventana || !ctxRespaldos) return
  cerrando = true
  const win = ventana
  win.webContents.send('respaldo:guardando')
  try {
    await respaldoEnCurso
    for (;;) {
      const r = await crearRespaldo(ctxRespaldos, 'cierre')
      const falloNube = !!r.nube && !r.nube.ok
      if (r.local.ok && !falloNube) break
      const detalle = !r.local.ok
        ? `No se pudo guardar el respaldo: ${r.local.error}.${r.nube?.ok ? '\n\nSí se guardó la copia en la nube.' : ''}`
        : `No se pudo guardar el respaldo en la nube: ${r.nube!.error}.\n\nSe guardó una copia en esta computadora y se subirá sola la próxima vez que abra el programa.`
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: NOMBRE_TIENDA,
        message: 'No se pudo guardar el respaldo',
        detail: detalle,
        buttons: ['Reintentar', 'Cerrar igual'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      if (response === 1) break
    }
  } catch (error) {
    console.error('[respaldos] Error al cerrar:', error)
  }
  cierreListo = true
  win.close()
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
  app.whenReady().then(() => iniciar())

  app.on('window-all-closed', () => app.quit())

  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}
