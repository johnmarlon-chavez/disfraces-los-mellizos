import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as clientes from '../../src/main/db/clientes'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as disfraces from '../../src/main/db/disfraces'
import * as entregas from '../../src/main/db/entregas'
import * as pedidos from '../../src/main/db/pedidos'
import { establecerVerificadorDuena, type Sesion } from '../../src/main/sesion'
import type { DatosDevolucion, DatosEntrega, UnidadADevolver } from '../../src/shared/entregas'
import type { BorradorPedido } from '../../src/shared/pedidos'

// Pedido de referencia: sale el 28/10, vuelve el 31/10.
const SALIDA = '2026-10-28'
const PACTADA = '2026-10-31'
let db: Database.Database
let huaylas: number
let colegio: number
const empleado: Sesion = { usuarioId: 2, rol: 'empleado' }

function agregar(modeloId: number, talla: string, cantidad: number): string[] {
  const codigos = disfraces.sugerirCodigos(db, modeloId, cantidad)
  disfraces.crearUnidades(
    db,
    { modeloId, talla, codigos, piezas: [{ nombre: 'Sombrero', costoReposicion: 3000 }, { nombre: 'Lliclla', costoReposicion: 2000 }] },
    null
  )
  return codigos
}
const uid = (codigo: string) => (db.prepare('SELECT id FROM unidades WHERE codigo = ?').get(codigo) as { id: number }).id

function crearPedido(codigos: string[], extra: Partial<BorradorPedido> = {}): number {
  return pedidos.crearPedido(
    db,
    {
      clienteId: colegio,
      fechaSalida: SALIDA,
      fechaDevolucionPactada: PACTADA,
      evento: 'Aniversario del colegio',
      gradoSeccion: '',
      observaciones: '',
      garantiaTipo: 'efectivo',
      garantiaMonto: 5000,
      lineas: codigos.map((c) => ({ unidadId: uid(c), precioCobrado: 4000 })),
      pendientes: [],
      adelanto: { monto: 1000, medio: 'efectivo' },
      ...extra
    },
    null,
    '2026-10-15'
  )
}

const detalles = (pid: number) => pedidos.obtenerPedido(db, pid).lineas
const detalleDe = (pid: number, codigo: string) => detalles(pid).find((l) => l.codigo === codigo)!.detalleId

function datosEntrega(pid: number, parcial: Partial<DatosEntrega> = {}): DatosEntrega {
  const p = pedidos.obtenerPedido(db, pid)
  return {
    detalleIds: p.lineas.filter((l) => !l.fechaEntregaReal).map((l) => l.detalleId),
    adelantarSalida: false,
    lavanderiaConfirmada: false,
    pagos: [{ monto: p.totales.saldo, medio: 'yape' }],
    saldoPendienteAutorizado: false,
    garantia: { tipo: 'efectivo', monto: 5000, medio: 'efectivo', documento: '' },
    ...parcial
  }
}

function bien(pid: number, codigo: string, extra: Partial<UnidadADevolver> = {}): UnidadADevolver {
  return { detalleId: detalleDe(pid, codigo), piezasFaltantes: [], dano: null, destino: 'lavanderia', observaciones: '', ...extra }
}

const devolucion = (fecha: string, unidades: UnidadADevolver[]): DatosDevolucion => ({ fecha, unidades })
const cargos = (pid: number) => pedidos.obtenerPedido(db, pid).cargos.map((c) => [c.tipo, c.codigo, c.monto])
const estadoFisico = (codigo: string) =>
  (db.prepare('SELECT estado_fisico FROM unidades WHERE codigo = ?').get(codigo) as { estado_fisico: string }).estado_fisico

