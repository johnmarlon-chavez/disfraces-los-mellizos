import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { ArgsDe, NombreCanal, Resultado, ResultadoDe, InfoApp } from '../shared/ipc'
import { mensajeParaUsuario } from './errores'
import { obtenerConfiguracion } from './db/configuracion'

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

export function registrarManejadores(db: Database.Database, info: InfoApp): void {
  manejar('app:info', () => info)
  manejar('config:obtener', () => obtenerConfiguracion(db))
}
