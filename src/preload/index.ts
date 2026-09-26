import { contextBridge, ipcRenderer } from 'electron'
import type { ApiDisfraces, ArgsDe, NombreCanal, Resultado, ResultadoDe } from '../shared/ipc'

function canal<K extends NombreCanal>(nombre: K) {
  return (...args: ArgsDe<K>): Promise<Resultado<ResultadoDe<K>>> => ipcRenderer.invoke(nombre, ...args)
}

const api: ApiDisfraces = {
  app: { info: canal('app:info') },
  config: { obtener: canal('config:obtener') },
  modelos: {
    listar: canal('modelos:listar'),
    obtener: canal('modelos:obtener'),
    categorias: canal('modelos:categorias'),
    crear: canal('modelos:crear'),
    sugerirPrefijo: canal('modelos:sugerirPrefijo'),
    cambiarPrefijo: canal('modelos:cambiarPrefijo'),
    actualizar: canal('modelos:actualizar'),
    cambiarPrecio: canal('modelos:cambiarPrecio'),
    darDeBaja: canal('modelos:darDeBaja'),
    reactivar: canal('modelos:reactivar'),
    elegirFoto: canal('modelos:elegirFoto'),
    quitarFoto: canal('modelos:quitarFoto')
  },
  unidades: {
    sugerirCodigos: canal('unidades:sugerirCodigos'),
    piezasSugeridas: canal('unidades:piezasSugeridas'),
    crear: canal('unidades:crear'),
    actualizar: canal('unidades:actualizar'),
    cambiarEstado: canal('unidades:cambiarEstado')
  },
  clientes: {
    listar: canal('clientes:listar'),
    obtener: canal('clientes:obtener'),
    crear: canal('clientes:crear'),
    actualizar: canal('clientes:actualizar'),
    desactivar: canal('clientes:desactivar'),
    reactivar: canal('clientes:reactivar'),
    distritos: canal('clientes:distritos'),
    porDocumento: canal('clientes:porDocumento'),
    colegiosParecidos: canal('clientes:colegiosParecidos')
  },
  pedidos: {
    catalogo: canal('pedidos:catalogo'),
    asignar: canal('pedidos:asignar'),
    unidadesLibres: canal('pedidos:unidadesLibres'),
    verificar: canal('pedidos:verificar'),
    eventos: canal('pedidos:eventos'),
    crear: canal('pedidos:crear'),
    actualizar: canal('pedidos:actualizar'),
    obtener: canal('pedidos:obtener'),
    listar: canal('pedidos:listar'),
    registrarAdelanto: canal('pedidos:registrarAdelanto'),
    cancelar: canal('pedidos:cancelar')
  },
  pendientes: {
    cambiarEstado: canal('pendientes:cambiarEstado'),
    asignar: canal('pendientes:asignar'),
    abiertos: canal('pendientes:abiertos')
  }
}

contextBridge.exposeInMainWorld('api', api)
