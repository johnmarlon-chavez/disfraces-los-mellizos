import Database from 'better-sqlite3'
import { aplicarMigraciones } from './migraciones'

/**
 * Abre la base (o la crea) sin migrarla. Lo usa el inicio para guardar el respaldo "antes de
 * actualizar" antes de aplicar las migraciones, y para detectar datos de una versión más nueva.
 */
export function abrirSinMigrar(ruta: string): Database.Database {
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

/** Abre la base (o la crea) y aplica las migraciones pendientes. Usar ':memory:' en pruebas. */
export function abrirBaseDeDatos(ruta: string): Database.Database {
  const db = abrirSinMigrar(ruta)
  aplicarMigraciones(db)
  return db
}
