import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as clientes from '../../src/main/db/clientes'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as disfraces from '../../src/main/db/disfraces'
import * as entregas from '../../src/main/db/entregas'
import * as pedidos from '../../src/main/db/pedidos'
import * as reportes from '../../src/main/db/reportes'
import type { Sesion } from '../../src/main/sesion'
import type { BorradorPedido } from '../../src/shared/pedidos'

// "Hoy" en estas pruebas: 30/10/2026
const HOY = '2026-10-30'
let db: Database.Database
let huaylas: number
let pirata: number
let colegio: number
let persona: number

function agregar(modeloId: number, talla: string, cantidad: number): string[] {
  const codigos = disfraces.sugerirCodigos(db, modeloId, cantidad)
  disfraces.crearUnidades(db, { modeloId, talla, codigos, piezas: [] }, null)
  return codigos
}
const uid = (c: string) => (db.prepare('SELECT id FROM unidades WHERE codigo = ?').get(c) as { id: number }).id

function pedido(
  cliente: number,
  codigos: string[],
  salida: string,
  devolucion: string,
  hoy: string,
  extra: Partial<BorradorPedido> = {}
): number {
  return pedidos.crearPedido(
    db,
    {
      clienteId: cliente,
      fechaSalida: salida,
      fechaDevolucionPactada: devolucion,
      evento: 'Aniversario del colegio',
      gradoSeccion: '',
      observaciones: '',
      garantiaTipo: 'efectivo',
      garantiaMonto: 0,
      lineas: codigos.map((c) => ({ unidadId: uid(c), precioCobrado: 4000 })),
      pendientes: [],
      adelanto: null,
      ...extra
    },
    null,
    hoy
  )
}

function entregar(pid: number, hoy: string, garantia = 5000): void {
  const p = pedidos.obtenerPedido(db, pid)
  entregas.entregar(
    db,
    pid,
    {
      detalleIds: p.lineas.map((l) => l.detalleId),
      adelantarSalida: false,
      lavanderiaConfirmada: true,
      pagos: p.totales.saldo > 0 ? [{ monto: p.totales.saldo, medio: 'yape' }] : [],
      saldoPendienteAutorizado: false,
      garantia: { tipo: 'efectivo', monto: garantia, medio: 'efectivo', documento: '' }
    },
    null,
    null,
    hoy
  )
}

function devolverTodo(pid: number, fecha: string, danos: Record<string, number> = {}): void {
  const p = pedidos.obtenerPedido(db, pid)
  entregas.devolver(
    db,
    pid,
    {
      fecha,
      unidades: p.lineas
        .filter((l) => !l.fechaDevolucionReal)
        .map((l) => ({
          detalleId: l.detalleId,
          piezasFaltantes: [],
          dano: danos[l.codigo] ? { monto: danos[l.codigo], descripcion: 'roto' } : null,
          destino: 'lavanderia' as const,
          observaciones: ''
        }))
    },
    null,
    fecha
  )
}

