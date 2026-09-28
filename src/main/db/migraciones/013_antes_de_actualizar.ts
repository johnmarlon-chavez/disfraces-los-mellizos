import type { Migracion } from './index'

// Respaldo "antes de actualizar": al abrir una versión nueva del programa, antes de migrar la base,
// se guarda un respaldo completo (sirve para volver a la versión anterior). Se agrega ese tipo a
// respaldos.tipo (SQLite no permite cambiar un CHECK: se reconstruye la tabla, sin claves foráneas).

export const migracion013: Migracion = {
  version: 13,
  nombre: 'antes_de_actualizar',
  aplicar(db) {
    db.exec(`
      CREATE TABLE respaldos_nueva (
        id            INTEGER PRIMARY KEY,
        fecha         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        tipo          TEXT    NOT NULL CHECK (tipo IN ('cierre', 'manual', 'inicio', 'automatico', 'antes_de_restaurar',
                                                       'antes_de_actualizar', 'subida_pendiente')),
        destino       TEXT    NOT NULL CHECK (destino IN ('local', 'nube')),
        archivo       TEXT    NOT NULL,
        ok            INTEGER NOT NULL CHECK (ok IN (0, 1)),
        error         TEXT,
        tamano        INTEGER,
        sha256        TEXT,
        marca_cambios INTEGER
      );
      INSERT INTO respaldos_nueva SELECT id, fecha, tipo, destino, archivo, ok, error, tamano, sha256, marca_cambios FROM respaldos;
      DROP TABLE respaldos;
      ALTER TABLE respaldos_nueva RENAME TO respaldos;
      CREATE INDEX respaldos_destino_fecha ON respaldos (destino, fecha);
    `)
  }
}
