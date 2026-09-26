import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as clientes from '../../src/main/db/clientes'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as disfraces from '../../src/main/db/disfraces'
import * as pedidos from '../../src/main/db/pedidos'
import { ErrorDeNegocio } from '../../src/main/errores'
import type { BorradorPedido, PendienteBorrador } from '../../src/shared/pedidos'

const HOY = '2026-10-15'
let db: Database.Database
let huaylas: number
let pirata: number
let colegio: number
let persona: number

function crearModelo(nombre: string, prefijo: string, precio: number): number {
  return disfraces.crearModelo(
    db,
    { nombre, categoria: 'Danzas', region: 'sierra', descripcion: '', precioAlquiler: precio, prefijo },
    null
  )
}

function agregar(modeloId: number, talla: string, cantidad: number): string[] {
  const codigos = disfraces.sugerirCodigos(db, modeloId, cantidad)
  disfraces.crearUnidades(db, { modeloId, talla, codigos, piezas: [] }, null)
  return codigos
}

function id(codigo: string): number {
  return (db.prepare('SELECT id FROM unidades WHERE codigo = ?').get(codigo) as { id: number }).id
}

function borrador(parcial: Partial<BorradorPedido> = {}): BorradorPedido {
  return {
    clienteId: colegio,
    fechaSalida: '2026-10-28',
    fechaDevolucionPactada: '2026-10-31',
    evento: 'Aniversario del colegio',
    gradoSeccion: '3.° B',
    observaciones: '',
    garantiaTipo: 'dni',
    garantiaMonto: 0,
    lineas: [],
    pendientes: [],
    adelanto: null,
    ...parcial
  }
}

const linea = (codigo: string, precio = 4500) => ({ unidadId: id(codigo), precioCobrado: precio })

function pendiente(parcial: Partial<PendienteBorrador> = {}): PendienteBorrador {
  return {
    modeloId: huaylas,
    talla: '10',
    cantidad: 3,
    fechaLimite: '2026-10-26',
    precioCobrado: 4500,
    observaciones: '',
    ...parcial
  }
}

const crear = (b: BorradorPedido) => pedidos.crearPedido(db, b, null, HOY)
const rango = { inicio: '2026-10-28', fin: '2026-10-31' }

beforeEach(() => {
  db = abrirBaseDeDatos(':memory:')
  huaylas = crearModelo('Huaylas mujer', 'HUM', 4500)
  pirata = crearModelo('Pirata', 'PIR', 3000)
  agregar(huaylas, '10', 5) // HUM-001..005
  agregar(huaylas, '12', 2) // HUM-006..007
  agregar(pirata, 'M', 1) // PIR-001
  colegio = clientes.crearCliente(
    db,
    {
      tipo: 'colegio',
      nombres: 'I.E. Los Girasoles',
      distrito: 'La Esperanza',
      responsable: 'Carmen Rojas',
      dniResponsable: '45678901',
      telefono: '949111222',
      ruc: '',
      direccion: '',
      observaciones: ''
    },
    null
  )
  persona = clientes.crearCliente(
    db,
    {
      tipo: 'persona',
      tipoDocumento: 'dni',
      numeroDocumento: '40123456',
      nombres: 'María Quispe',
      telefono: '987654321',
      direccion: '',
      observaciones: ''
    },
    null
  )
})

