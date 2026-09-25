import type { Migracion } from './index'

// Convenciones:
// - Todos los montos (precio_*, monto, garantia_monto, mora_por_dia, costo_reposicion) son
//   INTEGER en céntimos: 2500 = S/ 25.00.
// - Fechas de calendario como TEXT 'aaaa-mm-dd'; instantes como TEXT ISO en UTC.
// - Booleanos como INTEGER 0/1.
// - Nada se borra físicamente: se usa `activo`, estado_fisico 'baja' o estado 'cancelado'.
// - usuario_id registra qué cuenta hizo la operación (NULL hasta que exista el login, fase 7).

export const migracion001: Migracion = {
  version: 1,
  nombre: 'esquema_inicial',
  aplicar(db) {
    db.exec(`
      CREATE TABLE usuarios (
        id              INTEGER PRIMARY KEY,
        nombre          TEXT    NOT NULL,
        usuario         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        contrasena_hash TEXT    NOT NULL,
        rol             TEXT    NOT NULL CHECK (rol IN ('admin', 'empleado')),
        activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE modelos (
        id              INTEGER PRIMARY KEY,
        nombre          TEXT    NOT NULL,
        categoria       TEXT    NOT NULL,
        descripcion     TEXT    NOT NULL DEFAULT '',
        precio_alquiler INTEGER NOT NULL CHECK (precio_alquiler >= 0),
        foto            TEXT,
        activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_modelos_nombre ON modelos (nombre);

      CREATE TABLE unidades (
        id            INTEGER PRIMARY KEY,
        modelo_id     INTEGER NOT NULL REFERENCES modelos (id),
        codigo        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        talla         TEXT    NOT NULL,
        estado_fisico TEXT    NOT NULL DEFAULT 'disponible'
                      CHECK (estado_fisico IN ('disponible', 'lavanderia', 'reparacion', 'baja')),
        observaciones TEXT    NOT NULL DEFAULT '',
        creado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_unidades_modelo ON unidades (modelo_id);

      CREATE TABLE piezas (
        id               INTEGER PRIMARY KEY,
        unidad_id        INTEGER NOT NULL REFERENCES unidades (id),
        nombre           TEXT    NOT NULL,
        costo_reposicion INTEGER NOT NULL DEFAULT 0 CHECK (costo_reposicion >= 0),
        activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
      );
      CREATE INDEX idx_piezas_unidad ON piezas (unidad_id);

      CREATE TABLE clientes (
        id            INTEGER PRIMARY KEY,
        dni           TEXT    NOT NULL UNIQUE,
        nombres       TEXT    NOT NULL,
        telefono      TEXT    NOT NULL DEFAULT '',
        direccion     TEXT    NOT NULL DEFAULT '',
        observaciones TEXT    NOT NULL DEFAULT '',
        activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_clientes_nombres ON clientes (nombres);

      CREATE TABLE alquileres (
        id                       INTEGER PRIMARY KEY,
        cliente_id               INTEGER NOT NULL REFERENCES clientes (id),
        fecha_reserva            TEXT    NOT NULL,
        fecha_salida             TEXT    NOT NULL,
        fecha_devolucion_pactada TEXT    NOT NULL,
        fecha_devolucion_real    TEXT,
        estado                   TEXT    NOT NULL DEFAULT 'reservado'
                                 CHECK (estado IN ('reservado', 'entregado', 'devuelto', 'cancelado')),
        garantia_tipo            TEXT    CHECK (garantia_tipo IN ('efectivo', 'dni')),
        garantia_monto           INTEGER NOT NULL DEFAULT 0 CHECK (garantia_monto >= 0),
        garantia_devuelta        INTEGER NOT NULL DEFAULT 0 CHECK (garantia_devuelta IN (0, 1)),
        observaciones            TEXT    NOT NULL DEFAULT '',
        usuario_id               INTEGER REFERENCES usuarios (id),
        creado_en                TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK (fecha_devolucion_pactada >= fecha_salida)
      );
      CREATE INDEX idx_alquileres_cliente ON alquileres (cliente_id);
      CREATE INDEX idx_alquileres_estado_fechas ON alquileres (estado, fecha_salida, fecha_devolucion_pactada);

      -- precio_original: precio general del disfraz al momento de agregarlo al pedido.
      -- precio_cobrado:  precio realmente cobrado en este pedido (puede tener descuento).
      CREATE TABLE detalle_alquiler (
        id                INTEGER PRIMARY KEY,
        alquiler_id       INTEGER NOT NULL REFERENCES alquileres (id),
        unidad_id         INTEGER NOT NULL REFERENCES unidades (id),
        precio_original   INTEGER NOT NULL CHECK (precio_original >= 0),
        precio_cobrado    INTEGER NOT NULL CHECK (precio_cobrado >= 0),
        estado_devolucion TEXT,
        observaciones     TEXT    NOT NULL DEFAULT '',
        UNIQUE (alquiler_id, unidad_id)
      );
      CREATE INDEX idx_detalle_unidad ON detalle_alquiler (unidad_id);

      CREATE TABLE cargos (
        id          INTEGER PRIMARY KEY,
        alquiler_id INTEGER NOT NULL REFERENCES alquileres (id),
        unidad_id   INTEGER REFERENCES unidades (id),
        tipo        TEXT    NOT NULL CHECK (tipo IN ('mora', 'dano', 'pieza_faltante')),
        monto       INTEGER NOT NULL CHECK (monto > 0),
        descripcion TEXT    NOT NULL DEFAULT '',
        usuario_id  INTEGER REFERENCES usuarios (id),
        creado_en   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_cargos_alquiler ON cargos (alquiler_id);

      CREATE TABLE pagos (
        id          INTEGER PRIMARY KEY,
        alquiler_id INTEGER NOT NULL REFERENCES alquileres (id),
        fecha       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        monto       INTEGER NOT NULL CHECK (monto > 0),
        concepto    TEXT    NOT NULL CHECK (concepto IN
                    ('adelanto', 'saldo', 'garantia_recibida', 'garantia_devuelta', 'mora', 'dano')),
        medio       TEXT    NOT NULL CHECK (medio IN ('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta')),
        usuario_id  INTEGER REFERENCES usuarios (id)
      );
      CREATE INDEX idx_pagos_alquiler ON pagos (alquiler_id);
      CREATE INDEX idx_pagos_fecha ON pagos (fecha);

      -- Registro de operaciones (cambios de precio, cambios de estado, bajas...).
      CREATE TABLE auditoria (
        id         INTEGER PRIMARY KEY,
        fecha      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        usuario_id INTEGER REFERENCES usuarios (id),
        accion     TEXT    NOT NULL,
        entidad    TEXT    NOT NULL,
        entidad_id INTEGER,
        detalle    TEXT    NOT NULL DEFAULT '{}'
      );
      CREATE INDEX idx_auditoria_entidad ON auditoria (entidad, entidad_id);

      -- Una sola fila (id = 1). Los valores son de ejemplo y se editan desde Configuración.
      CREATE TABLE configuracion (
        id                 INTEGER PRIMARY KEY CHECK (id = 1),
        mora_por_dia       INTEGER NOT NULL CHECK (mora_por_dia >= 0),
        dias_margen_lavado INTEGER NOT NULL CHECK (dias_margen_lavado >= 0),
        precio_por_dia     INTEGER NOT NULL DEFAULT 0 CHECK (precio_por_dia IN (0, 1)),
        carpeta_respaldo   TEXT    NOT NULL DEFAULT '',
        nombre_tienda      TEXT    NOT NULL
      );
      INSERT INTO configuracion (id, mora_por_dia, dias_margen_lavado, precio_por_dia, carpeta_respaldo, nombre_tienda)
      VALUES (1, 500, 1, 0, '', 'Disfraces Los Mellizos');
    `)
  }
}
