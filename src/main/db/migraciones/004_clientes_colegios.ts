import type { Migracion } from './index'

// Clientes de dos tipos: personas y colegios.
// - Personas: documento obligatorio (DNI, carné de extranjería o pasaporte), único por tipo + número.
// - Colegios: se identifican por nombre + distrito; responsable y su DNI obligatorios; RUC opcional.
// SQLite no permite quitar NOT NULL de `dni`, así que se reconstruye la tabla conservando los id
// (las referencias desde alquileres siguen válidas). Los clientes existentes pasan a ser personas con DNI.

export const migracion004: Migracion = {
  version: 4,
  nombre: 'clientes_colegios',
  sinClavesForaneas: true,
  aplicar(db) {
    db.exec(`
      CREATE TABLE clientes_nueva (
        id               INTEGER PRIMARY KEY,
        tipo             TEXT    NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona', 'colegio')),
        tipo_documento   TEXT    CHECK (tipo_documento IN ('dni', 'ce', 'pasaporte')),
        numero_documento TEXT,
        nombres          TEXT    NOT NULL,
        responsable      TEXT    NOT NULL DEFAULT '',
        dni_responsable  TEXT,
        distrito         TEXT    NOT NULL DEFAULT '',
        ruc              TEXT,
        telefono         TEXT    NOT NULL DEFAULT '',
        direccion        TEXT    NOT NULL DEFAULT '',
        observaciones    TEXT    NOT NULL DEFAULT '',
        activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (tipo_documento, numero_documento),
        CHECK (
          (tipo = 'persona' AND tipo_documento IS NOT NULL AND numero_documento IS NOT NULL)
          OR
          (tipo = 'colegio' AND tipo_documento IS NULL AND numero_documento IS NULL
            AND responsable <> '' AND dni_responsable IS NOT NULL AND distrito <> '')
        )
      );

      INSERT INTO clientes_nueva
        (id, tipo, tipo_documento, numero_documento, nombres, telefono, direccion, observaciones, activo, creado_en)
      SELECT id, 'persona', 'dni', dni, nombres, telefono, direccion, observaciones, activo, creado_en
      FROM clientes;

      DROP TABLE clientes;
      ALTER TABLE clientes_nueva RENAME TO clientes;

      CREATE INDEX idx_clientes_nombres ON clientes (nombres);
      CREATE INDEX idx_clientes_tipo ON clientes (tipo);
    `)
  }
}