beforeEach(() => {
  db = abrirBaseDeDatos(':memory:')
  db.exec(`INSERT INTO usuarios (id, nombre, usuario, contrasena_hash, rol) VALUES
    (1, 'Dueña', 'duena', 'x', 'admin'), (2, 'Trabajadores', 'trabajadores', 'x', 'empleado')`)
  db.prepare('UPDATE configuracion SET mora_por_dia = 500, dias_margen_lavado = 1').run()
  huaylas = disfraces.crearModelo(
    db,
    { nombre: 'Huaylas mujer', categoria: 'Danzas', region: 'sierra', descripcion: '', precioAlquiler: 4500, prefijo: 'HUM' },
    null
  )
  agregar(huaylas, '10', 6) // HUM-001..006
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
})

describe('entrega', () => {
  it('cobra el saldo, registra la garantía y marca cada unidad como entregada', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002'])
    const r = entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)
    expect(r).toEqual({ entregadas: ['HUM-001', 'HUM-002'], faltanEntregar: 0 })
    const p = pedidos.obtenerPedido(db, pid)
    expect(p.estado).toBe('entregado')
    expect(p.lineas.every((l) => l.fechaEntregaReal === SALIDA)).toBe(true)
    expect(p.pagos.map((x) => [x.concepto, x.monto])).toEqual([
      ['adelanto', 1000],
      ['saldo', 7000],
      ['garantia_recibida', 5000]
    ])
    expect(p.totales.saldo).toBe(0)
  })

  it('antes de la salida solo con "Entregar hoy (adelantar la salida)", que verifica la disponibilidad', () => {
    const pid = crearPedido(['HUM-001'])
    expect(() => entregas.entregar(db, pid, datosEntrega(pid), null, null, '2026-10-26')).toThrow(/Entregar hoy \(adelantar la salida\)/)
    entregas.entregar(db, pid, datosEntrega(pid, { adelantarSalida: true }), null, null, '2026-10-26')
    expect(pedidos.obtenerPedido(db, pid).fechaSalida).toBe('2026-10-26')
  })

  it('no adelanta la salida si la unidad está ocupada antes', () => {
    const otro = pedidos.crearPedido(
      db,
      {
        clienteId: colegio, fechaSalida: '2026-10-20', fechaDevolucionPactada: '2026-10-24', evento: 'Otro', gradoSeccion: '',
        observaciones: '', garantiaTipo: null, garantiaMonto: 0, lineas: [{ unidadId: uid('HUM-001'), precioCobrado: 4000 }],
        pendientes: [], adelanto: null
      },
      null,
      '2026-10-15'
    )
    expect(otro).toBeGreaterThan(0)
    const pid = crearPedido(['HUM-001'])
    expect(() => entregas.entregar(db, pid, datosEntrega(pid, { adelantarSalida: true }), null, null, '2026-10-22')).toThrow(
      /No se puede adelantar la salida a hoy:\nHUM-001 está reservado del 20\/10 al 24\/10/
    )
  })

  it('el saldo debe pagarse completo; con autorización de la dueña puede quedar pendiente', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002'])
    const parcial = datosEntrega(pid, { pagos: [{ monto: 3000, medio: 'efectivo' }] })
    expect(() => entregas.entregar(db, pid, parcial, empleado, null, SALIDA)).toThrow('Falta cobrar S/ 40.00 del saldo. Solo con autorización de la dueña se entrega con saldo pendiente.')
    expect(() => entregas.entregar(db, pid, { ...parcial, saldoPendienteAutorizado: true }, empleado, null, SALIDA)).toThrow(/Solo la dueña puede entregar con saldo pendiente/)
    establecerVerificadorDuena((c) => c === 'clave')
    try {
      entregas.entregar(db, pid, { ...parcial, saldoPendienteAutorizado: true }, empleado, { contrasena: 'clave' }, SALIDA)
    } finally {
      establecerVerificadorDuena(null)
    }
    expect(pedidos.obtenerPedido(db, pid).cuenta.plan.deuda.saldo).toBe(4000)
  })

  it('no se cobra más que el saldo', () => {
    const pid = crearPedido(['HUM-001'])
    expect(() => entregas.entregar(db, pid, datosEntrega(pid, { pagos: [{ monto: 9999, medio: 'efectivo' }] }), null, null, SALIDA)).toThrow(/más que el saldo/)
  })

  it('la garantía es obligatoria; en DNI se anota el documento', () => {
    const pid = crearPedido(['HUM-001'])
    expect(() => entregas.entregar(db, pid, datosEntrega(pid, { garantia: null }), null, null, SALIDA)).toThrow(/Registre la garantía/)
    entregas.entregar(db, pid, datosEntrega(pid, { garantia: { tipo: 'dni', monto: 0, medio: 'efectivo', documento: '45 678 901' } }), null, null, SALIDA)
    expect(pedidos.obtenerPedido(db, pid).cuenta.garantiaDocumento).toBe('45678901')
  })

  it('una unidad que todavía no vuelve de otro pedido bloquea la entrega', () => {
    const anterior = pedidos.crearPedido(
      db,
      { clienteId: colegio, fechaSalida: '2026-10-16', fechaDevolucionPactada: '2026-10-20', evento: 'Otro', gradoSeccion: '', observaciones: '',
        garantiaTipo: null, garantiaMonto: 0, lineas: [{ unidadId: uid('HUM-001'), precioCobrado: 4000 }], pendientes: [], adelanto: null },
      null,
      '2026-10-15'
    )
    entregas.entregar(db, anterior, datosEntrega(anterior), null, null, '2026-10-16')
    // Se reservó cuando todo estaba en orden...
    const pid = crearPedido(['HUM-001'])
    // ...pero el 28/10 HUM-001 sigue fuera (debía volver el 20/10)
    expect(() => entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)).toThrow(
      /HUM-001 todavía no vuelve del pedido N\.° 1 \(I\.E\. Los Girasoles\)\. Cámbiela por otra libre antes de entregar\./
    )
  })

  it('en lavandería: pide confirmar que está limpia y pasa a disponible; en reparación bloquea', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002'])
    disfraces.cambiarEstadoUnidad(db, uid('HUM-001'), 'lavanderia', null)
    expect(() => entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)).toThrow('HUM-001 figura en lavandería. Confirme que ya está limpio.')
    entregas.entregar(db, pid, datosEntrega(pid, { lavanderiaConfirmada: true }), null, null, SALIDA)
    expect(estadoFisico('HUM-001')).toBe('disponible')

    const otro = crearPedido(['HUM-003'], { fechaSalida: '2026-11-10', fechaDevolucionPactada: '2026-11-12' })
    db.prepare("UPDATE unidades SET estado_fisico = 'reparacion' WHERE codigo = 'HUM-003'").run()
    expect(() => entregas.entregar(db, otro, datosEntrega(otro), null, null, '2026-11-10')).toThrow('HUM-003 está en reparación: no se puede entregar.')
  })
})

