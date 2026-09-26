import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as clientes from '../../src/main/db/clientes'
import type { DatosColegio, DatosPersona } from '../../src/shared/clientes'

let db: Database.Database

beforeEach(() => {
  db = abrirBaseDeDatos(':memory:')
})

const PERSONA: DatosPersona = {
  tipo: 'persona',
  tipoDocumento: 'dni',
  numeroDocumento: '40123456',
  nombres: 'María Quispe Huamán',
  telefono: '987 654 321',
  direccion: 'Av. España 1234',
  observaciones: ''
}

const COLEGIO: DatosColegio = {
  tipo: 'colegio',
  nombres: 'I.E. Los Girasoles',
  distrito: 'La Esperanza',
  responsable: 'Carmen Rojas Vega',
  dniResponsable: '45678901',
  telefono: '949111222',
  ruc: '',
  direccion: '',
  observaciones: ''
}

function auditoria(accion: string): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM auditoria WHERE accion = ?').get(accion) as { n: number }).n
}

function alquiler(
  clienteId: number,
  estado: string,
  pactada = '2026-10-07',
  real: string | null = null
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO alquileres (cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada, fecha_devolucion_real, estado)
         VALUES (?, '2026-10-01', '2026-10-05', ?, ?, ?)`
      )
      .run(clienteId, pactada, real, estado).lastInsertRowid
  )
}

describe('personas', () => {
  it('se crean con el teléfono normalizado y quedan en auditoría', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    const ficha = clientes.obtenerFichaCliente(db, id)
    expect(ficha).toMatchObject({ tipo: 'persona', tipoDocumento: 'dni', numeroDocumento: '40123456', telefono: '987654321' })
    expect(auditoria('cliente_creado')).toBe(1)
  })

  it('el documento es único por tipo + número', () => {
    clientes.crearCliente(db, PERSONA, null)
    expect(() => clientes.crearCliente(db, { ...PERSONA, nombres: 'Otra' }, null)).toThrow(
      'Ya existe un cliente con DNI 40123456: María Quispe Huamán.'
    )
    // El mismo número como pasaporte es otro documento
    expect(() =>
      clientes.crearCliente(db, { ...PERSONA, tipoDocumento: 'pasaporte', nombres: 'Otra' }, null)
    ).not.toThrow()
  })

  it('buscarPorDocumento encuentra al dueño del documento', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    expect(clientes.buscarPorDocumento(db, 'dni', '40 123 456')).toEqual({ id, nombres: 'María Quispe Huamán' })
    expect(clientes.buscarPorDocumento(db, 'ce', '40123456')).toBeNull()
    expect(clientes.buscarPorDocumento(db, 'dni', '123')).toBeNull()
  })

  it('al editar no choca con su propio documento', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    clientes.actualizarCliente(db, id, { ...PERSONA, telefono: '044234567' }, null)
    expect(clientes.obtenerFichaCliente(db, id).telefono).toBe('044234567')
  })

  it('no se puede convertir una persona en colegio', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    expect(() => clientes.actualizarCliente(db, id, COLEGIO, null)).toThrow(/No se puede cambiar un cliente de persona a colegio/)
  })
})

describe('colegios', () => {
  it('se guardan sin documento, con distrito, responsable y su DNI', () => {
    const id = clientes.crearCliente(db, COLEGIO, null)
    expect(clientes.obtenerFichaCliente(db, id)).toMatchObject({
      tipo: 'colegio',
      tipoDocumento: null,
      numeroDocumento: null,
      distrito: 'La Esperanza',
      responsable: 'Carmen Rojas Vega',
      dniResponsable: '45678901'
    })
  })

  it('bloquea el mismo colegio en el mismo distrito, aunque esté escrito distinto', () => {
    clientes.crearCliente(db, COLEGIO, null)
    expect(() =>
      clientes.crearCliente(db, { ...COLEGIO, nombres: 'IE los girasoles', distrito: 'la esperanza' }, null)
    ).toThrow('Ya existe «I.E. Los Girasoles» en La Esperanza. Use ese colegio.')
  })

  it('permite el mismo nombre en otro distrito (es otro colegio)', () => {
    clientes.crearCliente(db, COLEGIO, null)
    expect(() => clientes.crearCliente(db, { ...COLEGIO, distrito: 'El Porvenir' }, null)).not.toThrow()
  })

  it('buscarColegiosParecidos marca el mismo y avisa de los parecidos en otros distritos', () => {
    const a = clientes.crearCliente(db, COLEGIO, null)
    const b = clientes.crearCliente(db, { ...COLEGIO, nombres: 'Los Girasoles', distrito: 'El Porvenir' }, null)
    clientes.crearCliente(db, { ...COLEGIO, nombres: 'Santa Rosita', distrito: 'Trujillo' }, null)
    expect(clientes.buscarColegiosParecidos(db, 'IE Los Girasoles', 'La Esperanza', null)).toEqual([
      { id: a, nombres: 'I.E. Los Girasoles', distrito: 'La Esperanza', activo: true, mismo: true },
      { id: b, nombres: 'Los Girasoles', distrito: 'El Porvenir', activo: true, mismo: false }
    ])
    // Al editar, el propio colegio no cuenta
    expect(clientes.buscarColegiosParecidos(db, 'I.E. Los Girasoles', 'La Esperanza', a).map((p) => p.id)).toEqual([b])
  })

  it('las personas no aparecen como colegios parecidos', () => {
    clientes.crearCliente(db, { ...PERSONA, nombres: 'Los Girasoles' }, null)
    expect(clientes.buscarColegiosParecidos(db, 'Los Girasoles', 'Trujillo', null)).toEqual([])
  })

  it('la base exige responsable y distrito a los colegios', () => {
    expect(() =>
      db.prepare("INSERT INTO clientes (tipo, nombres, distrito, responsable) VALUES ('colegio', 'X', 'Moche', '')").run()
    ).toThrow(/CHECK/)
  })
})

describe('desactivar y reactivar', () => {
  it('desactiva y reactiva, con auditoría', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    clientes.desactivarCliente(db, id, null)
    expect(clientes.obtenerFichaCliente(db, id).activo).toBe(false)
    clientes.reactivarCliente(db, id, null)
    expect(clientes.obtenerFichaCliente(db, id).activo).toBe(true)
    expect(auditoria('cliente_desactivado')).toBe(1)
    expect(auditoria('cliente_reactivado')).toBe(1)
  })

  it('no se desactiva con una reserva o disfraces por devolver', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    const a = alquiler(id, 'reservado')
    expect(() => clientes.desactivarCliente(db, id, null)).toThrow(
      'María Quispe Huamán tiene una reserva con salida el 05/10/2026. No se puede desactivar.'
    )
    db.prepare("UPDATE alquileres SET estado = 'entregado' WHERE id = ?").run(a)
    expect(() => clientes.desactivarCliente(db, id, null)).toThrow(/deben volver el 07\/10\/2026/)
    db.prepare("UPDATE alquileres SET estado = 'devuelto' WHERE id = ?").run(a)
    expect(() => clientes.desactivarCliente(db, id, null)).not.toThrow()
  })
})

describe('historial', () => {
  it('cuenta alquileres (sin cancelados), devoluciones tardías y cargos por daños', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    alquiler(id, 'devuelto', '2026-10-07', '2026-10-07') // a tiempo
    const tarde = alquiler(id, 'devuelto', '2026-10-07', '2026-10-09') // 2 días tarde
    alquiler(id, 'cancelado')
    db.prepare("INSERT INTO cargos (alquiler_id, tipo, monto, monto_original) VALUES (?, 'mora', 1000, 1000)").run(tarde)
    db.prepare("INSERT INTO cargos (alquiler_id, tipo, monto, monto_original) VALUES (?, 'dano', 2500, 2500)").run(tarde)
    db.prepare("INSERT INTO cargos (alquiler_id, tipo, monto, monto_original) VALUES (?, 'pieza_faltante', 1500, 1500)").run(tarde)

    const ficha = clientes.obtenerFichaCliente(db, id)
    expect(ficha.historial).toEqual({
      alquileresTotales: 2,
      devolucionesTardias: 1,
      cargosPorDanos: 2,
      montoCargosPorDanos: 4000,
      deudaPendiente: 5000 // mora 10 + daños 25 + faltante 15, sin pagar
    })
    expect(ficha.conAntecedentes).toBe(true)
    expect(ficha.alquileres).toHaveLength(3)
    expect(clientes.listarClientes(db)[0].conAntecedentes).toBe(true)
  })

  it('un cliente puntual y sin daños no tiene antecedentes', () => {
    const id = clientes.crearCliente(db, PERSONA, null)
    alquiler(id, 'devuelto', '2026-10-07', '2026-10-07')
    expect(clientes.obtenerFichaCliente(db, id).conAntecedentes).toBe(false)
  })
})

describe('distritos', () => {
  it('sugiere los de Trujillo más los usados, sin repetir', () => {
    clientes.crearCliente(db, { ...COLEGIO, distrito: 'Chicama' }, null)
    clientes.crearCliente(db, { ...COLEGIO, nombres: 'Otro', distrito: 'la esperanza' }, null)
    const distritos = clientes.listarDistritos(db)
    expect(distritos).toContain('Chicama')
    expect(distritos).toContain('Víctor Larco Herrera')
    expect(distritos.filter((d) => d === 'La Esperanza')).toHaveLength(1)
  })
})
