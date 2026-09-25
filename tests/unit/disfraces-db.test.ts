import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as disfraces from '../../src/main/db/disfraces'
import { ErrorDeNegocio } from '../../src/main/errores'
import type { Sesion } from '../../src/main/sesion'

let db: Database.Database
const empleado: Sesion = { usuarioId: 2, rol: 'empleado' }

beforeEach(() => {
  db = abrirBaseDeDatos(':memory:')
  db.exec(`INSERT INTO usuarios (id, nombre, usuario, contrasena_hash, rol) VALUES
    (1, 'Dueña', 'duena', 'x', 'admin'), (2, 'Trabajadores', 'trabajadores', 'x', 'empleado')`)
})

function crear(nombre = 'Spiderman', precio = 3500): number {
  return disfraces.crearModelo(
    db,
    { nombre, categoria: 'Superhéroes', region: null, descripcion: '', precioAlquiler: precio },
    null
  )
}

function agregar(modeloId: number, talla: string, cantidad: number, piezas = [{ nombre: 'Máscara', costoReposicion: 2000 }]) {
  const codigos = disfraces.sugerirCodigos(db, modeloId, cantidad)
  disfraces.crearUnidades(db, { modeloId, talla, codigos, piezas }, null)
  return codigos
}

function unidadId(codigo: string): number {
  return (db.prepare('SELECT id FROM unidades WHERE codigo = ?').get(codigo) as { id: number }).id
}

function auditoria(accion: string) {
  return (db.prepare('SELECT * FROM auditoria WHERE accion = ?').all(accion) as { detalle: string }[]).map((f) =>
    JSON.parse(f.detalle)
  )
}

/** Crea un alquiler en el estado indicado con la unidad dada. */
function alquilar(codigo: string, estado: 'reservado' | 'entregado' | 'devuelto' | 'cancelado') {
  const cliente = db.prepare("INSERT INTO clientes (dni, nombres) VALUES (?, 'Cliente')").run(String(Math.random()).slice(2, 10))
  const alquiler = db
    .prepare(
      `INSERT INTO alquileres (cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada, estado)
       VALUES (?, '2026-10-20', '2026-10-28', '2026-10-31', ?)`
    )
    .run(cliente.lastInsertRowid, estado)
  db.prepare(
    'INSERT INTO detalle_alquiler (alquiler_id, unidad_id, precio_original, precio_cobrado) VALUES (?, ?, 3500, 3500)'
  ).run(alquiler.lastInsertRowid, unidadId(codigo))
}

describe('modelos', () => {
  it('asigna prefijos únicos: Spiderman -> SPI, Spiderman Negro -> SPN', () => {
    const a = crear('Spiderman')
    const b = crear('Spiderman Negro')
    expect(disfraces.obtenerFicha(db, a).prefijo).toBe('SPI')
    expect(disfraces.obtenerFicha(db, b).prefijo).toBe('SPN')
    expect(agregar(a, '8', 1)).toEqual(['SPI-001'])
    expect(agregar(b, '8', 1)).toEqual(['SPN-001'])
  })

  it('la base rechaza dos modelos con el mismo prefijo', () => {
    crear('Spiderman')
    expect(() =>
      db.prepare("INSERT INTO modelos (nombre, categoria, precio_alquiler, prefijo) VALUES ('X', 'Y', 100, 'spi')").run()
    ).toThrow(/UNIQUE/)
  })

  it('no permite dos disfraces activos con el mismo nombre', () => {
    crear('Bruja')
    expect(() => crear('bruja')).toThrow('Ya existe un disfraz llamado "bruja".')
  })

  it('cambiar el precio queda registrado con el precio anterior y el nuevo', () => {
    const id = crear('Pirata', 3000)
    disfraces.cambiarPrecio(db, id, 3500, empleado)
    expect(disfraces.obtenerFicha(db, id).precioAlquiler).toBe(3500)
    expect(auditoria('precio_cambiado')).toEqual([{ anterior: 3000, nuevo: 3500 }])
    const fila = db.prepare("SELECT usuario_id FROM auditoria WHERE accion = 'precio_cambiado'").get()
    expect(fila).toEqual({ usuario_id: empleado.usuarioId })
  })

  it('la cuenta Trabajadores puede cambiar precios', () => {
    const id = crear()
    expect(() => disfraces.cambiarPrecio(db, id, 4000, empleado)).not.toThrow()
  })

  it('dar de baja un modelo no borra nada y se puede reactivar', () => {
    const id = crear()
    agregar(id, '8', 2)
    disfraces.darDeBajaModelo(db, id, null)
    const ficha = disfraces.obtenerFicha(db, id)
    expect(ficha.activo).toBe(false)
    expect(ficha.unidades).toHaveLength(2)
    disfraces.reactivarModelo(db, id, null)
    expect(disfraces.obtenerFicha(db, id).activo).toBe(true)
  })

  it('solo la dueña puede dar de baja o reactivar un modelo', () => {
    const id = crear()
    expect(() => disfraces.darDeBajaModelo(db, id, empleado)).toThrow('Solo la dueña puede dar de baja un disfraz.')
    disfraces.darDeBajaModelo(db, id, null)
    expect(() => disfraces.reactivarModelo(db, id, empleado)).toThrow('Solo la dueña puede reactivar un disfraz.')
  })

  it('no se puede dar de baja un modelo con alquileres pendientes', () => {
    const id = crear()
    agregar(id, '8', 1)
    alquilar('SPI-001', 'reservado')
    expect(() => disfraces.darDeBajaModelo(db, id, null)).toThrow(
      '"Spiderman" tiene alquileres pendientes (SPI-001, salida 28/10/2026). No se puede dar de baja.'
    )
  })

  it('no se puede agregar unidades a un modelo dado de baja', () => {
    const id = crear()
    disfraces.darDeBajaModelo(db, id, null)
    expect(() => agregar(id, '8', 1)).toThrow(/dado de baja/)
  })

  it('un id inexistente da un mensaje claro', () => {
    expect(() => disfraces.obtenerFicha(db, 999)).toThrow(ErrorDeNegocio)
  })
})