describe('catálogo y asignación automática', () => {
  it('muestra tallas en orden lógico con cuántas hay libres en las fechas', () => {
    crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002')] }))
    const cat = pedidos.catalogoParaPedido(db, rango, null, HOY)
    expect(cat.find((m) => m.id === huaylas)!.tallas).toEqual([
      { talla: '10', total: 5, libres: 3 },
      { talla: '12', total: 2, libres: 2 }
    ])
  })

  it('las unidades de baja no cuentan, las de reparación no están libres, las de lavandería sí', () => {
    disfraces.cambiarEstadoUnidad(db, id('HUM-001'), 'baja', null)
    disfraces.cambiarEstadoUnidad(db, id('HUM-002'), 'reparacion', null)
    disfraces.cambiarEstadoUnidad(db, id('HUM-003'), 'lavanderia', null)
    const talla10 = pedidos.catalogoParaPedido(db, rango, null, HOY).find((m) => m.id === huaylas)!.tallas[0]
    expect(talla10).toEqual({ talla: '10', total: 4, libres: 3 })
  })

  it('los modelos dados de baja no aparecen', () => {
    disfraces.darDeBajaModelo(db, pirata, null)
    expect(pedidos.catalogoParaPedido(db, rango, null, HOY).map((m) => m.id)).toEqual([huaylas])
  })

  it('asigna por cantidad; si no alcanzan dice cuántas faltan', () => {
    crear(borrador({ lineas: [linea('HUM-001')] }))
    const r = pedidos.asignarUnidades(
      db,
      { modeloId: huaylas, talla: '10', cantidad: 7, rango, excluirAlquilerId: null, yaEnCarrito: [id('HUM-002')] },
      HOY
    )
    expect(r.asignadas.map((u) => u.codigo)).toEqual(['HUM-003', 'HUM-004', 'HUM-005'])
    expect(r.libres).toBe(3)
    expect(r.faltan).toBe(4)
    expect(r.asignadas[0].precioSugerido).toBe(4500)
  })

  it('pide las fechas antes de buscar disponibilidad', () => {
    expect(() => pedidos.catalogoParaPedido(db, { inicio: '', fin: '' }, null, HOY)).toThrow(/Elija primero las fechas/)
  })
})

