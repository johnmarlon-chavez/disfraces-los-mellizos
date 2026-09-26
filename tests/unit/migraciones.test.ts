import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import { aplicarMigraciones, MIGRACIONES, versionActual, type Migracion } from '../../src/main/db/migraciones'
import { ErrorDeNegocio } from '../../src/main/errores'

const carpetas: string[] = []
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true })
})
function archivoTemporal(): string {
  const carpeta = mkdtempSync(join(tmpdir(), 'disfraces-test-'))
  carpetas.push(carpeta)
  return join(carpeta, 'datos.db')
}

describe('aplicarMigraciones', () => {
  it('lleva una base nueva a la última versión', () => {
    const db = new Database(':memory:')
    expect(aplicarMigraciones(db)).toBe(MIGRACIONES.length)
    expect(versionActual(db)).toBe(MIGRACIONES.length)
  })

  it('no vuelve a aplicar migraciones ya aplicadas', () => {
    const db = new Database(':memory:')
    aplicarMigraciones(db)
    expect(aplicarMigraciones(db)).toBe(0)
  })

  it('conserva los datos existentes al reabrir la base', () => {
    const ruta = archivoTemporal()
    const db1 = abrirBaseDeDatos(ruta)
    db1.prepare("INSERT INTO clientes (tipo_documento, numero_documento, nombres) VALUES ('dni', '40123456', 'María Quispe')").run()
    db1.close()

    const db2 = abrirBaseDeDatos(ruta)
    expect(db2.prepare('SELECT nombres FROM clientes').all()).toEqual([{ nombres: 'María Quispe' }])
    db2.close()
  })

  it('aplica solo las migraciones nuevas sobre una base con datos', () => {
    const db = new Database(':memory:')
    const v1: Migracion = {
      version: 1,
      nombre: 'uno',
      aplicar: (d) => d.exec("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('dato')")
    }
    const v2: Migracion = { version: 2, nombre: 'dos', aplicar: (d) => d.exec("ALTER TABLE t ADD COLUMN y TEXT DEFAULT 'n'") }
    aplicarMigraciones(db, [v1])
    expect(aplicarMigraciones(db, [v1, v2])).toBe(1)
    expect(db.prepare('SELECT x, y FROM t').all()).toEqual([{ x: 'dato', y: 'n' }])
  })

  it('si una migración falla, la base queda como estaba', () => {
    const db = new Database(':memory:')
    const v1: Migracion = { version: 1, nombre: 'uno', aplicar: (d) => d.exec('CREATE TABLE t (x TEXT)') }
    const v2Rota: Migracion = {
      version: 2,
      nombre: 'rota',
      aplicar: (d) => {
        d.exec('CREATE TABLE nueva (y TEXT)')
        throw new Error('falla a propósito')
      }
    }
    aplicarMigraciones(db, [v1])
    expect(() => aplicarMigraciones(db, [v1, v2Rota])).toThrow('falla a propósito')
    expect(versionActual(db)).toBe(1)
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    expect(tablas).toEqual([{ name: 't' }])
  })

  it('rechaza migraciones mal numeradas', () => {
    const db = new Database(':memory:')
    const mala: Migracion = { version: 2, nombre: 'salta', aplicar: () => {} }
    expect(() => aplicarMigraciones(db, [mala])).toThrow(/mal numeradas/)
  })

  it('la migración 002 asigna prefijos únicos a los modelos existentes sin tocar sus unidades', () => {
    const db = new Database(':memory:')
    aplicarMigraciones(db, MIGRACIONES.slice(0, 1))
    db.exec(`
      INSERT INTO modelos (id, nombre, categoria, precio_alquiler) VALUES
        (1, 'Hombre Araña', 'Superhéroes', 3500),
        (2, 'Spiderman', 'Superhéroes', 3500),
        (3, 'Spiderman Negro', 'Superhéroes', 3500),
        (4, 'Araña Roja', 'Superhéroes', 3500);
      INSERT INTO unidades (modelo_id, codigo, talla) VALUES
        (1, 'ARA-001', '8'), (1, 'ARA-002', '10'),
        (4, 'ARA-003', '8');
    `)
    aplicarMigraciones(db)
    const filas = db.prepare('SELECT id, prefijo FROM modelos ORDER BY id').all()
    expect(filas).toEqual([
      { id: 1, prefijo: 'ARA' }, // tomado de sus códigos
      { id: 2, prefijo: 'SPI' },
      { id: 3, prefijo: 'SPN' },
      { id: 4, prefijo: 'ARR' } // ARA ya estaba tomado por el modelo 1
    ])
    expect(db.prepare('SELECT codigo FROM unidades ORDER BY id').all()).toEqual([
      { codigo: 'ARA-001' },
      { codigo: 'ARA-002' },
      { codigo: 'ARA-003' }
    ])
  })

  it('la migración 003 agrega región (vacía) y modo de mora "por unidad" sin tocar los datos', () => {
    const db = new Database(':memory:')
    aplicarMigraciones(db, MIGRACIONES.slice(0, 2))
    db.exec("INSERT INTO modelos (nombre, categoria, precio_alquiler, prefijo) VALUES ('Pirata', 'Personajes', 3000, 'PIR')")
    aplicarMigraciones(db)
    expect(db.prepare('SELECT nombre, precio_alquiler, region FROM modelos').get()).toEqual({
      nombre: 'Pirata',
      precio_alquiler: 3000,
      region: null
    })
    expect(db.prepare('SELECT modo_mora FROM configuracion').get()).toEqual({ modo_mora: 'por_unidad' })
    expect(() => db.prepare("UPDATE modelos SET region = 'puna'").run()).toThrow(/CHECK/)
    expect(() => db.prepare("UPDATE configuracion SET modo_mora = 'por_dia'").run()).toThrow(/CHECK/)
  })

  describe('migraciones que reconstruyen tablas (sinClavesForaneas)', () => {
    const base: Migracion = {
      version: 1,
      nombre: 'base',
      aplicar: (d) =>
        d.exec(`
          CREATE TABLE padres (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
          CREATE TABLE hijos (id INTEGER PRIMARY KEY, padre_id INTEGER NOT NULL REFERENCES padres (id));
          INSERT INTO padres VALUES (1, 'uno'), (2, 'dos');
          INSERT INTO hijos VALUES (10, 1), (20, 2);
        `)
    }

    function baseConReferencias(): Database.Database {
      const db = new Database(':memory:')
      db.pragma('foreign_keys = ON')
      aplicarMigraciones(db, [base])
      return db
    }

    const reconstruir = (copiarTodo: boolean): Migracion => ({
      version: 2,
      nombre: 'reconstruir',
      sinClavesForaneas: true,
      aplicar: (d) =>
        d.exec(`
          CREATE TABLE padres_nueva (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, extra TEXT);
          INSERT INTO padres_nueva (id, nombre) SELECT id, nombre FROM padres ${copiarTodo ? '' : 'WHERE id = 1'};
          DROP TABLE padres;
          ALTER TABLE padres_nueva RENAME TO padres;
        `)
    })

    it('conserva datos y referencias, y deja las claves foráneas activas', () => {
      const db = baseConReferencias()
      aplicarMigraciones(db, [base, reconstruir(true)])
      expect(db.prepare('SELECT id, nombre FROM padres ORDER BY id').all()).toEqual([
        { id: 1, nombre: 'uno' },
        { id: 2, nombre: 'dos' }
      ])
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(() => db.prepare('INSERT INTO hijos VALUES (30, 99)').run()).toThrow(/FOREIGN KEY/)
    })

    it('si deja referencias rotas, deshace todo y las claves foráneas siguen activas', () => {
      const db = baseConReferencias()
      expect(() =>
        aplicarMigraciones(db, [base, reconstruir(false)])
      ).toThrow(/referencias rotas/)
      expect(versionActual(db)).toBe(1)
      expect(db.prepare('SELECT COUNT(*) AS n FROM padres').get()).toEqual({ n: 2 })
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    })

    it('si la migración lanza un error, las claves foráneas siguen activas', () => {
      const db = baseConReferencias()
      const rota: Migracion = {
        version: 2,
        nombre: 'rota',
        sinClavesForaneas: true,
        aplicar: () => {
          throw new Error('falla a propósito')
        }
      }
      expect(() => aplicarMigraciones(db, [base, rota])).toThrow('falla a propósito')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    })
  })

  it('la migración 004 convierte los clientes en personas con DNI y conserva los alquileres', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    aplicarMigraciones(db, MIGRACIONES.slice(0, 3))
    db.exec(`
      INSERT INTO clientes (id, dni, nombres, telefono) VALUES (7, '40123456', 'María Quispe', '987654321');
      INSERT INTO alquileres (cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada)
        VALUES (7, '2026-10-01', '2026-10-05', '2026-10-07');
    `)
    aplicarMigraciones(db)
    expect(db.prepare('SELECT id, tipo, tipo_documento, numero_documento, nombres, telefono FROM clientes').get()).toEqual({
      id: 7,
      tipo: 'persona',
      tipo_documento: 'dni',
      numero_documento: '40123456',
      nombres: 'María Quispe',
      telefono: '987654321'
    })
    expect(db.prepare('SELECT cliente_id FROM alquileres').get()).toEqual({ cliente_id: 7 })
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    // Las referencias apuntan a la tabla nueva
    expect(() =>
      db
        .prepare(
          "INSERT INTO alquileres (cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada) VALUES (99, '2026-10-01', '2026-10-05', '2026-10-07')"
        )
        .run()
    ).toThrow(/FOREIGN KEY/)
  })

  it('la migración 005 conserva los pagos y acepta devolucion_adelanto', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    aplicarMigraciones(db, MIGRACIONES.slice(0, 4))
    db.exec(`
      INSERT INTO clientes (id, tipo_documento, numero_documento, nombres) VALUES (1, 'dni', '40123456', 'María');
      INSERT INTO alquileres (id, cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada)
        VALUES (5, 1, '2026-10-01', '2026-10-05', '2026-10-07');
      INSERT INTO pagos (id, alquiler_id, monto, concepto, medio) VALUES (9, 5, 3000, 'adelanto', 'yape');
    `)
    expect(() =>
      db.prepare("INSERT INTO pagos (alquiler_id, monto, concepto, medio) VALUES (5, 100, 'devolucion_adelanto', 'yape')").run()
    ).toThrow(/CHECK/)
    aplicarMigraciones(db)
    expect(db.prepare('SELECT id, alquiler_id, monto, concepto, medio FROM pagos').all()).toEqual([
      { id: 9, alquiler_id: 5, monto: 3000, concepto: 'adelanto', medio: 'yape' }
    ])
    expect(db.prepare('SELECT evento, grado_seccion FROM alquileres').get()).toEqual({ evento: '', grado_seccion: '' })
    db.prepare("INSERT INTO pagos (alquiler_id, monto, concepto, medio) VALUES (5, 100, 'devolucion_adelanto', 'yape')").run()
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('avisa con un mensaje claro si la base es de una versión más nueva del programa', () => {
    const db = new Database(':memory:')
    db.pragma(`user_version = ${MIGRACIONES.length + 1}`)
    expect(() => aplicarMigraciones(db)).toThrow(ErrorDeNegocio)
  })
})