/** Fija la fecha de los pagos recién creados (se guardan con la hora real). */
function fecharPagos(desdeId: number, iso: string): void {
  db.prepare('UPDATE pagos SET fecha = ? WHERE id > ?').run(iso, desdeId)
}
const ultimoPago = () => (db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM pagos').get() as { n: number }).n

beforeEach(() => {
  db = abrirBaseDeDatos(':memory:')
  db.prepare('UPDATE configuracion SET mora_por_dia = 500, dias_margen_lavado = 1').run()
  huaylas = disfraces.crearModelo(db, { nombre: 'Huaylas mujer', categoria: 'Danzas', region: 'sierra', descripcion: '', precioAlquiler: 4000, prefijo: 'HUM' }, null)
  pirata = disfraces.crearModelo(db, { nombre: 'Pirata', categoria: 'Personajes', region: null, descripcion: '', precioAlquiler: 3000, prefijo: 'PIR' }, null)
  agregar(huaylas, '10', 6)
  agregar(pirata, 'M', 2)
  colegio = clientes.crearCliente(
    db,
    { tipo: 'colegio', nombres: 'I.E. Los Girasoles', distrito: 'La Esperanza', responsable: 'Carmen Rojas', dniResponsable: '45678901', telefono: '949111222', ruc: '', direccion: '', observaciones: '' },
    null
  )
  persona = clientes.crearCliente(
    db,
    { tipo: 'persona', tipoDocumento: 'dni', numeroDocumento: '40123456', nombres: 'María Quispe', telefono: '987654321', direccion: '', observaciones: '' },
    null
  )
})

describe('Inicio', () => {
  it('vencidas (con días de retraso y mora estimada), no recogidas, entregas y devoluciones de hoy, próximas', () => {
    const vencido = pedido(persona, ['PIR-001'], '2026-10-25', '2026-10-27', '2026-10-20')
    entregar(vencido, '2026-10-25')
    const noRecogido = pedido(colegio, ['HUM-001'], '2026-10-29', '2026-11-02', '2026-10-20')
    const saleHoy = pedido(colegio, ['HUM-002'], HOY, '2026-11-02', '2026-10-20')
    const vuelveHoy = pedido(persona, ['HUM-003'], '2026-10-28', HOY, '2026-10-20')
    entregar(vuelveHoy, '2026-10-28')
    const en7 = pedido(colegio, ['HUM-004'], '2026-11-06', '2026-11-08', '2026-10-20')
    pedido(colegio, ['HUM-005'], '2026-11-07', '2026-11-08', '2026-10-20') // a 8 días: no es "próxima"

    const d = reportes.datosInicio(db, null, HOY)
    expect(d.vencidas.map((p) => [p.pedidoId, p.diasRetraso, p.moraEstimada, p.faltanDevolver])).toEqual([[vencido, 3, 1500, 1]])
    expect(d.noRecogidas.map((p) => p.pedidoId)).toEqual([noRecogido])
    expect(d.entregasHoy.map((p) => p.pedidoId)).toEqual([saleHoy])
    expect(d.devolucionesHoy.map((p) => p.pedidoId)).toEqual([vuelveHoy])
    expect(d.proximasEntregas.map((p) => p.pedidoId)).toEqual([en7])
  })

  it('un pedido entregado en parte aparece en entregas de hoy con lo que falta entregar', () => {
    const pid = pedido(colegio, ['HUM-001', 'HUM-002'], '2026-10-28', '2026-11-02', '2026-10-20')
    const p = pedidos.obtenerPedido(db, pid)
    entregas.entregar(
      db,
      pid,
      {
        detalleIds: [p.lineas[0].detalleId],
        adelantarSalida: false,
        lavanderiaConfirmada: false,
        pagos: [{ monto: 8000, medio: 'efectivo' }],
        saldoPendienteAutorizado: false,
        garantia: { tipo: 'dni', monto: 0, medio: 'efectivo', documento: '45678901' }
      },
      null,
      null,
      '2026-10-28'
    )
    expect(reportes.datosInicio(db, null, HOY).entregasHoy).toMatchObject([{ pedidoId: pid, faltanEntregar: 1 }])
  })

  it('pendientes: por fecha límite; vencidos y los que vencen en 7 días (el 8.° día ya no)', () => {
    const crear = (limite: string, salida: string) =>
      pedido(colegio, [], salida, salida, '2026-10-20', {
        pendientes: [{ modeloId: huaylas, talla: '12', cantidad: 2, fechaLimite: limite, precioCobrado: 4000, observaciones: '' }]
      })
    crear('2026-11-07', '2026-11-07')
    crear('2026-10-29', '2026-10-31')
    crear('2026-11-06', '2026-11-06')
    const p = reportes.datosInicio(db, null, HOY).pendientes
    expect(p.map((x) => [x.fechaLimite, x.vencido, x.vencePronto])).toEqual([
      ['2026-10-29', true, false],
      ['2026-11-06', false, true],
      ['2026-11-07', false, false]
    ])
  })

  it('lavandería y reparación; liberar varias a la vez', () => {
    disfraces.cambiarEstadoUnidad(db, uid('HUM-001'), 'lavanderia', null)
    disfraces.cambiarEstadoUnidad(db, uid('HUM-002'), 'lavanderia', null)
    disfraces.cambiarEstadoUnidad(db, uid('PIR-001'), 'reparacion', null)
    const d = reportes.datosInicio(db, null, HOY)
    expect(d.enLavanderia.map((u) => u.codigo)).toEqual(['HUM-001', 'HUM-002'])
    expect(d.enReparacion.map((u) => u.codigo)).toEqual(['PIR-001'])
    expect(disfraces.liberarUnidades(db, [uid('HUM-001'), uid('PIR-001')], null)).toEqual(['HUM-001', 'PIR-001'])
    expect(() => disfraces.liberarUnidades(db, [uid('HUM-003')], null)).toThrow(/no está en lavandería ni en reparación/)
    expect(reportes.datosInicio(db, null, HOY).enLavanderia.map((u) => u.codigo)).toEqual(['HUM-002'])
  })

  it('el dinero (ingresos de hoy y garantías en custodia) solo lo ve la dueña', () => {
    const pid = pedido(persona, ['PIR-001'], HOY, '2026-11-01', HOY)
    const antes = ultimoPago()
    entregar(pid, HOY, 5000) // saldo 40 + garantía 50
    fecharPagos(antes, '2026-10-30T16:00:00.000Z')
    const empleado: Sesion = { usuarioId: 2, rol: 'empleado' }
    expect(reportes.datosInicio(db, empleado, HOY).dinero).toBeNull()
    expect(reportes.datosInicio(db, { usuarioId: 1, rol: 'admin' }, HOY).dinero).toEqual({ ingresosHoy: 4000, custodia: 5000 })
  })

  it('clientes que deben, con el documento retenido', () => {
    const pid = pedido(persona, ['PIR-001'], '2026-10-20', '2026-10-22', '2026-10-15')
    const p = pedidos.obtenerPedido(db, pid)
    entregas.entregar(
      db,
      pid,
      {
        detalleIds: [p.lineas[0].detalleId],
        adelantarSalida: false,
        lavanderiaConfirmada: false,
        pagos: [{ monto: 4000, medio: 'efectivo' }],
        saldoPendienteAutorizado: false,
        garantia: { tipo: 'dni', monto: 0, medio: 'efectivo', documento: '40123456' }
      },
      null,
      null,
      '2026-10-20'
    )
    devolverTodo(pid, '2026-10-22', { 'PIR-001': 2500 })
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    expect(reportes.datosInicio(db, null, HOY).deudas).toEqual([
      { clienteId: persona, clienteNombre: 'María Quispe', telefono: '987654321', monto: 2500, pedidos: [pid], documentoRetenido: '40123456' }
    ])
  })
})

describe('reporte de ingresos', () => {
  it('separa alquiler, adelantos retenidos, mora y daños; garantía fuera; por cobrar aparte', () => {
    // Pedido normal (2 × S/ 40): adelanto 20, saldo 60, garantía 100; vuelve 2 días tarde
    // (mora por unidad: 2 unidades × 2 días × S/ 5 = 20) con un daño de 25, cubiertos con la garantía
    let antes = ultimoPago()
    const pid = pedido(colegio, ['HUM-001', 'HUM-002'], '2026-10-10', '2026-10-12', '2026-10-01', { adelanto: { monto: 2000, medio: 'yape' } })
    fecharPagos(antes, '2026-10-01T15:00:00.000Z')
    antes = ultimoPago()
    entregar(pid, '2026-10-10', 10000)
    fecharPagos(antes, '2026-10-10T15:00:00.000Z')
    devolverTodo(pid, '2026-10-14', { 'HUM-001': 2500 })
    antes = ultimoPago()
    entregas.liquidar(db, pid, { cobros: [], medioDevolucion: 'efectivo' }, null)
    fecharPagos(antes, '2026-10-14T15:00:00.000Z')

    // Pedido cancelado: adelanto 40, se devuelven 20 -> retenido 20
    antes = ultimoPago()
    const cancelado = pedido(persona, ['PIR-001'], '2026-10-25', '2026-10-26', '2026-10-05', { adelanto: { monto: 4000, medio: 'efectivo' } })
    fecharPagos(antes, '2026-10-05T15:00:00.000Z')
    antes = ultimoPago()
    pedidos.cancelarPedido(db, cancelado, { tipo: 'devolver_parte', monto: 2000, medio: 'efectivo' }, null)
    fecharPagos(antes, '2026-10-20T15:00:00.000Z')

    const r = reportes.reporteIngresos(db, { desde: '2026-10-01', hasta: '2026-10-31' })
    expect(r.totales).toEqual({ clave: 'total', alquiler: 8000, retenido: 2000, mora: 2000, danos: 2500, total: 14500 })
    expect(r.porDia.map((d) => [d.clave, d.total])).toEqual([
      ['2026-10-01', 2000],
      ['2026-10-05', 4000],
      ['2026-10-10', 6000],
      ['2026-10-14', 4500],
      ['2026-10-20', -2000]
    ])
    expect(r.porMes).toHaveLength(1)
    expect(r.porCobrar).toBe(0)

    const m = reportes.reporteMedios(db, { desde: '2026-10-01', hasta: '2026-10-31' })
    expect(m.totalCustodia).toBe(0) // la garantía se liquidó
    const efectivo = m.medios.find((x) => x.medio === 'efectivo')!
    // Entradas: garantía 100 + adelanto del cancelado 40. Salidas: garantía devuelta 55 + devolución 20.
    expect(efectivo).toEqual({ medio: 'efectivo', entradas: 14000, salidas: 7500, neto: 6500 })
    expect(m.medios.find((x) => x.medio === 'yape')).toMatchObject({ entradas: 8000, salidas: 0 })
  })

  it('garantías en custodia: las de pedidos entregados que aún no se liquidaron, por pedido', () => {
    const a = pedido(persona, ['PIR-001'], HOY, '2026-11-01', HOY)
    entregar(a, HOY, 5000)
    const b = pedido(colegio, ['HUM-001'], HOY, '2026-11-01', HOY)
    entregar(b, HOY, 8000)
    const m = reportes.reporteMedios(db, { desde: HOY, hasta: HOY })
    expect(m.custodia.map((g) => [g.pedidoId, g.monto, g.estado])).toEqual([
      [a, 5000, 'entregado'],
      [b, 8000, 'entregado']
    ])
    expect(m.totalCustodia).toBe(13000)
  })
})

describe('otros reportes', () => {
  it('disfraces fuera ahora y cuándo vuelven', () => {
    const pid = pedido(persona, ['PIR-001', 'PIR-002'], '2026-10-25', '2026-10-27', '2026-10-20')
    entregar(pid, '2026-10-25')
    expect(reportes.disfracesFuera(db, HOY)).toEqual([
      { pedidoId: pid, clienteNombre: 'María Quispe', telefono: '987654321', fechaDevolucionPactada: '2026-10-27', diasRetraso: 3, codigos: ['PIR-001', 'PIR-002'] }
    ])
  })

  it('más alquilados: sin cancelados, con filtros de región y evento', () => {
    pedido(colegio, ['HUM-001', 'HUM-002', 'HUM-003'], '2026-10-10', '2026-10-12', '2026-10-01')
    pedido(persona, ['PIR-001'], '2026-10-15', '2026-10-16', '2026-10-01', { evento: 'Primavera' })
    const c = pedido(persona, ['HUM-004', 'HUM-005', 'HUM-006', 'PIR-002'], '2026-10-20', '2026-10-21', '2026-10-01')
    pedidos.cancelarPedido(db, c, { tipo: 'retener' }, null)
    const oct = { desde: '2026-10-01', hasta: '2026-10-31' }
    expect(reportes.masAlquilados(db, oct).map((f) => [f.modeloNombre, f.veces, f.ingreso])).toEqual([
      ['Huaylas mujer', 3, 12000],
      ['Pirata', 1, 4000]
    ])
    expect(reportes.masAlquilados(db, oct, 'sierra').map((f) => f.modeloNombre)).toEqual(['Huaylas mujer'])
    expect(reportes.masAlquilados(db, oct, '', 'Primavera').map((f) => f.modeloNombre)).toEqual(['Pirata'])
  })

  it('por colegio y por evento (incluye lo que falta confeccionar)', () => {
    pedido(colegio, ['HUM-001', 'HUM-002'], '2026-10-10', '2026-10-12', '2026-10-01', {
      pendientes: [{ modeloId: huaylas, talla: '10', cantidad: 3, fechaLimite: '2026-10-08', precioCobrado: 4000, observaciones: '' }]
    })
    pedido(persona, ['PIR-001'], '2026-10-15', '2026-10-16', '2026-10-01', { evento: 'Primavera' })
    const oct = { desde: '2026-10-01', hasta: '2026-10-31' }
    expect(reportes.alquileresAgrupados(db, oct, 'colegio')).toEqual([{ clave: 'I.E. Los Girasoles', clienteId: colegio, pedidos: 1, disfraces: 5, total: 20000 }])
    expect(reportes.alquileresAgrupados(db, oct, 'evento').map((f) => [f.clave, f.disfraces])).toEqual([
      ['Aniversario del colegio', 5],
      ['Primavera', 1]
    ])
  })

  it('confección: sumado por modelo y talla, con detalle por pedido', () => {
    const pend = (cantidad: number, limite: string) => ({ modeloId: huaylas, talla: '12', cantidad, fechaLimite: limite, precioCobrado: 4000, observaciones: '' })
    pedido(colegio, [], '2026-11-10', '2026-11-12', '2026-10-01', { pendientes: [pend(3, '2026-11-08')] })
    pedido(persona, [], '2026-11-05', '2026-11-06', '2026-10-01', { pendientes: [pend(2, '2026-11-03')] })
    const [fila] = reportes.confeccion(db)
    expect(fila).toMatchObject({ modeloNombre: 'Huaylas mujer', talla: '12', faltan: 5, fechaLimiteMasCercana: '2026-11-03' })
    expect(fila.detalle.map((d) => d.faltan)).toEqual([2, 3])
  })

  it('calendario de ocupación del mes', () => {
    pedido(colegio, ['HUM-001', 'HUM-002'], '2026-11-10', '2026-11-12', HOY)
    const c = reportes.calendarioOcupacion(db, huaylas, '2026-11', HOY)
    expect(c.dias).toHaveLength(30)
    const t10 = c.tallas[0]
    expect(t10.total).toBe(6)
    expect(t10.libres[8]).toBe(6) // 09/11
    expect(t10.libres[9]).toBe(4) // 10/11
    expect(t10.libres[12]).toBe(4) // 13/11: día de lavado
    expect(t10.libres[13]).toBe(6) // 14/11
  })

  it('descuentos y moras rebajadas', () => {
    const pid = pedido(persona, ['PIR-001'], '2026-10-10', '2026-10-11', '2026-10-01')
    pedidos.actualizarPedido(db, pid, {
      clienteId: persona, fechaSalida: '2026-10-10', fechaDevolucionPactada: '2026-10-11', evento: 'Otro', gradoSeccion: '', observaciones: '',
      garantiaTipo: 'efectivo', garantiaMonto: 0, lineas: [{ unidadId: uid('PIR-001'), precioCobrado: 2500 }], pendientes: [], adelanto: null
    }, null, '2026-10-01')
    entregar(pid, '2026-10-10')
    devolverTodo(pid, '2026-10-13')
    const cargo = pedidos.obtenerPedido(db, pid).cargos[0]
    entregas.rebajarMora(db, cargo.id, 0, 'cliente frecuente', null)
    const r = reportes.descuentos(db, { desde: '2026-10-01', hasta: '2026-10-31' })
    expect(r.pedidos).toEqual([{ pedidoId: pid, clienteNombre: 'María Quispe', fechaSalida: '2026-10-10', original: 3000, cobrado: 2500, descuento: 500 }])
    expect(r.moras).toMatchObject([{ pedidoId: pid, original: 1000, cobrado: 0, motivo: 'cliente frecuente' }])
  })
})