describe('entrega en partes (27 hoy y 3 mañana)', () => {
  it('con unidades por confeccionar solo la dueña autoriza; las que faltan se entregan después en el mismo pedido', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002'], {
      pendientes: [{ modeloId: huaylas, talla: '10', cantidad: 2, fechaLimite: '2026-10-26', precioCobrado: 4000, observaciones: '' }]
    })
    expect(() => entregas.entregar(db, pid, datosEntrega(pid), empleado, null, SALIDA)).toThrow(/Solo la dueña puede entregar un pedido con disfraces por confeccionar/)
    const r = entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)
    expect(r.faltanEntregar).toBe(2)

    // Se confeccionan, se asignan con el pedido ya entregado, y se entregan al día siguiente
    const pend = pedidos.obtenerPedido(db, pid).pendientes[0]
    pedidos.asignarAPendiente(db, pend.id, null, null, '2026-10-29')
    const segunda = entregas.entregar(db, pid, { ...datosEntrega(pid), pagos: [], garantia: null }, null, null, '2026-10-29')
    expect(segunda.faltanEntregar).toBe(0)
    const p = pedidos.obtenerPedido(db, pid)
    expect(p.lineas.map((l) => l.fechaEntregaReal)).toEqual([SALIDA, SALIDA, '2026-10-29', '2026-10-29'])
    expect(p.pagos.filter((x) => x.concepto === 'garantia_recibida')).toHaveLength(1)
  })

  it('también se pueden dejar unidades ya asignadas para después', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002', 'HUM-003'])
    const r = entregas.entregar(db, pid, datosEntrega(pid, { detalleIds: [detalleDe(pid, 'HUM-001')] }), null, null, SALIDA)
    expect(r).toEqual({ entregadas: ['HUM-001'], faltanEntregar: 2 })
    expect(() => entregas.entregar(db, pid, { ...datosEntrega(pid), detalleIds: [detalleDe(pid, 'HUM-001')] }, null, null, SALIDA)).toThrow(/HUM-001 ya se entregó/)
  })

  it('la dueña puede cancelar lo que no se entregó; el total baja y lo pagado de más se devuelve al liquidar', () => {
    const pid = crearPedido(['HUM-001'], {
      pendientes: [{ modeloId: huaylas, talla: '10', cantidad: 1, fechaLimite: '2026-10-26', precioCobrado: 4000, observaciones: '' }]
    })
    // Hay HUM-002..006 libres: el pendiente se podría asignar, pero no se confeccionó a tiempo
    entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA) // paga 80 en total
    expect(() => entregas.cancelarLoQueFalta(db, pid, empleado)).toThrow(/Solo la dueña/)
    entregas.cancelarLoQueFalta(db, pid, null)
    expect(pedidos.obtenerPedido(db, pid).totales.total).toBe(4000)
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)
    const plan = pedidos.obtenerPedido(db, pid).cuenta.plan
    expect(plan.aFavor).toBe(4000)
    expect(plan.devolverGarantia).toBe(5000)
  })
})

