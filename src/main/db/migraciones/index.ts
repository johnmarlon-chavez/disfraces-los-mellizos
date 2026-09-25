import type Database from 'better-sqlite3'
import { ErrorDeNegocio } from '../../errores'
import { migracion001 } from './001_esquema_inicial'

export interface Migracion {
  version: number
  nombre: string
  aplicar(db: Database.Database): void
}

/**
 * Lista ordenada de migraciones. Reglas:
 * - Nunca modificar una migración ya publicada; agregar una nueva al final.
 * - Nunca borrar datos existentes.
 */
export const MIGRACIONES: readonly Migracion[] = [migracion001]

export function versionActual(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number
}

/**
 * Aplica las migraciones pendientes, cada una en su propia transacción.
 * La versión se guarda en PRAGMA user_version, dentro de la misma transacción,
 * así que si una migración falla la base queda exactamente como estaba.
 * Devuelve cuántas migraciones se aplicaron.
 */
export function aplicarMigraciones(
  db: Database.Database,
  migraciones: readonly Migracion[] = MIGRACIONES
): number {
  migraciones.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migraciones mal numeradas: se esperaba la versión ${i + 1} y se encontró ${m.version}`)
    }
  })

  const actual = versionActual(db)
  if (actual > migraciones.length) {
    throw new ErrorDeNegocio(
      'Los datos fueron guardados con una versión más nueva del programa. Instale la última versión para continuar.'
    )
  }

  const pendientes = migraciones.slice(actual)
  for (const m of pendientes) {
    db.transaction(() => {
      m.aplicar(db)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
  return pendientes.length
}
