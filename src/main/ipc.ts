import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { ArgsDe, NombreCanal, Resultado, ResultadoDe, InfoApp } from '../shared/ipc'
import { mensajeParaUsuario } from './errores'
import { obtenerConfiguracion } from './db/configuracion'
import * as clientes from './db/clientes'
import * as disfraces from './db/disfraces'
import { elegirYGuardarFoto } from './fotos'
import type { Rutas } from './rutas'
import { obtenerSesion } from './sesion'

type Manejador<K extends NombreCanal> = (...args: ArgsDe<K>) => ResultadoDe<K> | Promise<ResultadoDe<K>>

/** Registra un handler tipado. Los errores se convierten en mensajes para la usuaria. */
function manejar<K extends NombreCanal>(canal: K, fn: Manejador<K>): void {
  ipcMain.handle(canal, async (_evento, ...args): Promise<Resultado<ResultadoDe<K>>> => {
    try {
      return { ok: true, datos: await fn(...(args as ArgsDe<K>)) }
    } catch (error) {
      console.error(`[ipc] Error en ${canal}:`, error)
      return { ok: false, error: mensajeParaUsuario(error) }
    }
  })
}

export function registrarManejadores(db: Database.Database, info: InfoApp, rutas: Rutas): void {
  manejar('app:info', () => info)
  manejar('config:obtener', () => obtenerConfiguracion(db))

  manejar('modelos:listar', () => disfraces.listarModelos(db))
  manejar('modelos:obtener', (id) => disfraces.obtenerFicha(db, id))
  manejar('modelos:categorias', () => disfraces.listarCategorias(db))
  manejar('modelos:crear', (datos) => disfraces.crearModelo(db, datos, obtenerSesion()))
  manejar('modelos:sugerirPrefijo', (nombre) => disfraces.sugerirPrefijo(db, nombre))
  manejar('modelos:cambiarPrefijo', (id, prefijo) => disfraces.cambiarPrefijo(db, id, prefijo, obtenerSesion()))
  manejar('modelos:actualizar', (id, datos) => disfraces.actualizarModelo(db, id, datos, obtenerSesion()))
  manejar('modelos:cambiarPrecio', (id, precio) => disfraces.cambiarPrecio(db, id, precio, obtenerSesion()))
  manejar('modelos:darDeBaja', (id) => disfraces.darDeBajaModelo(db, id, obtenerSesion()))
  manejar('modelos:reactivar', (id) => disfraces.reactivarModelo(db, id, obtenerSesion()))
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
  manejar('unidades:cambiarEstado', (id, estado) => disfraces.cambiarEstadoUnidad(db, id, estado, obtenerSesion()))

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
}