describe('crear reserva', () => {
  it('guarda cliente, fechas, evento, unidades con precio copiado y adelanto', () => {
    const pid = crear(
      borrador({ lineas: [linea('HUM-001'), linea('HUM-002', 4000)], adelanto: { monto: 3000, medio: 'yape' } })
    )
    const p = pedidos.obtenerPedido(db, pid)
    expect(p).toMatchObject({
      estado: 'reservado',
      fechaReserva: HOY,
      evento: 'Aniversario del colegio',
      gradoSeccion: '3.° B',
      totales: { total: 8500, adelantoNeto: 3000, saldo: 5500 }
    })
    expect(p.lineas.map((l) => [l.codigo, l.precioOriginal, l.precioCobrado])).toEqual([
      ['HUM-001', 4500, 4500],
      ['HUM-002', 4500, 4000] // descuento solo en este pedido
    ])
    expect(p.pagos).toMatchObject([{ concepto: 'adelanto', monto: 3000, medio: 'yape' }])
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'pedido_creado'").get()).toEqual({ n: 1 })
  })

  it('cambiar el precio del disfraz después no altera el pedido', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')] }))
    disfraces.cambiarPrecio(db, huaylas, 6000, null)
    expect(pedidos.obtenerPedido(db, pid).lineas[0]).toMatchObject({ precioOriginal: 4500, precioCobrado: 4500 })
  })

  it('rechaza una unidad ya reservada en esas fechas, explicando por qué', () => {
    crear(borrador({ lineas: [linea('HUM-001')] }))
    expect(() => crear(borrador({ clienteId: persona, fechaSalida: '2026-10-30', fechaDevolucionPactada: '2026-11-02', lineas: [linea('HUM-001')] }))).toThrow(
      'HUM-001 está reservado del 28/10 al 31/10 para I.E. Los Girasoles (más 1 día de lavado).\nQuítelos del pedido o cambie las fechas.'
    )
  })

  it('respeta el margen de lavado de Configuración', () => {
    crear(borrador({ lineas: [linea('HUM-001')] }))
    const siguiente = (salida: string) =>
      borrador({ clienteId: persona, fechaSalida: salida, fechaDevolucionPactada: '2026-11-05', lineas: [linea('HUM-001')] })
    expect(() => crear(siguiente('2026-11-01'))).toThrow(ErrorDeNegocio)
    db.prepare('UPDATE configuracion SET dias_margen_lavado = 0').run()
    expect(() => crear(siguiente('2026-11-01'))).not.toThrow()
  })

  it('lista hasta 3 conflictos y cuántos más hay', () => {
    crear(borrador({ lineas: ['HUM-001', 'HUM-002', 'HUM-003', 'HUM-004', 'HUM-005'].map((c) => linea(c)) }))
    try {
      crear(borrador({ clienteId: persona, lineas: ['HUM-001', 'HUM-002', 'HUM-003', 'HUM-004', 'HUM-005'].map((c) => linea(c)) }))
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message.split('\n')).toHaveLength(5)
      expect((e as Error).message).toContain('(y 2 más)')
    }
  })

  it('rechaza unidades en reparación, repetidas o de un disfraz dado de baja', () => {
    disfraces.cambiarEstadoUnidad(db, id('HUM-001'), 'reparacion', null)
    expect(() => crear(borrador({ lineas: [linea('HUM-001')] }))).toThrow(/HUM-001 está en reparación/)
    expect(() => crear(borrador({ lineas: [linea('HUM-002'), linea('HUM-002')] }))).toThrow('HUM-002 está dos veces en el pedido.')
    disfraces.darDeBajaModelo(db, pirata, null)
    expect(() => crear(borrador({ lineas: [linea('PIR-001')] }))).toThrow(/"Pirata" está dado de baja/)
  })

  it('permite una unidad en lavandería aunque salga hoy', () => {
    disfraces.cambiarEstadoUnidad(db, id('HUM-001'), 'lavanderia', null)
    expect(() => crear(borrador({ fechaSalida: HOY, fechaDevolucionPactada: HOY, lineas: [linea('HUM-001')] }))).not.toThrow()
  })

  it('valida fechas: salida pasada y devolución antes de la salida', () => {
    expect(() => crear(borrador({ fechaSalida: '2026-10-14', lineas: [linea('HUM-001')] }))).toThrow(/ya pasó/)
    expect(() => crear(borrador({ fechaDevolucionPactada: '2026-10-27', lineas: [linea('HUM-001')] }))).toThrow(
      'La fecha de devolución no puede ser anterior a la de salida.'
    )
    expect(() => crear(borrador({ fechaSalida: '2026-02-30', lineas: [linea('HUM-001')] }))).toThrow('Elija la fecha de salida.')
  })

  it('el evento es obligatorio', () => {
    expect(() => crear(borrador({ evento: '  ', lineas: [linea('HUM-001')] }))).toThrow(/Escriba el evento/)
    expect(() => crear(borrador({ evento: 'Otro', lineas: [linea('HUM-001')] }))).not.toThrow()
  })

  it('el pedido debe tener al menos un disfraz', () => {
    expect(() => crear(borrador())).toThrow('Agregue al menos un disfraz al pedido.')
  })

  it('no acepta clientes desactivados', () => {
    clientes.desactivarCliente(db, persona, null)
    expect(() => crear(borrador({ clienteId: persona, lineas: [linea('HUM-001')] }))).toThrow(/está desactivado/)
  })

  it('el adelanto no puede pasar del total', () => {
    expect(() => crear(borrador({ lineas: [linea('HUM-001')], adelanto: { monto: 4501, medio: 'efectivo' } }))).toThrow(
      'El adelanto (S/ 45.01) no puede ser mayor que el total del pedido (S/ 45.00).'
    )
  })

  it('garantía DNI no lleva monto', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')], garantiaTipo: 'dni', garantiaMonto: 5000 }))
    expect(pedidos.obtenerPedido(db, pid).garantiaMonto).toBe(0)
  })

  it('precio por día: el precio se multiplica por los días (diferencia de fechas, mínimo 1)', () => {
    db.prepare('UPDATE configuracion SET precio_por_dia = 1').run()
    const pid = crear(borrador({ lineas: [linea('HUM-001', 13500)] })) // 28 -> 31: 3 días
    expect(pedidos.obtenerPedido(db, pid).lineas[0].precioOriginal).toBe(13500)
    const mismoDia = crear(borrador({ clienteId: persona, fechaSalida: '2026-11-20', fechaDevolucionPactada: '2026-11-20', lineas: [linea('HUM-002', 4500)] }))
    expect(pedidos.obtenerPedido(db, mismoDia).lineas[0].precioOriginal).toBe(4500)
  })

  it('dos pedidos que compiten por la misma unidad: el segundo se rechaza', () => {
    const libres = pedidos.asignarUnidades(db, { modeloId: pirata, talla: 'M', cantidad: 1, rango, excluirAlquilerId: null, yaEnCarrito: [] }, HOY)
    const unidad = libres.asignadas[0].unidadId
    crear(borrador({ lineas: [{ unidadId: unidad, precioCobrado: 3000 }] }))
    expect(() => crear(borrador({ clienteId: persona, lineas: [{ unidadId: unidad, precioCobrado: 3000 }] }))).toThrow(/PIR-001 está reservado/)
  })
})

