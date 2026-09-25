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
    db1.prepare("INSERT INTO clientes (dni, nombres) VALUES ('40123456', 'María Quispe')").run()
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

  it('avisa con un mensaje claro si la base es de una versión más nueva del programa', () => {
    const db = new Database(':memory:')
    db.pragma(`user_version = ${MIGRACIONES.length + 1}`)
    expect(() => aplicarMigraciones(db)).toThrow(ErrorDeNegocio)
  })
})
