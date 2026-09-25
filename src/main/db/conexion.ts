import Database from 'better-sqlite3'
import { aplicarMigraciones } from './migraciones'

/** Abre la base (o la crea) y aplica las migraciones pendientes. Usar ':memory:' en pruebas. */
export function abrirBaseDeDatos(ruta: string): Database.Database {
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  aplicarMigraciones(db)
  return db
}
