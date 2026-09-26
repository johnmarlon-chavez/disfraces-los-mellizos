import type { Migracion } from './index'

// Fase 4: pedidos por cantidad y pendientes de confección.
// - alquileres: evento (obligatorio en la app) y grado_seccion (opcional).
// - pendientes_confeccion: unidades que faltaban al reservar y que la tienda confecciona.
//   precio_original/precio_cobrado son por unidad y se copian al pedido al registrarlo.
//   cantidad_asignada permite asignar por partes; estado 'listo' solo cuando se asignaron todas.
// - detalle_alquiler.pendiente_id: qué unidad cubrió qué pendiente.
// - pagos: nuevo concepto devolucion_adelanto (al cancelar un pedido). SQLite no permite cambiar
//   un CHECK, así que se reconstruye la tabla conservando los id.

export const migracion005: Migracion = {
  version: 5,
  nombre: 'pedidos_y_confeccion',
  sinClavesForaneas: true,
  aplicar(db) {
    db.exec(`
      ALTER TABLE alquileres ADD COLUMN evento TEXT NOT NULL DEFAULT '';
      ALTER TABLE alquileres ADD COLUMN grado_seccion TEXT NOT NULL DEFAULT '';

      CREATE TABLE pendientes_confeccion (
        id                INTEGER PRIMARY KEY,
        alquiler_id       INTEGER NOT NULL REFERENCES alquileres (id),
        modelo_id         INTEGER NOT NULL REFERENCES modelos (id),
        talla             TEXT    NOT NULL,
        cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
        cantidad_asignada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_asignada >= 0 AND cantidad_asignada <= cantidad),
        precio_original   INTEGER NOT NULL CHECK (precio_original >= 0),
        precio_cobrado    INTEGER NOT NULL CHECK (precio_cobrado >= 0),
        fecha_limite      TEXT    NOT NULL,
        estado            TEXT    NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente', 'en_confeccion', 'listo')),
        observaciones     TEXT    NOT NULL DEFAULT '',
        usuario_id        INTEGER REFERENCES usuarios (id),
        creado_en         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK (estado <> 'listo' OR cantidad_asignada = cantidad)
      );
      CREATE INDEX idx_pendientes_alquiler ON pendientes_confeccion (alquiler_id);
      CREATE INDEX idx_pendientes_modelo ON pendientes_confeccion (modelo_id, estado);

      ALTER TABLE detalle_alquiler ADD COLUMN pendiente_id INTEGER REFERENCES pendientes_confeccion (id);

      CREATE TABLE pagos_nueva (
        id          INTEGER PRIMARY KEY,
        alquiler_id INTEGER NOT NULL REFERENCES alquileres (id),
        fecha       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        monto       INTEGER NOT NULL CHECK (monto > 0),
        concepto    TEXT    NOT NULL CHECK (concepto IN
                    ('adelanto', 'saldo', 'garantia_recibida', 'garantia_devuelta', 'mora', 'dano',
                     'devolucion_adelanto')),
        medio       TEXT    NOT NULL CHECK (medio IN ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta')),
        usuario_id  INTEGER REFERENCES usuarios (id)
      );
      INSERT INTO pagos_nueva (id, alquiler_id, fecha, monto, concepto, medio, usuario_id)
        SELECT id, alquiler_id, fecha, monto, concepto, medio, usuario_id FROM pagos;
      DROP TABLE pagos;
      ALTER TABLE pagos_nueva RENAME TO pagos;
      CREATE INDEX idx_pagos_alquiler ON pagos (alquiler_id);
      CREATE INDEX idx_pagos_fecha ON pagos (fecha);
    `)
  }
}
