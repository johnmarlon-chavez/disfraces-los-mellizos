import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type Database from 'better-sqlite3'
import type { ArgsDe, NombreCanal, Resultado, ResultadoDe, InfoApp } from '../shared/ipc'
import { ErrorSinSesion, type ServicioAcceso } from './acceso'
import { ErrorDeNegocio, mensajeParaUsuario } from './errores'
import { actualizarConfiguracion, obtenerConfiguracion } from './db/configuracion'
import * as clientes from './db/clientes'
import * as disfraces from './db/disfraces'
import * as entregas from './db/entregas'
import * as pedidos from './db/pedidos'
import * as reportes from './db/reportes'
import * as registroRespaldos from './db/respaldos'
import * as soporte from './db/soporte'
import * as usuarios from './db/usuarios'
import { elegirYGuardarFoto } from './fotos'
import type { Rutas } from './rutas'
import { accionDeCanal, nivelDeCanal } from './logica/nivelesIpc'
import * as respaldos from './respaldos'
import { obtenerSesion } from './sesion'

/** Lo que necesitan los canales de respaldos, además de la base. */
export interface SistemaRespaldos {
  ctx: respaldos.ContextoRespaldos
  /** Cierra la base antes de intercambiar las carpetas al restaurar. */
  cerrarBase: () => void
  /** Tras restaurar (o si falló con la base ya cerrada): reiniciar el programa. */
  reiniciar: (mensajeError?: string) => void
}

const ventanaActual = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

type Manejador<K extends NombreCanal> = (...args: ArgsDe<K>) => ResultadoDe<K> | Promise<ResultadoDe<K>>

/**
 * Devuelve la función que registra handlers tipados. Antes de ejecutar cada uno exige el nivel de
 * acceso del canal (ver logica/nivelesIpc.ts); sin `acceso` (ventana de soporte) solo pasan los
 * canales públicos. Los errores se convierten en mensajes para la usuaria.
 */
function crearManejar(acceso: ServicioAcceso | null) {
  return function manejar<K extends NombreCanal>(canal: K, fn: Manejador<K>): void {
    const nivel = nivelDeCanal(canal)
    ipcMain.handle(canal, async (_evento, ...args): Promise<Resultado<ResultadoDe<K>>> => {
      try {
        if (nivel !== 'publico') {
          if (!acceso) throw new ErrorSinSesion()
          const sesion = acceso.exigirSesion()
          if (nivel === 'duena' && sesion.rol !== 'admin') {
            throw new ErrorDeNegocio(`Solo la dueña puede ${accionDeCanal(canal)}.`)
          }
        }
        return { ok: true, datos: await fn(...(args as ArgsDe<K>)) }
      } catch (error) {
        if (error instanceof ErrorSinSesion) return { ok: false, error: error.message, sesionCerrada: true }
        if (!(error instanceof ErrorDeNegocio)) console.error(`[ipc] Error en ${canal}:`, error)
        return { ok: false, error: mensajeParaUsuario(error) }
      }
    })
  }
}

/**
 * Ventana de soporte (--restablecer-duena, --definir-clave-soporte): solo estos canales existen.
 * Todo lo demás del programa queda sin registrar.
 */
export function registrarManejadoresSoporte(db: Database.Database, info: InfoApp): void {
  const manejar = crearManejar(null)
  manejar('app:info', () => info)
  manejar('soporte:estado', () => soporte.estadoSoporte(db))
  manejar('soporte:definirClave', (datos) => soporte.definirClaveSoporte(db, datos))
  manejar('soporte:restablecer', (clave) => soporte.restablecerConClave(db, clave))
}