describe('devolución por unidad', () => {
  function entregado(codigos = ['HUM-001', 'HUM-002', 'HUM-003']): number {
    const pid = crearPedido(codigos)
    entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)
    return pid
  }

  it('parcial: el pedido sigue entregado y muestra cuántas faltan; al final queda listo para liquidar', () => {
    const pid = entregado()
    const r1 = entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001'), bien(pid, 'HUM-002')]), null, PACTADA)
    expect(r1).toEqual({ devueltas: ['HUM-001', 'HUM-002'], faltanDevolver: 1, listoParaLiquidar: false })
    expect(pedidos.obtenerPedido(db, pid).estado).toBe('entregado')
    expect(pedidos.obtenerPedido(db, pid).cuenta).toMatchObject({ faltanDevolver: 1, totalUnidades: 3 })
    const r2 = entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-003')]), null, PACTADA)
    expect(r2.listoParaLiquidar).toBe(true)
  })

  it('una unidad devuelta queda libre para otra reserva aunque el pedido siga entregado', () => {
    const pid = entregado()
    entregas.devolver(db, pid, devolucion('2026-10-29', [bien(pid, 'HUM-001')]), null, '2026-10-29')
    const libres = pedidos.unidadesLibresParaPedido(db, huaylas, '10', { inicio: '2026-10-30', fin: '2026-10-30' }, null, [], '2026-10-29')
    expect(libres.map((u) => u.codigo)).toContain('HUM-001')
    expect(libres.map((u) => u.codigo)).not.toContain('HUM-002')
  })

  it('"Alquilado" en Disfraces es por unidad', () => {
    const pid = entregado()
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)
    const unidades = disfraces.obtenerFicha(db, huaylas).unidades
    expect(unidades.find((u) => u.codigo === 'HUM-001')!.alquilada).toBe(false)
    expect(unidades.find((u) => u.codigo === 'HUM-002')!.alquilada).toBe(true)
  })

  it('piezas faltantes y daños generan cargos; la unidad va a lavandería o reparación con una nota', () => {
    const pid = entregado()
    const piezas = disfraces.obtenerFicha(db, huaylas).unidades.find((u) => u.codigo === 'HUM-001')!.piezas
    const sombrero = piezas.find((p) => p.nombre === 'Sombrero')!
    entregas.devolver(
      db,
      pid,
      devolucion(PACTADA, [
        bien(pid, 'HUM-001', { piezasFaltantes: [{ piezaId: sombrero.id, monto: 3000 }] }),
        bien(pid, 'HUM-002', { dano: { monto: 2500, descripcion: 'pollera rota' }, destino: 'reparacion' })
      ]),
      null,
      PACTADA
    )
    expect(cargos(pid)).toEqual([
      ['pieza_faltante', 'HUM-001', 3000],
      ['dano', 'HUM-002', 2500]
    ])
    expect(estadoFisico('HUM-001')).toBe('lavanderia')
    expect(estadoFisico('HUM-002')).toBe('reparacion')
    const hum1 = disfraces.obtenerFicha(db, huaylas).unidades.find((u) => u.codigo === 'HUM-001')!
    expect(hum1.observaciones).toContain('Falta: Sombrero (pedido N.° 1, 31/10/2026)')
    expect(detalles(pid).map((l) => l.estadoDevolucion)).toEqual(['con_faltantes', 'con_danos', null])
  })

  it('validaciones: unidad ya devuelta, sin entregar, fecha futura o anterior a la entrega, daño sin descripción', () => {
    const pid = entregado(['HUM-001', 'HUM-002'])
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)
    expect(() => entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)).toThrow(/HUM-001 ya se devolvió el 31\/10\/2026/)
    expect(() => entregas.devolver(db, pid, devolucion('2026-11-01', [bien(pid, 'HUM-002')]), null, PACTADA)).toThrow('La fecha de devolución no puede ser futura.')
    expect(() => entregas.devolver(db, pid, devolucion('2026-10-27', [bien(pid, 'HUM-002')]), null, PACTADA)).toThrow(/se entregó el 28\/10\/2026: la devolución no puede ser antes/)
    expect(() =>
      entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-002', { dano: { monto: 100, descripcion: ' ' } })]), null, PACTADA)
    ).toThrow('Describa el daño de HUM-002.')
  })

  it('una devolución registrada después con su fecha real no cobra mora injusta', () => {
    const pid = entregado(['HUM-001'])
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, '2026-11-03')
    expect(cargos(pid)).toEqual([])
  })
})

