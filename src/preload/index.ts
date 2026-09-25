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
  }
}

contextBridge.exposeInMainWorld('api', api)
