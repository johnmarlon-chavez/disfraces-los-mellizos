// Cálculos de reportes. Funciones puras.
//
// Ingresos: por la fecha en que entró el dinero (en hora de Lima). Así el total de un mes pasado
// nunca cambia. Categorías:
//   alquiler  = adelantos + saldos − lo devuelto de ellos, de pedidos no cancelados
//   retenido  = adelantos de pedidos cancelados − lo que se les devolvió
//   mora, daños (incluye piezas faltantes)
// La garantía nunca es ingreso (ni lo recibido ni lo devuelto). Lo que se toma de la garantía al
// cerrar un pedido sí es ingreso de su concepto (son pagos de saldo, daños o mora).
// Si un pedido se cancela después, sus adelantos pasan de "alquiler" a "retenido" en la fecha en
// que se pagaron: cambia la categoría, no el total del mes.
import { mismaTalla, ordenarTallas } from '../../shared/disfraces'
import { hoyEnLima } from '../../shared/formato'
import type { ConceptoPago, MedioPago } from '../../shared/pedidos'
import { MEDIOS_PAGO } from '../../shared/pedidos'
import type { CategoriaIngreso, FilaIngresos, MovimientoMedio, Periodo } from '../../shared/reportes'
import { motivoNoDisponible, type UnidadConOcupaciones } from './disponibilidad'

export interface PagoParaReporte {
  /** Instante ISO en UTC, como se guarda. */
  fecha: string
  concepto: ConceptoPago
  monto: number
  medio: MedioPago
  desdeGarantia: boolean
  pedidoCancelado: boolean
}

/** Fecha de Lima de un instante guardado en UTC: un pago a las 8 p. m. de Lima es de ese día. */
export function fechaEnLima(isoUtc: string): string {
  return hoyEnLima(new Date(isoUtc))
}

export function enPeriodo(fecha: string, p: Periodo): boolean {
  return fecha >= p.desde && fecha <= p.hasta
}

/** Categoría de ingreso y monto con signo; null si no es ingreso (garantías). */
export function clasificarPago(p: Pick<PagoParaReporte, 'concepto' | 'monto' | 'pedidoCancelado'>): {
  categoria: CategoriaIngreso
  monto: number
} | null {
  switch (p.concepto) {
    case 'adelanto':
      return { categoria: p.pedidoCancelado ? 'retenido' : 'alquiler', monto: p.monto }
    case 'devolucion_adelanto':
      return { categoria: p.pedidoCancelado ? 'retenido' : 'alquiler', monto: -p.monto }
    case 'saldo':
      return { categoria: 'alquiler', monto: p.monto }
    case 'mora':
      return { categoria: 'mora', monto: p.monto }
    case 'dano':
      return { categoria: 'danos', monto: p.monto }
    case 'garantia_recibida':
    case 'garantia_devuelta':
      return null
  }
}

function filaVacia(clave: string): FilaIngresos {
  return { clave, alquiler: 0, retenido: 0, mora: 0, danos: 0, total: 0 }
}

export function agruparIngresos(
  pagos: PagoParaReporte[],
  periodo: Periodo
): { porDia: FilaIngresos[]; porMes: FilaIngresos[]; totales: FilaIngresos } {
  const dias = new Map<string, FilaIngresos>()
  const meses = new Map<string, FilaIngresos>()
  const totales = filaVacia('total')
  for (const p of pagos) {
    const fecha = fechaEnLima(p.fecha)
    if (!enPeriodo(fecha, periodo)) continue
    const c = clasificarPago(p)
    if (!c) continue
    for (const [mapa, clave] of [
      [dias, fecha],
      [meses, fecha.slice(0, 7)]
    ] as const) {
      const fila = mapa.get(clave) ?? filaVacia(clave)
      fila[c.categoria] += c.monto
      fila.total += c.monto
      mapa.set(clave, fila)
    }
    totales[c.categoria] += c.monto
    totales.total += c.monto
  }
  const orden = (a: FilaIngresos, b: FilaIngresos): number => a.clave.localeCompare(b.clave)
  return { porDia: [...dias.values()].sort(orden), porMes: [...meses.values()].sort(orden), totales }
}

/**
 * Dinero que realmente entró y salió por cada medio de pago (para cuadrar caja).
 * Entradas: adelantos, saldos, moras, daños y garantías recibidas. No cuenta lo tomado de la
 * garantía al cerrar (ese dinero ya había entrado como garantía). Salidas: garantías devueltas
 * y devoluciones de adelanto.
 */
export function movimientosPorMedio(pagos: PagoParaReporte[], periodo: Periodo): MovimientoMedio[] {
  const por = new Map<MedioPago, MovimientoMedio>(MEDIOS_PAGO.map((m) => [m, { medio: m, entradas: 0, salidas: 0, neto: 0 }]))
  for (const p of pagos) {
    if (!enPeriodo(fechaEnLima(p.fecha), periodo) || p.desdeGarantia) continue
    const fila = por.get(p.medio)!
    if (p.concepto === 'garantia_devuelta' || p.concepto === 'devolucion_adelanto') fila.salidas += p.monto
    else fila.entradas += p.monto
    fila.neto = fila.entradas - fila.salidas
  }
  return [...por.values()]
}

/** Garantía en dinero que sigue en la tienda: recibida − devuelta − usada para cubrir deudas. */
export function enCustodia(pagos: Pick<PagoParaReporte, 'concepto' | 'monto' | 'desdeGarantia'>[]): number {
  let custodia = 0
  for (const p of pagos) {
    if (p.concepto === 'garantia_recibida') custodia += p.monto
    else if (p.concepto === 'garantia_devuelta') custodia -= p.monto
    else if (p.desdeGarantia) custodia -= p.monto
  }
  return Math.max(0, custodia)
}

/**
 * Libres por día y talla de un modelo, con la misma regla de disponibilidad que los pedidos:
 * así el calendario y la pantalla del pedido nunca se contradicen. Las unidades de baja no cuentan.
 */
export function ocupacionPorDia(
  unidades: UnidadConOcupaciones[],
  dias: string[],
  margen: number,
  hoy: string
): { talla: string; total: number; libres: number[] }[] {
  const activas = unidades.filter((u) => u.estadoFisico !== 'baja')
  return ordenarTallas(activas.map((u) => u.talla)).map((talla) => {
    const deLaTalla = activas.filter((u) => mismaTalla(u.talla, talla))
    return {
      talla,
      total: deLaTalla.length,
      libres: dias.map((d) => deLaTalla.filter((u) => motivoNoDisponible(u, { inicio: d, fin: d }, margen, hoy) === null).length)
    }
  })
}
