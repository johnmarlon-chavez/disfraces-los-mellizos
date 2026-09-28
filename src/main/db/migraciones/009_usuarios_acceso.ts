import type { Migracion } from './index'

// Fase 7: acceso con dos cuentas (dueña y trabajadores).
// - codigo_recuperacion_hash: código de un solo uso de la dueña (se guarda solo el hash).
// - intentos_fallidos, bloqueos, bloqueado_hasta: contador de intentos, separado por cuenta.
// No se crea ninguna cuenta: las contraseñas se eligen en el asistente de primer uso.

export const migracion009: Migracion = {
  version: 9,
  nombre: 'usuarios_acceso',
  aplicar(db) {
    db.exec(`
      ALTER TABLE usuarios ADD COLUMN codigo_recuperacion_hash TEXT;
      ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usuarios ADD COLUMN bloqueos INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TEXT;
    `)
  }
}