describe('mora según modo_mora', () => {
  function entregado(): number {
    const pid = crearPedido(['HUM-001', 'HUM-002', 'HUM-003'])
    entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)
    return pid
  }

  it('por unidad: cada unidad atrasada paga sus días', () => {
    const pid = entregado()
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)
    entregas.devolver(db, pid, devolucion('2026-11-02', [bien(pid, 'HUM-002'), bien(pid, 'HUM-003')]), null, '2026-11-02')
    expect(cargos(pid)).toEqual([
      ['mora', 'HUM-002', 1000],
      ['mora', 'HUM-003', 1000]
    ])
  })

  it('por pedido: una sola mora por el mayor retraso, sin cobrar dos veces en devoluciones parciales', () => {
    db.prepare("UPDATE configuracion SET modo_mora = 'por_pedido'").run()
    const pid = entregado()
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)
    entregas.devolver(db, pid, devolucion('2026-11-03', [bien(pid, 'HUM-002')]), null, '2026-11-03')
    entregas.devolver(db, pid, devolucion('2026-11-05', [bien(pid, 'HUM-003')]), null, '2026-11-05')
    expect(cargos(pid)).toEqual([
      ['mora', null, 1500],
      ['mora', null, 1000]
    ])
  })

  it('solo la dueña rebaja o perdona la mora, con motivo; queda en auditoría', () => {
    const pid = entregado()
    entregas.devolver(db, pid, devolucion('2026-11-02', [bien(pid, 'HUM-001')]), null, '2026-11-02')
    const cargo = pedidos.obtenerPedido(db, pid).cargos[0]
    expect(() => entregas.rebajarMora(db, cargo.id, 0, 'cliente frecuente', empleado)).toThrow(/Solo la dueña/)
    expect(() => entregas.rebajarMora(db, cargo.id, 0, '', null)).toThrow(/motivo/)
    entregas.rebajarMora(db, cargo.id, 0, 'cliente frecuente', null)
    const c = pedidos.obtenerPedido(db, pid).cargos[0]
    expect(c).toMatchObject({ monto: 0, montoOriginal: 1000, motivoRebaja: 'cliente frecuente' })
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'mora_perdonada'").get()).toEqual({ n: 1 })
  })

  it('previsualizar muestra lo mismo que se guardaría, sin guardar nada', () => {
    const pid = entregado()
    const datos = devolucion('2026-11-02', [bien(pid, 'HUM-001'), bien(pid, 'HUM-002'), bien(pid, 'HUM-003')])
    const vista = entregas.previsualizarDevolucion(db, pid, datos, '2026-11-02')
    expect(vista.completa).toBe(true)
    expect(vista.cargos.map((c) => c.monto)).toEqual([1000, 1000, 1000])
    expect(vista.plan!.retener.mora).toBe(3000)
    expect(cargos(pid)).toEqual([]) // nada guardado
    entregas.devolver(db, pid, datos, null, '2026-11-02')
    expect(cargos(pid).map((c) => c[2])).toEqual([1000, 1000, 1000])
  })
})

