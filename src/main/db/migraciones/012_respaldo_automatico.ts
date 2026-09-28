import type { Migracion } from './index'

// Respaldo automático mientras la app está abierta y "¿hubo cambios desde el último respaldo?".
// - respaldos.tipo admite 'automatico' (SQLite no permite cambiar un CHECK: se reconstruye la tabla,
//   que no tiene claves foráneas).
// - respaldos.marca_cambios: id más alto de auditoría con cambios de datos al momento del respaldo
//   (ver ACCIONES_SIN_CAMBIOS en logica/respaldos.ts). Las filas anteriores quedan en NULL, que se
//   toma como "puede haber cambios".

export const migracion012: Migracion = {
  version: 12,
  nombre: 'respaldo_automatico',
  aplicar(db) {
    db.exec(`
      CREATE TABLE respaldos_nueva (
        id            INTEGER PRIMARY KEY,
        fecha         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        tipo          TEXT    NOT NULL CHECK (tipo IN ('cierre', 'manual', 'inicio', 'automatico', 'antes_de_restaurar', 'subida_pendiente')),
        destino       TEXT    NOT NULL CHECK (destino IN ('local', 'nube')),
        archivo       TEXT    NOT NULL,
        ok            INTEGER NOT NULL CHECK (ok IN (0, 1)),
        error         TEXT,
        tamano        INTEGER,
        sha256        TEXT,
        marca_cambios INTEGER
      );
      INSERT INTO respaldos_nueva (id, fecha, tipo, destino, archivo, ok, error, tamano, sha256)
        SELECT id, fecha, tipo, destino, archivo, ok, error, tamano, sha256 FROM respaldos;
      DROP TABLE respaldos;
      ALTER TABLE respaldos_nueva RENAME TO respaldos;
      CREATE INDEX respaldos_destino_fecha ON respaldos (destino, fecha);
    `)
  }
}
