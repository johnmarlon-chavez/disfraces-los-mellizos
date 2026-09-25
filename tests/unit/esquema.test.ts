import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import { obtenerConfiguracion } from '../../src/main/db/configuracion'

let db: Database.Database

beforeEach(() => {
  db = abrirBaseDeDatos(':memory:')
})

function columnas(tabla: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map((c) => c.name)
}

function crearAlquilerConUnidad(): { alquilerId: number | bigint; unidadId: number | bigint } {
  const modeloId = db
    .prepare("INSERT INTO modelos (nombre, categoria, precio_alquiler) VALUES ('Pirata', 'Personajes', 3000)")
    .run().lastInsertRowid
  const unidadId = db
    .prepare("INSERT INTO unidades (modelo_id, codigo, talla) VALUES (?, 'PIR-001', 'M')")
    .run(modeloId).lastInsertRowid
  const clienteId = db
    .prepare("INSERT INTO clientes (dni, nombres) VALUES ('40123456', 'María Quispe')")
    .run().lastInsertRowid
  const alquilerId = db
    .prepare(
      `INSERT INTO alquileres (cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada)
       VALUES (?, '2026-10-20', '2026-10-28', '2026-10-31')`
    )
    .run(clienteId).lastInsertRowid
  return { alquilerId, unidadId }
}

describe('esquema inicial', () => {
  it('crea todas las tablas del modelo de datos', () => {
    const tablas = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
    ).map((t) => t.name)
    expect(tablas).toEqual(
      [
        'alquileres',
        'auditoria',
        'cargos',
        'clientes',
        'configuracion',
        'detalle_alquiler',
        'modelos',
        'pagos',
        'piezas',
        'unidades',
        'usuarios'
      ].sort()
    )
  })

  it('detalle_alquiler guarda precio_original y precio_cobrado', () => {
    expect(columnas('detalle_alquiler')).toEqual(
      expect.arrayContaining(['alquiler_id', 'unidad_id', 'precio_original', 'precio_cobrado', 'estado_devolucion'])
    )
    const { alquilerId, unidadId } = crearAlquilerConUnidad()
    db.prepare(
      'INSERT INTO detalle_alquiler (alquiler_id, unidad_id, precio_original, precio_cobrado) VALUES (?, ?, 3000, 2500)'
    ).run(alquilerId, unidadId)
    expect(db.prepare('SELECT precio_original, precio_cobrado FROM detalle_alquiler').get()).toEqual({
      precio_original: 3000,
      precio_cobrado: 2500
    })
  })

  it('no permite agregar la misma unidad dos veces al mismo pedido', () => {
    const { alquilerId, unidadId } = crearAlquilerConUnidad()
    const ins = db.prepare(
      'INSERT INTO detalle_alquiler (alquiler_id, unidad_id, precio_original, precio_cobrado) VALUES (?, ?, 3000, 3000)'
    )
    ins.run(alquilerId, unidadId)
    expect(() => ins.run(alquilerId, unidadId)).toThrow(/UNIQUE/)
  })

  it('no acepta estados fuera de la lista', () => {
    const { alquilerId, unidadId } = crearAlquilerConUnidad()
    expect(() => db.prepare("UPDATE unidades SET estado_fisico = 'alquilado' WHERE id = ?").run(unidadId)).toThrow(
      /CHECK/
    )
    expect(() => db.prepare("UPDATE alquileres SET estado = 'perdido' WHERE id = ?").run(alquilerId)).toThrow(/CHECK/)
    expect(() => db.prepare("UPDATE alquileres SET garantia_tipo = 'reloj' WHERE id = ?").run(alquilerId)).toThrow(
      /CHECK/
    )
    expect(() =>
      db
        .prepare("INSERT INTO pagos (alquiler_id, monto, concepto, medio) VALUES (?, 1000, 'adelanto', 'bitcoin')")
        .run(alquilerId)
    ).toThrow(/CHECK/)
    expect(() =>
      db.prepare("INSERT INTO cargos (alquiler_id, tipo, monto) VALUES (?, 'multa', 500)").run(alquilerId)
    ).toThrow(/CHECK/)
  })

  it('acepta todos los valores válidos de los enums', () => {
    const { alquilerId, unidadId } = crearAlquilerConUnidad()
    for (const e of ['disponible', 'lavanderia', 'reparacion', 'baja']) {
      db.prepare('UPDATE unidades SET estado_fisico = ? WHERE id = ?').run(e, unidadId)
    }
    for (const e of ['reservado', 'entregado', 'devuelto', 'cancelado']) {
      db.prepare('UPDATE alquileres SET estado = ? WHERE id = ?').run(e, alquilerId)
    }
    const insPago = db.prepare('INSERT INTO pagos (alquiler_id, monto, concepto, medio) VALUES (?, 100, ?, ?)')
    const conceptos = ['adelanto', 'saldo', 'garantia_recibida', 'garantia_devuelta', 'mora', 'dano']
    const medios = ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta']
    conceptos.forEach((c, i) => insPago.run(alquilerId, c, medios[i % medios.length]))
    for (const t of ['mora', 'dano', 'pieza_faltante']) {
      db.prepare('INSERT INTO cargos (alquiler_id, tipo, monto) VALUES (?, ?, 500)').run(alquilerId, t)
    }
  })

  it('los montos se guardan como enteros en céntimos y no aceptan negativos', () => {
    expect(() =>
      db.prepare("INSERT INTO modelos (nombre, categoria, precio_alquiler) VALUES ('X', 'Y', -1)").run()
    ).toThrow(/CHECK/)
  })

  it('no permite devolución pactada antes de la salida', () => {
    const { alquilerId } = crearAlquilerConUnidad()
    expect(() =>
      db.prepare("UPDATE alquileres SET fecha_devolucion_pactada = '2026-10-27' WHERE id = ?").run(alquilerId)
    ).toThrow(/CHECK/)
  })

  it('el DNI del cliente es único', () => {
    crearAlquilerConUnidad()
    expect(() => db.prepare("INSERT INTO clientes (dni, nombres) VALUES ('40123456', 'Otra persona')").run()).toThrow(
      /UNIQUE/
    )
  })

  it('las claves foráneas están activas', () => {
    expect(() =>
      db.prepare("INSERT INTO unidades (modelo_id, codigo, talla) VALUES (999, 'NO-001', 'M')").run()
    ).toThrow(/FOREIGN KEY/)
  })

  it('trae una configuración inicial editable con valores de ejemplo', () => {
    expect(obtenerConfiguracion(db)).toEqual({
      moraPorDia: 500,
      modoMora: 'por_unidad',
      diasMargenLavado: 1,
      precioPorDia: false,
      carpetaRespaldo: '',
      nombreTienda: 'Disfraces Los Mellizos'
    })
    expect(() => db.prepare('INSERT INTO configuracion (id, mora_por_dia, dias_margen_lavado, nombre_tienda) VALUES (2, 0, 0, ?)').run('x')).toThrow(/CHECK/)
  })
})
