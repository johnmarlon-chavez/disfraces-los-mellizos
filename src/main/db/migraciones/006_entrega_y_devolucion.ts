import type { Migracion } from './index'

// Fase 5: entrega y devolución por unidad.
// - detalle_alquiler (se reconstruye para agregar restricciones):
//     fecha_entrega_real / entregado_por: cada unidad se entrega por separado (un colegio puede
//       recoger 27 hoy y 3 mañana, dentro del mismo pedido).
//     fecha_devolucion_real / recibido_por / estado_devolucion: cada unidad vuelve por separado.
// - cargos (se reconstruye): monto puede quedar en 0 si la dueña perdona la mora; monto_original
//   y motivo_rebaja guardan la rebaja; pieza_id indica qué pieza faltó.
// - alquileres: entregado_en (primera entrega) y garantia_documento (DNI en prenda).
// - pagos: desde_garantia = 1 cuando el pago se tomó de la garantía en efectivo al liquidar.
// Pedidos ya entregados o devueltos antes de esta versión: sus unidades se dan por entregadas
// en la fecha de salida y, si el pedido está devuelto, por devueltas en buen estado.

export const migracion006: Migracion = {
  version: 6,
  nombre: 'entrega_y_devolucion',
  sinClavesForaneas: true,
  aplicar(db) {
    db.exec(`
      ALTER TABLE alquileres ADD COLUMN entregado_en TEXT;
      ALTER TABLE alquileres ADD COLUMN garantia_documento TEXT;
      ALTER TABLE pagos ADD COLUMN desde_garantia INTEGER NOT NULL DEFAULT 0 CHECK (desde_garantia IN (0, 1));

      CREATE TABLE detalle_nueva (
        id                    INTEGER PRIMARY KEY,
        alquiler_id           INTEGER NOT NULL REFERENCES alquileres (id),
        unidad_id             INTEGER NOT NULL REFERENCES unidades (id),
        precio_original       INTEGER NOT NULL CHECK (precio_original >= 0),
        precio_cobrado        INTEGER NOT NULL CHECK (precio_cobrado >= 0),
        pendiente_id          INTEGER REFERENCES pendientes_confeccion (id),
        fecha_entrega_real    TEXT,
        entregado_por         INTEGER REFERENCES usuarios (id),
        fecha_devolucion_real TEXT,
        recibido_por          INTEGER REFERENCES usuarios (id),
        estado_devolucion     TEXT CHECK (estado_devolucion IN ('bien', 'con_danos', 'con_faltantes', 'con_danos_y_faltantes')),
        observaciones         TEXT    NOT NULL DEFAULT '',
        UNIQUE (alquiler_id, unidad_id),
        CHECK (fecha_devolucion_real IS NULL OR (fecha_entrega_real IS NOT NULL AND fecha_devolucion_real >= fecha_entrega_real)),
        CHECK ((fecha_devolucion_real IS NULL) = (estado_devolucion IS NULL))
      );
      INSERT INTO detalle_nueva (id, alquiler_id, unidad_id, precio_original, precio_cobrado, pendiente_id,
                                 fecha_entrega_real, fecha_devolucion_real, estado_devolucion, observaciones)
      SELECT d.id, d.alquiler_id, d.unidad_id, d.precio_original, d.precio_cobrado, d.pendiente_id,
             CASE WHEN a.estado IN ('entregado', 'devuelto') THEN a.fecha_salida END,
             CASE WHEN a.estado = 'devuelto'
                  THEN MAX(a.fecha_salida, COALESCE(a.fecha_devolucion_real, a.fecha_devolucion_pactada)) END,
             CASE WHEN a.estado = 'devuelto' THEN 'bien' END,
             d.observaciones
      FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id;
      DROP TABLE detalle_alquiler;
      ALTER TABLE detalle_nueva RENAME TO detalle_alquiler;
      CREATE INDEX idx_detalle_unidad ON detalle_alquiler (unidad_id);
      CREATE INDEX idx_detalle_alquiler ON detalle_alquiler (alquiler_id);

      CREATE TABLE cargos_nueva (
        id             INTEGER PRIMARY KEY,
        alquiler_id    INTEGER NOT NULL REFERENCES alquileres (id),
        unidad_id      INTEGER REFERENCES unidades (id),
        pieza_id       INTEGER REFERENCES piezas (id),
        tipo           TEXT    NOT NULL CHECK (tipo IN ('mora', 'dano', 'pieza_faltante')),
        monto          INTEGER NOT NULL CHECK (monto >= 0),
        monto_original INTEGER NOT NULL CHECK (monto_original > 0),
        motivo_rebaja  TEXT    NOT NULL DEFAULT '',
        descripcion    TEXT    NOT NULL DEFAULT '',
        usuario_id     INTEGER REFERENCES usuarios (id),
        creado_en      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK (monto <= monto_original)
      );
      INSERT INTO cargos_nueva (id, alquiler_id, unidad_id, tipo, monto, monto_original, descripcion, usuario_id, creado_en)
        SELECT id, alquiler_id, unidad_id, tipo, monto, monto, descripcion, usuario_id, creado_en FROM cargos;
      DROP TABLE cargos;
      ALTER TABLE cargos_nueva RENAME TO cargos;
      CREATE INDEX idx_cargos_alquiler ON cargos (alquiler_id);

      UPDATE alquileres SET entregado_en = fecha_salida WHERE estado IN ('entregado', 'devuelto');
    `)
  }
}
