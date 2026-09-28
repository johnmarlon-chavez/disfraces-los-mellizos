import type { Migracion } from './index'

// Fase 8: respaldos.
// - respaldos: cada intento (local y en la nube), con su resultado. Sirve para el panel de
//   Configuración, el aviso en Inicio y para subir a la nube la copia local pendiente.
// - configuracion.respaldo_nube_confirmado_en: última vez que la dueña confirmó en su celular
//   que el respaldo llegó a Google Drive u OneDrive (recordatorio mensual).

export const migracion011: Migracion = {
  version: 11,
  nombre: 'respaldos',
  aplicar(db) {
    db.exec(`
      CREATE TABLE respaldos (
        id         INTEGER PRIMARY KEY,
        fecha      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        tipo       TEXT    NOT NULL CHECK (tipo IN ('cierre', 'manual', 'inicio', 'antes_de_restaurar', 'subida_pendiente')),
        destino    TEXT    NOT NULL CHECK (destino IN ('local', 'nube')),
        archivo    TEXT    NOT NULL,
        ok         INTEGER NOT NULL CHECK (ok IN (0, 1)),
        error      TEXT,
        tamano     INTEGER,
        sha256     TEXT
      );
      CREATE INDEX respaldos_destino_fecha ON respaldos (destino, fecha);
      ALTER TABLE configuracion ADD COLUMN respaldo_nube_confirmado_en TEXT;
    `)
  }
}