export function registrarManejadores(
  db: Database.Database,
  info: InfoApp,
  rutas: Rutas,
  acceso: ServicioAcceso,
  sistema: SistemaRespaldos
): void {
  const manejar = crearManejar(acceso)

  manejar('app:info', () => info)
  manejar('config:obtener', () => obtenerConfiguracion(db))
  manejar('config:actualizar', (datos) => actualizarConfiguracion(db, datos, obtenerSesion()))

  manejar('acceso:estado', () => acceso.estado())
  manejar('acceso:prepararCodigo', () => acceso.prepararCodigo())
  manejar('acceso:crearCuentas', (datos) => acceso.crearCuentas(datos))
  manejar('acceso:ingresar', (cuenta, contrasena) => acceso.ingresar(cuenta, contrasena))
  manejar('acceso:recuperar', (codigo, nueva) => acceso.recuperar(codigo, nueva))
  manejar('acceso:salir', () => acceso.salir())
  manejar('acceso:actividad', () => acceso.actividad())
  manejar('acceso:verificarDuena', (contrasena) => {
    if (!usuarios.verificarDuena(db, contrasena)) throw new ErrorDeNegocio('La contraseña de la dueña no es correcta.')
  })
  manejar('acceso:cambiarMiContrasena', (actual, nueva) =>
    usuarios.cambiarContrasena(db, obtenerSesion(), 'duena', actual, nueva)
  )
  manejar('acceso:cambiarContrasenaTrabajadores', (nueva) =>
    usuarios.cambiarContrasena(db, obtenerSesion(), 'trabajadores', null, nueva)
  )
  manejar('acceso:nuevoCodigo', (contrasena) => usuarios.nuevoCodigoRecuperacion(db, obtenerSesion(), contrasena))
  manejar('acceso:avisoVisto', () => usuarios.marcarAvisoRestablecimientoVisto(db, obtenerSesion()))
  manejar('acceso:resumenSoporte', () => ({
    claveDefinida: soporte.estadoSoporte(db).claveDefinida,
    ultimoRestablecimiento: usuarios.ultimoRestablecimientoSoporte(db)
  }))

  manejar('modelos:listar', () => disfraces.listarModelos(db))
  manejar('modelos:obtener', (id) => disfraces.obtenerFicha(db, id))
  manejar('modelos:categorias', () => disfraces.listarCategorias(db))
  manejar('modelos:crear', (datos) => disfraces.crearModelo(db, datos, obtenerSesion()))
  manejar('modelos:sugerirPrefijo', (nombre) => disfraces.sugerirPrefijo(db, nombre))
  manejar('modelos:cambiarPrefijo', (id, prefijo) => disfraces.cambiarPrefijo(db, id, prefijo, obtenerSesion()))
  manejar('modelos:actualizar', (id, datos) => disfraces.actualizarModelo(db, id, datos, obtenerSesion()))
  manejar('modelos:cambiarPrecio', (id, precio) => disfraces.cambiarPrecio(db, id, precio, obtenerSesion()))
  manejar('modelos:darDeBaja', (id, aut) => disfraces.darDeBajaModelo(db, id, obtenerSesion(), aut))
  manejar('modelos:reactivar', (id, aut) => disfraces.reactivarModelo(db, id, obtenerSesion(), aut))
  manejar('modelos:elegirFoto', async (id) => {
    disfraces.obtenerFicha(db, id) // valida que exista antes de abrir el diálogo
    const nombre = await elegirYGuardarFoto(rutas.fotos, id)
    if (!nombre) return false
    disfraces.cambiarFotoModelo(db, id, nombre, obtenerSesion())
    return true
  })
  manejar('modelos:quitarFoto', (id) => disfraces.cambiarFotoModelo(db, id, null, obtenerSesion()))

  manejar('unidades:sugerirCodigos', (modeloId, cantidad) => disfraces.sugerirCodigos(db, modeloId, cantidad))
  manejar('unidades:piezasSugeridas', (modeloId) => disfraces.piezasSugeridas(db, modeloId))
  manejar('unidades:crear', (datos) => disfraces.crearUnidades(db, datos, obtenerSesion()))
  manejar('unidades:actualizar', (id, datos) => disfraces.actualizarUnidad(db, id, datos, obtenerSesion()))
  manejar('unidades:cambiarEstado', (id, estado, aut) =>
    disfraces.cambiarEstadoUnidad(db, id, estado, obtenerSesion(), aut)
  )

  manejar('clientes:listar', () => clientes.listarClientes(db))
  manejar('clientes:obtener', (id) => clientes.obtenerFichaCliente(db, id))
  manejar('clientes:crear', (datos) => clientes.crearCliente(db, datos, obtenerSesion()))
  manejar('clientes:actualizar', (id, datos) => clientes.actualizarCliente(db, id, datos, obtenerSesion()))
  manejar('clientes:desactivar', (id) => clientes.desactivarCliente(db, id, obtenerSesion()))
  manejar('clientes:reactivar', (id) => clientes.reactivarCliente(db, id, obtenerSesion()))
  manejar('clientes:distritos', () => clientes.listarDistritos(db))
  manejar('clientes:porDocumento', (tipo, numero) => clientes.buscarPorDocumento(db, tipo, numero))
  manejar('clientes:colegiosParecidos', (nombre, distrito, excluirId) =>
    clientes.buscarColegiosParecidos(db, nombre, distrito, excluirId)
  )

  manejar('pedidos:catalogo', (rango, excluir) => pedidos.catalogoParaPedido(db, rango, excluir))
  manejar('pedidos:asignar', (pedido) => pedidos.asignarUnidades(db, pedido))
  manejar('pedidos:unidadesLibres', (modeloId, talla, rango, excluir, carrito) =>
    pedidos.unidadesLibresParaPedido(db, modeloId, talla, rango, excluir, carrito)
  )
  manejar('pedidos:verificar', (ids, rango, excluir) => pedidos.verificarUnidades(db, ids, rango, excluir))
  manejar('pedidos:eventos', () => pedidos.eventosSugeridos(db))
  manejar('pedidos:crear', (borrador) => pedidos.crearPedido(db, borrador, obtenerSesion()))
  manejar('pedidos:actualizar', (id, borrador) => pedidos.actualizarPedido(db, id, borrador, obtenerSesion()))
  manejar('pedidos:obtener', (id) => pedidos.obtenerPedido(db, id))
  manejar('pedidos:listar', () => pedidos.listarPedidos(db))
  manejar('pedidos:registrarAdelanto', (id, monto, medio) => pedidos.registrarAdelanto(db, id, monto, medio, obtenerSesion()))
  manejar('pedidos:cancelar', (id, opcion) => pedidos.cancelarPedido(db, id, opcion, obtenerSesion()))

  manejar('pendientes:cambiarEstado', (id, estado) => pedidos.cambiarEstadoPendiente(db, id, estado, obtenerSesion()))
  manejar('pendientes:asignar', (id, unidades) => pedidos.asignarAPendiente(db, id, unidades, obtenerSesion()))
  manejar('pendientes:abiertos', (modeloId, talla) => pedidos.pendientesAbiertos(db, modeloId, talla))

  manejar('entregas:entregar', (id, datos, aut) => entregas.entregar(db, id, datos, obtenerSesion(), aut))
  manejar('entregas:previsualizar', (id, datos) => entregas.previsualizarDevolucion(db, id, datos))
  manejar('entregas:devolver', (id, datos) => entregas.devolver(db, id, datos, obtenerSesion()))
  manejar('entregas:liquidar', (id, datos) => entregas.liquidar(db, id, datos, obtenerSesion()))
  manejar('entregas:pagarDeuda', (id, monto, medio) => entregas.registrarPagoDeuda(db, id, monto, medio, obtenerSesion()))
  manejar('entregas:devolverDocumento', (id) => entregas.devolverDocumento(db, id, obtenerSesion()))
  manejar('entregas:rebajarMora', (cargoId, monto, motivo, aut) =>
    entregas.rebajarMora(db, cargoId, monto, motivo, obtenerSesion(), aut)
  )
  manejar('entregas:cancelarLoQueFalta', (id, aut) => entregas.cancelarLoQueFalta(db, id, obtenerSesion(), aut))
  manejar('entregas:liberar', (id) => entregas.liberarUnidades(db, id, obtenerSesion()))

  manejar('inicio:datos', () => reportes.datosInicio(db, obtenerSesion()))
  manejar('unidades:liberar', (ids) => disfraces.liberarUnidades(db, ids, obtenerSesion()))

  // Respaldos: nivel "duena" (ver logica/nivelesIpc.ts).
  const ctx = sistema.ctx
  const usarCarpeta = (carpeta: string): void => {
    respaldos.validarCarpetaNube(ctx, carpeta)
    registroRespaldos.guardarCarpetaNube(db, carpeta, obtenerSesion())
  }
  manejar('respaldos:estado', () => respaldos.estadoRespaldos(ctx))
  manejar('respaldos:avisos', () => respaldos.avisosRespaldo(ctx))
  manejar('respaldos:hacerAhora', () => respaldos.crearRespaldo(ctx, 'manual'))
  manejar('respaldos:elegirCarpeta', async () => {
    const opciones: Electron.OpenDialogOptions = {
      title: 'Elegir la carpeta de respaldos (Google Drive u OneDrive)',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: registroRespaldos.carpetaNube(db) ?? respaldos.sugerirCarpetas(process.env)[0]?.ruta
    }
    const v = ventanaActual()
    const r = v ? await dialog.showOpenDialog(v, opciones) : await dialog.showOpenDialog(opciones)
    if (r.canceled || r.filePaths.length === 0) return null
    usarCarpeta(r.filePaths[0])
    return r.filePaths[0]
  })
  manejar('respaldos:usarCarpeta', (carpeta) => usarCarpeta(carpeta))
  manejar('respaldos:abrirCarpeta', async (cual) => {
    const carpeta = cual === 'nube' ? registroRespaldos.carpetaNube(db) : cual === 'local' ? rutas.respaldosLocales : rutas.carpetaDatos
    if (!carpeta) throw new ErrorDeNegocio('Todavía no eligió la carpeta de respaldos.')
    const error = await shell.openPath(carpeta)
    if (error) throw new ErrorDeNegocio('No se pudo abrir la carpeta. ¿Está disponible?')
  })
  manejar('respaldos:probar', (ruta) => respaldos.probarRespaldo(ctx, ruta))
  manejar('respaldos:elegirArchivo', async () => {
    const opciones: Electron.OpenDialogOptions = {
      title: 'Elegir un respaldo',
      properties: ['openFile'],
      filters: [{ name: 'Respaldos', extensions: ['zip'] }],
      defaultPath: registroRespaldos.carpetaNube(db) ?? rutas.respaldosLocales
    }
    const v = ventanaActual()
    const r = v ? await dialog.showOpenDialog(v, opciones) : await dialog.showOpenDialog(opciones)
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })
  manejar('respaldos:vistaRestauracion', (ruta) => respaldos.vistaRestauracion(ctx, ruta))
  manejar('respaldos:restaurar', async (ruta, contrasena) => {
    if (!usuarios.verificarDuena(db, contrasena)) throw new ErrorDeNegocio('La contraseña de la dueña no es correcta.')
    try {
      await respaldos.restaurarRespaldo(ctx, ruta, obtenerSesion(), sistema.cerrarBase)
    } catch (error) {
      // Si la base ya se cerró, el programa tiene que reiniciarse igual.
      if ((error as { baseCerrada?: boolean }).baseCerrada) sistema.reiniciar(mensajeParaUsuario(error))
      throw error
    }
    sistema.reiniciar()
  })
  manejar('respaldos:confirmarNube', (archivo) => registroRespaldos.confirmarNube(db, obtenerSesion(), archivo))

  // Reportes: nivel "duena" (ver logica/nivelesIpc.ts).
  manejar('reportes:ingresos', (periodo) => reportes.reporteIngresos(db, periodo))
  manejar('reportes:medios', (periodo) => reportes.reporteMedios(db, periodo))
  manejar('reportes:fuera', () => reportes.disfracesFuera(db))
  manejar('reportes:vencidos', () => reportes.vencidosYNoRecogidos(db))
  manejar('reportes:masAlquilados', (periodo, region, evento) =>
    reportes.masAlquilados(db, periodo, region, evento)
  )
  manejar('reportes:agrupados', (periodo, por) => reportes.alquileresAgrupados(db, periodo, por))
  manejar('reportes:confeccion', () => reportes.confeccion(db))
  manejar('reportes:calendario', (modeloId, mes) => reportes.calendarioOcupacion(db, modeloId, mes))
  manejar('reportes:descuentos', (periodo) => reportes.descuentos(db, periodo))
  manejar('reportes:deudas', () => reportes.deudas(db))
}