describe('prefijo elegido a mano', () => {
  function crearConPrefijo(nombre: string, prefijo: string): number {
    return disfraces.crearModelo(
      db,
      { nombre, categoria: 'Danzas', region: 'costa', descripcion: '', precioAlquiler: 4000, prefijo },
      null
    )
  }

  it('se guarda en mayúsculas y se usa en los códigos', () => {
    const id = crearConPrefijo('Marinera varón', ' mav ')
    expect(disfraces.obtenerFicha(db, id).prefijo).toBe('MAV')
    expect(agregar(id, '10', 2)).toEqual(['MAV-001', 'MAV-002'])
  })

  it('no puede repetir el prefijo de otro disfraz, sin importar mayúsculas', () => {
    crearConPrefijo('Marinera mujer', 'MAR')
    expect(() => crearConPrefijo('Marinera varón', 'mar')).toThrow('El prefijo MAR ya lo usa «Marinera mujer». Elija otro.')
  })

  it('valida el formato', () => {
    expect(() => crearConPrefijo('Marinera varón', 'MA-V')).toThrow(/no es válido/)
    expect(() => crearConPrefijo('Marinera varón', 'M')).toThrow(/no es válido/)
    expect(() => crearConPrefijo('Marinera varón', 'MARINE')).toThrow(/no es válido/)
  })

  it('la sugerencia evita los prefijos usados', () => {
    crearConPrefijo('Marinera mujer', 'MAR')
    expect(disfraces.sugerirPrefijo(db, 'Marinera varón')).toBe('MAV')
  })

  it('se puede cambiar mientras el disfraz no tiene unidades', () => {
    const id = crearConPrefijo('Marinera varón', 'MAR')
    disfraces.cambiarPrefijo(db, id, 'mav', null)
    expect(disfraces.obtenerFicha(db, id).prefijo).toBe('MAV')
    expect(auditoria('prefijo_cambiado')).toEqual([{ anterior: 'MAR', nuevo: 'MAV' }])
  })

  it('queda bloqueado en cuanto el disfraz tiene una unidad, aunque esté de baja', () => {
    const id = crearConPrefijo('Marinera varón', 'MAV')
    agregar(id, '10', 1)
    disfraces.cambiarEstadoUnidad(db, unidadId('MAV-001'), 'baja', null)
    expect(() => disfraces.cambiarPrefijo(db, id, 'MRV', null)).toThrow(
      'No se puede cambiar el prefijo: "Marinera varón" ya tiene unidades con códigos MAV-###.'
    )
  })

  it('al cambiarlo tampoco puede repetir el de otro disfraz', () => {
    crearConPrefijo('Marinera mujer', 'MAR')
    const id = crearConPrefijo('Marinera varón', 'MAV')
    expect(() => disfraces.cambiarPrefijo(db, id, 'MAR', null)).toThrow(/ya lo usa «Marinera mujer»/)
  })
})

