import { describe, expect, it } from 'vitest'
import {
  agruparIngresos,
  clasificarPago,
  enCustodia,
  fechaEnLima,
  movimientosPorMedio,
  ocupacionPorDia,
  type PagoParaReporte
} from '../../src/main/logica/reportes'
import { motivoNoDisponible, type Ocupacion, type UnidadConOcupaciones } from '../../src/main/logica/disponibilidad'
import type { ConceptoPago } from '../../src/shared/pedidos'
import { sumarDias } from '../../src/shared/fechas'

const OCT = { desde: '2026-10-01', hasta: '2026-10-31' }

function pago(concepto: ConceptoPago, monto: number, fecha = '2026-10-15T15:00:00.000Z', extra: Partial<PagoParaReporte> = {}): PagoParaReporte {
  return { fecha, concepto, monto, medio: 'efectivo', desdeGarantia: false, pedidoCancelado: false, ...extra }
}

describe('fecha en Lima', () => {
  it('un pago a las 8 p. m. de Lima es de ese día aunque en UTC ya sea el siguiente', () => {
    expect(fechaEnLima('2026-10-16T01:00:00.000Z')).toBe('2026-10-15')
    expect(fechaEnLima('2026-10-16T05:00:00.000Z')).toBe('2026-10-16')
  })

  it('el límite de mes también se cuenta en hora de Lima', () => {
    const r = agruparIngresos([pago('saldo', 1000, '2026-11-01T03:00:00.000Z')], { desde: '2026-10-01', hasta: '2026-11-30' })
    expect(r.porMes.map((m) => m.clave)).toEqual(['2026-10'])
  })
})

describe('clasificación de pagos', () => {
  it.each([
    ['adelanto', false, 'alquiler', 1000],
    ['saldo', false, 'alquiler', 1000],
    ['devolucion_adelanto', false, 'alquiler', -1000],
    ['adelanto', true, 'retenido', 1000],
    ['devolucion_adelanto', true, 'retenido', -1000],
    ['mora', false, 'mora', 1000],
    ['dano', false, 'danos', 1000]
  ] as const)('%s (pedido cancelado: %s) -> %s %i', (concepto, cancelado, categoria, monto) => {
    expect(clasificarPago({ concepto, monto: 1000, pedidoCancelado: cancelado })).toEqual({ categoria, monto })
  })

  it('la garantía nunca es ingreso', () => {
    expect(clasificarPago({ concepto: 'garantia_recibida', monto: 5000, pedidoCancelado: false })).toBeNull()
    expect(clasificarPago({ concepto: 'garantia_devuelta', monto: 5000, pedidoCancelado: false })).toBeNull()
  })
})

describe('ingresos por día y por mes', () => {
  it('lo tomado de la garantía cuenta como ingreso de su concepto', () => {
    const r = agruparIngresos(
      [pago('garantia_recibida', 5000), pago('dano', 1200, undefined, { desdeGarantia: true }), pago('garantia_devuelta', 3800)],
      OCT
    )
    expect(r.totales).toMatchObject({ danos: 1200, total: 1200 })
  })

  it('adelanto retenido de un cancelado, con devolución parcial', () => {
    const r = agruparIngresos(
      [
        pago('adelanto', 6000, '2026-10-05T15:00:00.000Z', { pedidoCancelado: true }),
        pago('devolucion_adelanto', 2000, '2026-10-20T15:00:00.000Z', { pedidoCancelado: true })
      ],
      OCT
    )
    expect(r.totales).toMatchObject({ retenido: 4000, alquiler: 0, total: 4000 })
    expect(r.porDia.map((d) => [d.clave, d.retenido])).toEqual([
      ['2026-10-05', 6000],
      ['2026-10-20', -2000]
    ])
  })

  it('lo pagado de más que se devuelve al cerrar resta del alquiler', () => {
    const r = agruparIngresos([pago('adelanto', 8000), pago('devolucion_adelanto', 1000)], OCT)
    expect(r.totales.alquiler).toBe(7000)
  })

  it('solo el período elegido', () => {
    const r = agruparIngresos([pago('saldo', 1000, '2026-09-30T15:00:00.000Z'), pago('saldo', 500)], OCT)
    expect(r.totales.total).toBe(500)
  })

  it('prueba aleatoria: el total es adelantos + saldos + moras + daños − devoluciones de adelanto', () => {
    let semilla = 5
    const azar = (n: number) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), semilla % n)
    const conceptos: ConceptoPago[] = ['adelanto', 'saldo', 'mora', 'dano', 'garantia_recibida', 'garantia_devuelta', 'devolucion_adelanto']
    for (let caso = 0; caso < 200; caso++) {
      const pagos = Array.from({ length: 1 + azar(20) }, () =>
        pago(conceptos[azar(conceptos.length)], 1 + azar(50000), `2026-10-${String(1 + azar(28)).padStart(2, '0')}T${String(azar(24)).padStart(2, '0')}:00:00.000Z`, {
          pedidoCancelado: azar(4) === 0,
          desdeGarantia: azar(5) === 0
        })
      )
      const r = agruparIngresos(pagos, { desde: '2026-09-30', hasta: '2026-10-31' })
      const esperado = pagos.reduce(
        (s, p) =>
          s + (['adelanto', 'saldo', 'mora', 'dano'].includes(p.concepto) ? p.monto : p.concepto === 'devolucion_adelanto' ? -p.monto : 0),
        0
      )
      expect(r.totales.total).toBe(esperado)
      expect(r.totales.alquiler + r.totales.retenido + r.totales.mora + r.totales.danos).toBe(r.totales.total)
      expect(r.porDia.reduce((s, d) => s + d.total, 0)).toBe(r.totales.total)
      expect(r.porMes.reduce((s, d) => s + d.total, 0)).toBe(r.totales.total)
    }
  })
})

