import type { Migracion } from './index'

// Clave de soporte para la herramienta --restablecer-duena.
// - soporte: una sola fila con el hash de la clave (la define el técnico al instalar) y su propio
//   contador de intentos. Sin clave definida, la herramienta no hace nada.
// - usuarios.restablecido_por_soporte_en: instante del último restablecimiento que la dueña
//   todavía no vio; al ingresar se le muestra un aviso hasta que pulse "Entendido".

export const migracion010: Migracion = {
  version: 10,
  nombre: 'clave_soporte',
  aplicar(db) {
    db.exec(`
      CREATE TABLE soporte (
        id                INTEGER PRIMARY KEY CHECK (id = 1),
        clave_hash        TEXT,
        definida_en       TEXT,
        intentos_fallidos INTEGER NOT NULL DEFAULT 0,
        bloqueos          INTEGER NOT NULL DEFAULT 0,
        bloqueado_hasta   TEXT
      );
      INSERT INTO soporte (id) VALUES (1);
      ALTER TABLE usuarios ADD COLUMN restablecido_por_soporte_en TEXT;
    `)
  }
}