describe('región', () => {
  it('se guarda al crear y se puede cambiar o quitar al editar', () => {
    const id = disfraces.crearModelo(
      db,
      { nombre: 'Huaylas mujer', categoria: 'Danzas', region: 'sierra', descripcion: '', precioAlquiler: 4500 },
      null
    )
    expect(disfraces.obtenerFicha(db, id).region).toBe('sierra')
    disfraces.actualizarModelo(db, id, { nombre: 'Huaylas mujer', categoria: 'Danzas', region: null, descripcion: '' }, null)
    expect(disfraces.obtenerFicha(db, id).region).toBeNull()
    expect(disfraces.listarModelos(db)[0].region).toBeNull()
  })

  it('rechaza regiones inventadas', () => {
    expect(() =>
      disfraces.crearModelo(
        db,
        { nombre: 'X', categoria: 'Y', region: 'puna' as never, descripcion: '', precioAlquiler: 100 },
        null
      )
    ).toThrow(/región válida/)
  })
})

describe('unidades y piezas', () => {
  it('normaliza la talla escrita a mano', () => {
    const id = crear()
    agregar(id, '  xxl ', 1)
    expect(disfraces.obtenerFicha(db, id).unidades[0].talla).toBe('XXL')
  })

  it('la ficha y la lista ordenan las unidades por talla lógica y luego por código', () => {
    const id = crear()
    agregar(id, 'M', 1) // SPI-001
    agregar(id, '10', 1) // SPI-002
    agregar(id, '8', 1) // SPI-003
    agregar(id, 'S', 1) // SPI-004
    agregar(id, '8', 1) // SPI-005
    const orden = ['SPI-003', 'SPI-005', 'SPI-002', 'SPI-004', 'SPI-001']
    expect(disfraces.obtenerFicha(db, id).unidades.map((u) => u.codigo)).toEqual(orden)
    expect(disfraces.listarModelos(db)[0].unidades.map((u) => u.codigo)).toEqual(orden)
  })

  it('crea las unidades con las piezas indicadas', () => {
    const id = crear()
    agregar(id, '8', 2, [
      { nombre: 'Traje', costoReposicion: 6000 },
      { nombre: 'Máscara', costoReposicion: 2000 }
    ])
    const ficha = disfraces.obtenerFicha(db, id)
    expect(ficha.unidades.map((u) => [u.codigo, u.talla, u.estadoFisico])).toEqual([
      ['SPI-001', '8', 'disponible'],
      ['SPI-002', '8', 'disponible']
    ])
    expect(ficha.unidades[0].piezas.map((p) => p.nombre)).toEqual(['Traje', 'Máscara'])
  })

  it('sugiere copiar las piezas de la última unidad del modelo', () => {
    const id = crear()
    expect(disfraces.piezasSugeridas(db, id)).toEqual([])
    agregar(id, '8', 1, [{ nombre: 'Guantes', costoReposicion: 1500 }])
    expect(disfraces.piezasSugeridas(db, id)).toEqual([{ nombre: 'Guantes', costoReposicion: 1500 }])
  })

  it('rechaza un código que ya existe, aunque sea de otro modelo', () => {
    const a = crear('Spiderman')
    const b = crear('Batman')
    agregar(a, '8', 1)
    expect(() =>
      disfraces.crearUnidades(db, { modeloId: b, talla: 'M', codigos: ['spi-001'], piezas: [] }, null)
    ).toThrow('El código SPI-001 ya existe. Use otro código.')
    expect(disfraces.obtenerFicha(db, b).unidades).toHaveLength(0)
  })

  it('los códigos sugeridos siguen la numeración aunque haya unidades de baja', () => {
    const id = crear()
    agregar(id, '8', 2)
    disfraces.cambiarEstadoUnidad(db, unidadId('SPI-002'), 'baja', null)
    expect(disfraces.sugerirCodigos(db, id, 1)).toEqual(['SPI-003'])
  })

  it('quitar una pieza la desactiva sin borrarla', () => {
    const id = crear()
    agregar(id, '8', 1, [
      { nombre: 'Traje', costoReposicion: 6000 },
      { nombre: 'Máscara', costoReposicion: 2000 }
    ])
    const unidad = disfraces.obtenerFicha(db, id).unidades[0]
    const traje = unidad.piezas.find((p) => p.nombre === 'Traje')!
    disfraces.actualizarUnidad(
      db,
      unidad.id,
      {
        talla: '10',
        observaciones: 'Costura reforzada',
        piezas: [{ ...traje, costoReposicion: 6500 }, { nombre: 'Guantes', costoReposicion: 1500 }]
      },
      null
    )
    const despues = disfraces.obtenerFicha(db, id).unidades[0]
    expect(despues.talla).toBe('10')
    expect(despues.observaciones).toBe('Costura reforzada')
    expect(despues.piezas.map((p) => [p.nombre, p.costoReposicion])).toEqual([
      ['Traje', 6500],
      ['Guantes', 1500]
    ])
    expect(db.prepare("SELECT activo FROM piezas WHERE nombre = 'Máscara'").get()).toEqual({ activo: 0 })
  })

  it('no acepta piezas de otra unidad', () => {
    const id = crear()
    agregar(id, '8', 2)
    const [u1, u2] = disfraces.obtenerFicha(db, id).unidades
    expect(() =>
      disfraces.actualizarUnidad(db, u1.id, { talla: '8', observaciones: '', piezas: u2.piezas }, null)
    ).toThrow(ErrorDeNegocio)
  })
})