describe('movimientos por medio de pago y custodia', () => {
  it('entradas y salidas reales; lo tomado de la garantía no es una entrada nueva', () => {
    const m = movimientosPorMedio(
      [
        pago('adelanto', 3000, undefined, { medio: 'yape' }),
        pago('garantia_recibida', 5000),
        pago('dano', 1200, undefined, { desdeGarantia: true }),
        pago('garantia_devuelta', 3800),
        pago('devolucion_adelanto', 500, undefined, { medio: 'yape' })
      ],
      OCT
    )
    expect(m.find((x) => x.medio === 'efectivo')).toEqual({ medio: 'efectivo', entradas: 5000, salidas: 3800, neto: 1200 })
    expect(m.find((x) => x.medio === 'yape')).toEqual({ medio: 'yape', entradas: 3000, salidas: 500, neto: 2500 })
  })

  it('custodia: recibida − devuelta − usada para cubrir deudas', () => {
    expect(enCustodia([pago('garantia_recibida', 5000)])).toBe(5000)
    expect(enCustodia([pago('garantia_recibida', 5000), pago('dano', 1200, undefined, { desdeGarantia: true }), pago('garantia_devuelta', 3800)])).toBe(0)
    expect(enCustodia([pago('garantia_recibida', 5000), pago('dano', 1200)])).toBe(5000) // pago aparte, no de la garantía
  })
})

describe('calendario de ocupación', () => {
  const oc = (salida: string, pactada: string, estado: Ocupacion['estado'] = 'reservado'): Ocupacion => ({
    alquilerId: 1,
    clienteNombre: 'X',
    estado,
    fechaSalida: salida,
    fechaDevolucionPactada: pactada
  })
  const u = (id: number, talla: string, ocupaciones: Ocupacion[] = [], estadoFisico: UnidadConOcupaciones['estadoFisico'] = 'disponible'): UnidadConOcupaciones => ({
    id,
    codigo: `U-${id}`,
    modeloId: 1,
    talla,
    estadoFisico,
    ocupaciones
  })

  it('cuenta libres por día y talla con la regla de disponibilidad (margen, reparación, baja, vencido)', () => {
    const dias = ['2026-10-27', '2026-10-28', '2026-10-31', '2026-11-01', '2026-11-02']
    const r = ocupacionPorDia(
      [
        u(1, '10', [oc('2026-10-28', '2026-10-31')]),
        u(2, '10'),
        u(3, '10', [], 'reparacion'),
        u(4, '10', [], 'baja'),
        u(5, 'M', [oc('2026-10-20', '2026-10-25', 'entregado')]) // vencido: hoy es 30/10
      ],
      dias,
      1,
      '2026-10-30'
    )
    expect(r).toEqual([
      { talla: '10', total: 3, libres: [2, 1, 1, 1, 2] },
      { talla: 'M', total: 1, libres: [0, 0, 0, 1, 1] } // vencido: ocupado hasta hoy (30/10) + 1 de margen
    ])
  })

  it('coincide día por día con la regla de disponibilidad (casos al azar)', () => {
    let semilla = 11
    const azar = (n: number) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), semilla % n)
    const base = '2026-12-01'
    const dias = Array.from({ length: 31 }, (_, i) => sumarDias(base, i))
    for (let caso = 0; caso < 30; caso++) {
      const unidades = Array.from({ length: 1 + azar(6) }, (_, i) =>
        u(
          i,
          '10',
          Array.from({ length: azar(3) }, () => {
            const s = sumarDias(base, azar(31))
            return oc(s, sumarDias(s, azar(5)), azar(3) === 0 ? 'entregado' : 'reservado')
          }),
          azar(8) === 0 ? 'reparacion' : 'disponible'
        )
      )
      const hoy = sumarDias(base, azar(31))
      const margen = azar(3)
      const [fila] = ocupacionPorDia(unidades, dias, margen, hoy)
      dias.forEach((d, i) => {
        const esperado = unidades.filter((x) => motivoNoDisponible(x, { inicio: d, fin: d }, margen, hoy) === null).length
        expect(fila.libres[i]).toBe(esperado)
      })
    }
  })
})