describe('pendientes de confección', () => {
  it('se guardan con el precio copiado y cuentan en el total', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002')], pendientes: [pendiente({ cantidad: 3, precioCobrado: 4000 })] }))
    const p = pedidos.obtenerPedido(db, pid)
    expect(p.pendientes).toMatchObject([
      { modeloNombre: 'Huaylas mujer', talla: '10', cantidad: 3, cantidadAsignada: 0, estado: 'pendiente', precioOriginal: 4500, precioCobrado: 4000 }
    ])
    expect(p.totales.total).toBe(4500 * 2 + 4000 * 3)
    expect(pedidos.listarPedidos(db)[0]).toMatchObject({ unidades: 2, porConfeccionar: 3, total: 21000 })
  })

  it('un pedido puede tener solo pendientes (ninguna unidad libre)', () => {
    expect(() => crear(borrador({ pendientes: [pendiente()] }))).not.toThrow()
  })

  it('fecha límite: entre hoy y la salida', () => {
    expect(() => crear(borrador({ pendientes: [pendiente({ fechaLimite: '2026-10-29' })] }))).toThrow(/no puede ser después de la salida \(28\/10\/2026\)/)
    expect(() => crear(borrador({ pendientes: [pendiente({ fechaLimite: '2026-10-14' })] }))).toThrow(/ya pasó/)
    expect(() => crear(borrador({ pendientes: [pendiente({ fechaLimite: '2026-10-28' })] }))).not.toThrow()
  })

  it('cantidad entre 1 y 200', () => {
    expect(() => crear(borrador({ pendientes: [pendiente({ cantidad: 0 })] }))).toThrow(/al menos 1/)
    expect(() => crear(borrador({ pendientes: [pendiente({ cantidad: 201 })] }))).toThrow(/máxima/)
  })

  it('asignación automática parcial y luego completa (queda listo)', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002'), linea('HUM-003'), linea('HUM-004')], pendientes: [pendiente({ cantidad: 3 })] }))
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]

    // Solo HUM-005 está libre: asigna 1 de 3
    expect(pedidos.asignarAPendiente(db, pend.id, null, null, HOY)).toEqual(['HUM-005'])
    let p = pedidos.obtenerPedido(db, pid)
    expect(p.pendientes[0]).toMatchObject({ cantidadAsignada: 1, estado: 'pendiente' })
    expect(p.lineas.find((l) => l.codigo === 'HUM-005')).toMatchObject({ pendienteId: pend.id, precioCobrado: 4500 })
    expect(p.totales.total).toBe(4500 * 5 + 4500 * 2) // no se cuenta dos veces

    // Sin más unidades libres: mensaje claro
    expect(() => pedidos.asignarAPendiente(db, pend.id, null, null, HOY)).toThrow(/No hay unidades libres de Huaylas mujer talla 10/)

    // Se confeccionan 2 más y se asignan
    const nuevas = agregar(huaylas, '10', 2)
    expect(pedidos.asignarAPendiente(db, pend.id, nuevas.map(id), null, HOY)).toEqual(nuevas)
    p = pedidos.obtenerPedido(db, pid)
    expect(p.pendientes[0]).toMatchObject({ cantidadAsignada: 3, estado: 'listo' })
    expect(pedidos.listarPedidos(db)[0].porConfeccionar).toBe(0)
    expect(() => pedidos.asignarAPendiente(db, pend.id, null, null, HOY)).toThrow(/ya tiene todas sus unidades/)
  })

  it('no asigna más de lo que falta, ni otra talla, ni otro modelo, ni unidades ocupadas', () => {
    const pid = crear(borrador({ pendientes: [pendiente({ cantidad: 1 })] }))
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]
    expect(() => pedidos.asignarAPendiente(db, pend.id, [id('HUM-001'), id('HUM-002')], null, HOY)).toThrow('A este pendiente solo le falta 1 unidad.')
    expect(() => pedidos.asignarAPendiente(db, pend.id, [id('HUM-006')], null, HOY)).toThrow('HUM-006 no es Huaylas mujer talla 10.')
    expect(() => pedidos.asignarAPendiente(db, pend.id, [id('PIR-001')], null, HOY)).toThrow(/no es Huaylas mujer/)
    crear(borrador({ clienteId: persona, lineas: [linea('HUM-001')] }))
    expect(() => pedidos.asignarAPendiente(db, pend.id, [id('HUM-001')], null, HOY)).toThrow(/HUM-001 está reservado/)
  })

  it('en un pedido cancelado no se asigna', () => {
    const pid = crear(borrador({ pendientes: [pendiente()] }))
    pedidos.cancelarPedido(db, pid, { tipo: 'retener' }, null)
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]
    expect(() => pedidos.asignarAPendiente(db, pend.id, null, null, HOY)).toThrow(/el pedido está cancelado/)
  })

  it('estado: en confección; "listo" solo se marca al asignar', () => {
    const pid = crear(borrador({ pendientes: [pendiente()] }))
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]
    pedidos.cambiarEstadoPendiente(db, pend.id, 'en_confeccion', null)
    expect(pedidos.obtenerPedido(db, pid).pendientes[0].estado).toBe('en_confeccion')
    expect(() => pedidos.cambiarEstadoPendiente(db, pend.id, 'listo' as never, null)).toThrow(/solo cuando se le asignan/)
  })

  it('pendientesAbiertos: por modelo y talla, sin listos ni cancelados, por fecha límite', () => {
    const a = crear(borrador({ pendientes: [pendiente({ fechaLimite: '2026-10-26' })] }))
    const b = crear(borrador({ clienteId: persona, fechaSalida: '2026-10-20', fechaDevolucionPactada: '2026-10-21', pendientes: [pendiente({ talla: ' 10 ', cantidad: 2, fechaLimite: '2026-10-18' })] }))
    crear(borrador({ pendientes: [pendiente({ talla: '12' })] }))
    const c = crear(borrador({ pendientes: [pendiente()] }))
    pedidos.cancelarPedido(db, c, { tipo: 'retener' }, null)
    expect(pedidos.pendientesAbiertos(db, huaylas, '10').map((p) => [p.pedidoId, p.faltan])).toEqual([
      [b, 2],
      [a, 3]
    ])
  })
})