describe('estado físico', () => {
  it('lavandería y vuelta a disponible, con registro en auditoría', () => {
    const id = crear()
    agregar(id, '8', 1)
    disfraces.cambiarEstadoUnidad(db, unidadId('SPI-001'), 'lavanderia', empleado)
    disfraces.cambiarEstadoUnidad(db, unidadId('SPI-001'), 'disponible', empleado)
    expect(auditoria('estado_cambiado')).toEqual([
      { codigo: 'SPI-001', anterior: 'disponible', nuevo: 'lavanderia' },
      { codigo: 'SPI-001', anterior: 'lavanderia', nuevo: 'disponible' }
    ])
  })

  it('solo la dueña puede dar de baja o reactivar una unidad', () => {
    const id = crear()
    agregar(id, '8', 1)
    const u = unidadId('SPI-001')
    expect(() => disfraces.cambiarEstadoUnidad(db, u, 'baja', empleado)).toThrow(
      'Solo la dueña puede dar de baja una unidad.'
    )
    disfraces.cambiarEstadoUnidad(db, u, 'baja', null)
    expect(() => disfraces.cambiarEstadoUnidad(db, u, 'disponible', empleado)).toThrow(
      'Solo la dueña puede reactivar una unidad.'
    )
  })

  it('no se puede dar de baja ni mandar a reparación una unidad reservada', () => {
    const id = crear()
    agregar(id, '8', 1)
    alquilar('SPI-001', 'reservado')
    const u = unidadId('SPI-001')
    expect(() => disfraces.cambiarEstadoUnidad(db, u, 'baja', null)).toThrow(
      'SPI-001 tiene una reserva con salida el 28/10/2026. No se puede dar de baja.'
    )
    expect(() => disfraces.cambiarEstadoUnidad(db, u, 'reparacion', null)).toThrow(/No se puede enviar a reparación/)
    expect(() => disfraces.cambiarEstadoUnidad(db, u, 'lavanderia', null)).not.toThrow()
  })

  it('una unidad alquilada ahora no cambia de estado hasta su devolución', () => {
    const id = crear()
    agregar(id, '8', 1)
    alquilar('SPI-001', 'entregado')
    expect(disfraces.obtenerFicha(db, id).unidades[0].alquilada).toBe(true)
    expect(() => disfraces.cambiarEstadoUnidad(db, unidadId('SPI-001'), 'lavanderia', null)).toThrow(
      'SPI-001 está alquilado ahora (debe volver el 31/10/2026). Registre la devolución antes de cambiar su estado.'
    )
  })

  it('los alquileres devueltos o cancelados no bloquean nada', () => {
    const id = crear()
    agregar(id, '8', 1)
    alquilar('SPI-001', 'devuelto')
    alquilar('SPI-001', 'cancelado')
    expect(() => disfraces.cambiarEstadoUnidad(db, unidadId('SPI-001'), 'baja', null)).not.toThrow()
  })

  it('para reactivar una unidad, el modelo debe estar activo', () => {
    const id = crear()
    agregar(id, '8', 1)
    disfraces.cambiarEstadoUnidad(db, unidadId('SPI-001'), 'baja', null)
    disfraces.darDeBajaModelo(db, id, null)
    expect(() => disfraces.cambiarEstadoUnidad(db, unidadId('SPI-001'), 'disponible', null)).toThrow(
      /Reactive primero el disfraz/
    )
  })
})

describe('listado', () => {
  it('incluye las unidades con su talla y estado para filtrar en pantalla', () => {
    const id = crear()
    agregar(id, '8', 1)
    agregar(id, '10', 1)
    alquilar('SPI-002', 'entregado')
    const [modelo] = disfraces.listarModelos(db)
    expect(modelo.unidades).toEqual([
      { codigo: 'SPI-001', talla: '8', estadoFisico: 'disponible', alquilada: false },
      { codigo: 'SPI-002', talla: '10', estadoFisico: 'disponible', alquilada: true }
    ])
  })

  it('lista las categorías existentes sin repetir', () => {
    crear('Spiderman')
    crear('Batman')
    disfraces.crearModelo(
      db,
      { nombre: 'Bruja', categoria: 'Halloween', region: null, descripcion: '', precioAlquiler: 100 },
      null
    )
    expect(disfraces.listarCategorias(db)).toEqual(['Halloween', 'Superhéroes'])
  })
})
