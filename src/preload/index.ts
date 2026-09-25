import { contextBridge, ipcRenderer } from 'electron'
import type { ApiDisfraces, ArgsDe, NombreCanal, Resultado, ResultadoDe } from '../shared/ipc'

function invocar<K extends NombreCanal>(canal: K, ...args: ArgsDe<K>): Promise<Resultado<ResultadoDe<K>>> {
  return ipcRenderer.invoke(canal, ...args)
}

const api: ApiDisfraces = {
  app: {
    info: () => invocar('app:info')
  },
  config: {
    obtener: () => invocar('config:obtener')
  }
}

contextBridge.exposeInMainWorld('api', api)