describe('liquidación', () => {
  function devuelto(garantia: DatosEntrega['garantia'], cargosExtra: Partial<UnidadADevolver> = {}, fecha = PACTADA): number {
    const pid = crearPedido(['HUM-001', 'HUM-002'])
    entregas.entregar(db, pid, datosEntrega(pid, { garantia }), null, null, SALIDA)
    entregas.devolver(db, pid, devolucion(fecha, [bien(pid, 'HUM-001', cargosExtra), bien(pid, 'HUM-002')]), null, fecha)
    return pid
  }
  const efectivo = { tipo: 'efectivo' as const, monto: 5000, medio: 'efectivo' as const, documento: '' }
  const dni = { tipo: 'dni' as const, monto: 0, medio: 'efectivo' as const, documento: '45678901' }

  it('sin cargos: se devuelve toda la garantía y el pedido queda devuelto', () => {
    const pid = devuelto(efectivo)
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    const p = pedidos.obtenerPedido(db, pid)
    expect(p.estado).toBe('devuelto')
    expect(p.fechaDevolucionReal).toBe(PACTADA)
    expect(p.pagos.at(-1)).toMatchObject({ concepto: 'garantia_devuelta', monto: 5000 })
    expect(p.cuenta.garantiaCerrada).toBe(true)
  })

  it('cargos menores que la garantía: se descuentan y se devuelve el resto', () => {
    const pid = devuelto(efectivo, { dano: { monto: 1200, descripcion: 'costura' } }, '2026-11-01') // + mora 2 × 5
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    const pagos = pedidos.obtenerPedido(db, pid).pagos.filter((x) => x.concepto !== 'adelanto' && x.concepto !== 'saldo' || x.desdeGarantia)
    expect(pagos.map((x) => [x.concepto, x.monto, x.desdeGarantia])).toEqual([
      ['garantia_recibida', 5000, false],
      ['dano', 1200, true],
      ['mora', 1000, true],
      ['garantia_devuelta', 2800, false]
    ])
  })

  it('cargos mayores que la garantía: se retiene todo; lo que falta se cobra en el momento', () => {
    const pid = devuelto(efectivo, { dano: { monto: 6000, descripcion: 'traje inservible' } })
    const plan = pedidos.obtenerPedido(db, pid).cuenta.plan
    expect(plan.faltaCobrar.total).toBe(1000)
    entregas.liquidar(db, pid, { cobros: [{ monto: 1000, medio: 'yape' }], medioDevolucion: 'efectivo' }, null)
    const p = pedidos.obtenerPedido(db, pid)
    expect(p.cuenta.plan.deuda.total).toBe(0)
    expect(p.pagos.some((x) => x.concepto === 'garantia_devuelta')).toBe(false)
  })

  it('si no paga lo que falta, se cierra con deuda: "Debe S/ X", antecedente del cliente, pago posterior', () => {
    const pid = devuelto(efectivo, { dano: { monto: 6000, descripcion: 'traje inservible' } })
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    expect(pedidos.obtenerPedido(db, pid).estado).toBe('devuelto')
    expect(pedidos.listarPedidos(db)[0].debe).toBe(1000)
    const cliente = clientes.obtenerFichaCliente(db, colegio)
    expect(cliente.historial.deudaPendiente).toBe(1000)
    expect(cliente.conAntecedentes).toBe(true)
    expect(() => entregas.registrarPagoDeuda(db, pid, 1500, 'efectivo', null)).toThrow(/no se puede cobrar S\/ 15.00/)
    entregas.registrarPagoDeuda(db, pid, 1000, 'efectivo', null)
    expect(pedidos.listarPedidos(db)[0].debe).toBe(0)
  })

  it('DNI en prenda sin deuda: se marca para devolver al cerrar', () => {
    const pid = devuelto(dni)
    expect(pedidos.obtenerPedido(db, pid).cuenta.plan.dni).toBe('devolver')
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    expect(pedidos.obtenerPedido(db, pid).cuenta.garantiaCerrada).toBe(true)
  })

  it('DNI en prenda con deuda: se retiene hasta que pague', () => {
    const pid = devuelto(dni, { dano: { monto: 2000, descripcion: 'mancha' } })
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    expect(pedidos.obtenerPedido(db, pid).cuenta.garantiaCerrada).toBe(false)
    expect(() => entregas.devolverDocumento(db, pid, null)).toThrow(/se retiene hasta que pague/)
    entregas.registrarPagoDeuda(db, pid, 2000, 'plin', null)
    entregas.devolverDocumento(db, pid, null)
    expect(pedidos.obtenerPedido(db, pid).cuenta.garantiaCerrada).toBe(true)
  })

  it('saldo pendiente autorizado al entregar se cubre primero con la garantía', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002'])
    entregas.entregar(db, pid, datosEntrega(pid, { pagos: [], saldoPendienteAutorizado: true }), null, null, SALIDA) // debe 70 de saldo
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001'), bien(pid, 'HUM-002')]), null, PACTADA)
    const plan = pedidos.obtenerPedido(db, pid).cuenta.plan
    expect(plan.retener).toMatchObject({ saldo: 5000 })
    expect(plan.faltaCobrar).toMatchObject({ saldo: 2000, total: 2000 })
  })

  it('no se liquida con disfraces por devolver o por entregar', () => {
    const pid = crearPedido(['HUM-001', 'HUM-002'])
    entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)
    entregas.devolver(db, pid, devolucion(PACTADA, [bien(pid, 'HUM-001')]), null, PACTADA)
    expect(() => entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)).toThrow('Todavía hay disfraces por devolver.')
  })

  it('"Marcar todo como limpio" libera las unidades del pedido que siguen en lavandería', () => {
    const pid = devuelto(efectivo)
    disfraces.cambiarEstadoUnidad(db, uid('HUM-002'), 'reparacion', null)
    expect(entregas.liberarUnidades(db, pid, null)).toEqual(['HUM-001'])
    expect(estadoFisico('HUM-001')).toBe('disponible')
    expect(estadoFisico('HUM-002')).toBe('reparacion')
  })
})

describe('historial del cliente', () => {
  it('una devolución tardía cuenta al cerrar el pedido', () => {
    const pid = crearPedido(['HUM-001'])
    entregas.entregar(db, pid, datosEntrega(pid), null, null, SALIDA)
    entregas.devolver(db, pid, devolucion('2026-11-02', [bien(pid, 'HUM-001')]), null, '2026-11-02')
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    expect(clientes.obtenerFichaCliente(db, colegio).historial.devolucionesTardias).toBe(1)
  })
})