describe('editar reserva', () => {
  it('cambiar fechas vuelve a verificar las unidades sin chocar consigo mismo', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')] }))
    pedidos.actualizarPedido(db, pid, borrador({ fechaSalida: '2026-10-29', fechaDevolucionPactada: '2026-11-02', lineas: [linea('HUM-001')] }), null, HOY)
    expect(pedidos.obtenerPedido(db, pid).fechaDevolucionPactada).toBe('2026-11-02')

    crear(borrador({ clienteId: persona, fechaSalida: '2026-11-10', fechaDevolucionPactada: '2026-11-12', lineas: [linea('HUM-002')] }))
    expect(() =>
      pedidos.actualizarPedido(db, pid, borrador({ fechaSalida: '2026-10-29', fechaDevolucionPactada: '2026-11-10', lineas: [linea('HUM-001'), linea('HUM-002')] }), null, HOY)
    ).toThrow(/HUM-002 está reservado del 10\/11 al 12\/11 para María Quispe/)
  })

  it('verificarUnidades avisa de las que quedaron ocupadas al cambiar fechas', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002')] }))
    crear(borrador({ clienteId: persona, fechaSalida: '2026-11-05', fechaDevolucionPactada: '2026-11-06', lineas: [linea('HUM-002')] }))
    const conflictos = pedidos.verificarUnidades(db, [id('HUM-001'), id('HUM-002')], { inicio: '2026-10-28', fin: '2026-11-05' }, pid, HOY)
    expect(conflictos.map((c) => c.codigo)).toEqual(['HUM-002'])
  })

  it('quitar una unidad borra la línea y deja constancia en auditoría', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002', 4000)] }))
    pedidos.actualizarPedido(db, pid, borrador({ lineas: [linea('HUM-001')] }), null, HOY)
    expect(pedidos.obtenerPedido(db, pid).lineas.map((l) => l.codigo)).toEqual(['HUM-001'])
    const constancia = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'unidad_quitada_del_pedido'").get() as { detalle: string }
    expect(JSON.parse(constancia.detalle)).toMatchObject({ codigo: 'HUM-002', precio_cobrado: 4000, precio_original: 4500 })
    // HUM-002 queda libre para otro pedido
    expect(() => crear(borrador({ clienteId: persona, lineas: [linea('HUM-002')] }))).not.toThrow()
  })

  it('quitar una unidad que cubría un pendiente lo reabre', () => {
    const pid = crear(borrador({ pendientes: [pendiente({ cantidad: 1 })] }))
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]
    pedidos.asignarAPendiente(db, pend.id, [id('HUM-001')], null, HOY)
    expect(pedidos.obtenerPedido(db, pid).pendientes[0].estado).toBe('listo')
    pedidos.actualizarPedido(db, pid, borrador({ pendientes: [{ ...pendiente({ cantidad: 1 }), id: pend.id }] }), null, HOY)
    expect(pedidos.obtenerPedido(db, pid).pendientes[0]).toMatchObject({ cantidadAsignada: 0, estado: 'en_confeccion' })
  })

  it('no se puede quitar un pendiente con unidades asignadas ni bajar su cantidad por debajo', () => {
    const pid = crear(borrador({ pendientes: [pendiente({ cantidad: 2 })] }))
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]
    pedidos.asignarAPendiente(db, pend.id, [id('HUM-001')], null, HOY)
    const conLinea = [linea('HUM-001')]
    expect(() => pedidos.actualizarPedido(db, pid, borrador({ lineas: conLinea, pendientes: [] }), null, HOY)).toThrow(/Quite primero esas unidades/)
    expect(() =>
      pedidos.actualizarPedido(db, pid, borrador({ lineas: conLinea, pendientes: [{ ...pendiente({ cantidad: 0 }), id: pend.id }] }), null, HOY)
    ).toThrow(ErrorDeNegocio)
  })

  it('un pendiente sin unidades asignadas se puede quitar (con constancia)', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')], pendientes: [pendiente()] }))
    pedidos.actualizarPedido(db, pid, borrador({ lineas: [linea('HUM-001')] }), null, HOY)
    expect(pedidos.obtenerPedido(db, pid).pendientes).toEqual([])
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'pendiente_quitado_del_pedido'").get()).toEqual({ n: 1 })
  })

  it('si el nuevo total queda por debajo del adelanto pagado, no se guarda nada', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002')], adelanto: { monto: 8000, medio: 'efectivo' } }))
    expect(() => pedidos.actualizarPedido(db, pid, borrador({ lineas: [linea('HUM-001')] }), null, HOY)).toThrow(/no puede ser mayor que el total/)
    expect(pedidos.obtenerPedido(db, pid).lineas).toHaveLength(2)
  })

  it('"aplicar a todos": el borrador cambia los precios de las líneas de ese modelo', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-006'), linea('PIR-001', 3000)] }))
    pedidos.actualizarPedido(db, pid, borrador({ lineas: [linea('HUM-001', 4000), linea('HUM-006', 4000), linea('PIR-001', 3000)] }), null, HOY)
    expect(pedidos.obtenerPedido(db, pid).lineas.map((l) => [l.codigo, l.precioOriginal, l.precioCobrado])).toEqual([
      ['HUM-001', 4500, 4000],
      ['HUM-006', 4500, 4000],
      ['PIR-001', 3000, 3000]
    ])
  })

  it('precio por día: al cambiar los días se reajusta el precio original', () => {
    db.prepare('UPDATE configuracion SET precio_por_dia = 1').run()
    const pid = crear(borrador({ lineas: [linea('HUM-001', 13500)] })) // 3 días
    pedidos.actualizarPedido(db, pid, borrador({ fechaDevolucionPactada: '2026-11-02', lineas: [linea('HUM-001', 22500)] }), null, HOY) // 5 días
    expect(pedidos.obtenerPedido(db, pid).lineas[0]).toMatchObject({ precioOriginal: 22500, precioCobrado: 22500 })
  })

  it('una reserva vencida (no recogida) se puede editar conservando su salida pasada', () => {
    const pid = crear(borrador({ fechaSalida: '2026-10-16', fechaDevolucionPactada: '2026-10-18', lineas: [linea('HUM-001')] }))
    const despues = '2026-10-17'
    expect(() =>
      pedidos.actualizarPedido(db, pid, borrador({ fechaSalida: '2026-10-16', fechaDevolucionPactada: '2026-10-20', lineas: [linea('HUM-001')] }), null, despues)
    ).not.toThrow()
    expect(() =>
      pedidos.actualizarPedido(db, pid, borrador({ fechaSalida: '2026-10-15', fechaDevolucionPactada: '2026-10-20', lineas: [linea('HUM-001')] }), null, despues)
    ).toThrow(/ya pasó/)
  })

  it('solo se editan pedidos reservados', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')] }))
    db.prepare("UPDATE alquileres SET estado = 'entregado' WHERE id = ?").run(pid)
    expect(() => pedidos.actualizarPedido(db, pid, borrador({ lineas: [linea('HUM-001')] }), null, HOY)).toThrow(
      'No se puede editar el pedido: el pedido ya fue entregado.'
    )
  })
})

