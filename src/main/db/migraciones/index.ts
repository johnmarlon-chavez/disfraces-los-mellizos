import type Database from 'better-sqlite3'
import { ErrorDeNegocio } from '../../errores'
import { migracion001 } from './001_esquema_inicial'
import { migracion002 } from './002_prefijo_modelo'
import { migracion003 } from './003_region_y_modo_mora'
import { migracion004 } from './004_clientes_colegios'
import { migracion005 } from './005_pedidos_y_confeccion'

export interface Migracion {
  version: number
  nombre: string
  /**
   * Para migraciones que reconstruyen una tabla (crear nueva, copiar, borrar, renombrar).
   * Las claves foráneas se desactivan antes de la transacción (SQLite no permite hacerlo
   * dentro de una) y se verifican con foreign_key_check antes de confirmar.
   */
  sinClavesForaneas?: boolean
  aplicar(db: Database.Database): void
}

/**
 * Lista ordenada de migraciones. Reglas:
 * - Nunca modificar una migración ya publicada; agregar una nueva al final.
 * - Nunca borrar datos existentes.
 */
export const MIGRACIONES: readonly Migracion[] = [
  migracion001,
  migracion002,
  migracion003,
  migracion004,
  migracion005
]

export function versionActual(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number
}

function aplicarUna(db: Database.Database, m: Migracion): void {
  db.transaction(() => {
    m.aplicar(db)
    if (m.sinClavesForaneas) {
      const rotas = db.pragma('foreign_key_check') as unknown[]
      if (rotas.length > 0) {
        throw new Error(`La migración ${m.version} (${m.nombre}) dejó ${rotas.length} referencias rotas`)
      }
    }
    db.pragma(`user_version = ${m.version}`)
  })()
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
    if (!m.sinClavesForaneas) {
      aplicarUna(db, m)
      continue
    }
    const clavesAntes = db.pragma('foreign_keys', { simple: true }) as number
    db.pragma('foreign_keys = OFF')
    try {
      aplicarUna(db, m)
    } finally {
      db.pragma(`foreign_keys = ${clavesAntes ? 'ON' : 'OFF'}`)
    }
  }
  return pendientes.length
}