describe('adelantos y cancelación', () => {
  it('registrar otro adelanto, sin pasar del total', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002')], adelanto: { monto: 3000, medio: 'efectivo' } }))
    pedidos.registrarAdelanto(db, pid, 5000, 'plin', null)
    expect(pedidos.obtenerPedido(db, pid).totales).toEqual({ total: 9000, adelantoNeto: 8000, saldo: 1000 })
    expect(() => pedidos.registrarAdelanto(db, pid, 1001, 'efectivo', null)).toThrow(/El saldo pendiente es S\/ 10.00/)
  })

  it('cancelar libera las unidades', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')] }))
    pedidos.cancelarPedido(db, pid, { tipo: 'retener' }, null)
    expect(pedidos.obtenerPedido(db, pid).estado).toBe('cancelado')
    expect(() => crear(borrador({ clienteId: persona, lineas: [linea('HUM-001')] }))).not.toThrow()
  })

  it('cancelar devolviendo todo el adelanto', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')], adelanto: { monto: 3000, medio: 'efectivo' } }))
    pedidos.cancelarPedido(db, pid, { tipo: 'devolver_todo', medio: 'yape' }, null)
    const p = pedidos.obtenerPedido(db, pid)
    expect(p.pagos.map((x) => [x.concepto, x.monto, x.medio])).toEqual([
      ['adelanto', 3000, 'efectivo'],
      ['devolucion_adelanto', 3000, 'yape']
    ])
    expect(p.totales.adelantoNeto).toBe(0)
  })

  it('cancelar devolviendo una parte; lo demás queda retenido', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')], adelanto: { monto: 3000, medio: 'efectivo' } }))
    expect(() => pedidos.cancelarPedido(db, pid, { tipo: 'devolver_parte', monto: 3001, medio: 'efectivo' }, null)).toThrow(
      'No se puede devolver S/ 30.01: el adelanto pagado es S/ 30.00.'
    )
    pedidos.cancelarPedido(db, pid, { tipo: 'devolver_parte', monto: 1000, medio: 'efectivo' }, null)
    const constancia = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'pedido_cancelado'").get() as { detalle: string }
    expect(JSON.parse(constancia.detalle)).toMatchObject({ adelanto_pagado: 3000, devuelto: 1000, retenido: 2000 })
  })

  it('cancelar reteniendo el adelanto no registra devolución', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')], adelanto: { monto: 3000, medio: 'efectivo' } }))
    pedidos.cancelarPedido(db, pid, { tipo: 'retener' }, null)
    expect(pedidos.obtenerPedido(db, pid).pagos).toHaveLength(1)
  })

  it('no se cancela un pedido entregado ni uno ya cancelado', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001')] }))
    db.prepare("UPDATE alquileres SET estado = 'entregado' WHERE id = ?").run(pid)
    expect(() => pedidos.cancelarPedido(db, pid, { tipo: 'retener' }, null)).toThrow(/ya se entregó/)
    const otro = crear(borrador({ clienteId: persona, lineas: [linea('HUM-002')] }))
    pedidos.cancelarPedido(db, otro, { tipo: 'retener' }, null)
    expect(() => pedidos.cancelarPedido(db, otro, { tipo: 'retener' }, null)).toThrow(/está cancelado/)
  })
})

describe('cliente y listado', () => {
  it('el pedido aparece en el historial del cliente y en la lista con sus códigos', () => {
    const pid = crear(borrador({ lineas: [linea('HUM-001'), linea('HUM-002')] }))
    expect(clientes.obtenerFichaCliente(db, colegio).alquileres.map((a) => a.id)).toEqual([pid])
    expect(pedidos.listarPedidos(db)[0]).toMatchObject({ clienteNombre: 'I.E. Los Girasoles', codigos: ['HUM-001', 'HUM-002'] })
  })

  it('un cliente con reserva no se puede desactivar', () => {
    crear(borrador({ lineas: [linea('HUM-001')] }))
    expect(() => clientes.desactivarCliente(db, colegio, null)).toThrow(/tiene una reserva/)
  })

  it('eventos sugeridos: los de siempre, los usados y "Otro" al final', () => {
    crear(borrador({ evento: 'Día del Logro', lineas: [linea('HUM-001')] }))
    const eventos = pedidos.eventosSugeridos(db)
    expect(eventos).toContain('Día del Logro')
    expect(eventos.at(-1)).toBe('Otro')
  })
})
