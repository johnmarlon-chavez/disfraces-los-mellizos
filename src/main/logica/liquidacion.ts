// Estado de cuenta de un pedido y liquidación de la garantía. Funciones puras, montos en céntimos.
//
// Deuda del pedido, por concepto:
//   saldo  = total del alquiler − (adelantos − devoluciones de adelanto + pagos de saldo)
//   daños  = cargos por daños y piezas faltantes − pagos de daños
//   mora   = cargos de mora − pagos de mora
// La garantía en efectivo cubre la deuda en este orden: saldo, daños y faltantes, mora.
// Lo que sobra se devuelve; si no alcanza, "falta cobrar". La garantía nunca es ingreso:
// lo que se retiene se registra como pago del concepto que cubre.
import type { DeudaPorConcepto, PlanLiquidacion } from '../../shared/liquidacion'
import type { TipoGarantia } from '../../shared/pedidos'
import { formatearSoles } from '../../shared/formato'
import { ErrorDeNegocio } from '../errores'

export interface EstadoCuenta {
  totalAlquiler: number
  /** adelantos − devoluciones de adelanto + pagos de saldo. */
  pagadoAlquiler: number
  cargosDanos: number
  cargosMora: number
  pagadoDanos: number
  pagadoMora: number
  garantia: {
    tipo: TipoGarantia | null
    /** Pagos garantia_recibida. */
    recibida: number
    /** Pagos garantia_devuelta. */
    devuelta: number
    /** Pagos tomados de la garantía (desde_garantia). */
    retenida: number
    /** El DNI ya se devolvió / la garantía ya se liquidó. */
    cerrada: boolean
  }
}

const ORDEN = ['saldo', 'danos', 'mora'] as const

export function calcularDeuda(c: EstadoCuenta): DeudaPorConcepto & { aFavor: number } {
  const saldo = Math.max(0, c.totalAlquiler - c.pagadoAlquiler)
  const danos = Math.max(0, c.cargosDanos - c.pagadoDanos)
  const mora = Math.max(0, c.cargosMora - c.pagadoMora)
  return { saldo, danos, mora, total: saldo + danos + mora, aFavor: Math.max(0, c.pagadoAlquiler - c.totalAlquiler) }
}

/** Reparte un monto entre los conceptos de la deuda, en orden: saldo, daños, mora. */
export function repartir(monto: number, deuda: DeudaPorConcepto): DeudaPorConcepto & { sobrante: number } {
  let resto = monto
  const r = { saldo: 0, danos: 0, mora: 0 }
  for (const k of ORDEN) {
    r[k] = Math.min(resto, deuda[k])
    resto -= r[k]
  }
  return { ...r, total: monto - resto, sobrante: resto }
}

export function planLiquidacion(c: EstadoCuenta): PlanLiquidacion {
  const deuda = calcularDeuda(c)
  const disponible =
    c.garantia.tipo === 'efectivo' && !c.garantia.cerrada
      ? Math.max(0, c.garantia.recibida - c.garantia.devuelta - c.garantia.retenida)
      : 0
  const r = repartir(disponible, deuda)
  const retener = { saldo: r.saldo, danos: r.danos, mora: r.mora, total: r.total }
  const faltaCobrar = {
    saldo: deuda.saldo - r.saldo,
    danos: deuda.danos - r.danos,
    mora: deuda.mora - r.mora,
    total: deuda.total - r.total
  }
  let dni: PlanLiquidacion['dni'] = null
  if (c.garantia.tipo === 'dni' && !c.garantia.cerrada) dni = faltaCobrar.total > 0 ? 'retener' : 'devolver'
  return {
    deuda: { saldo: deuda.saldo, danos: deuda.danos, mora: deuda.mora, total: deuda.total },
    aFavor: deuda.aFavor,
    garantiaDisponible: disponible,
    retener,
    devolverGarantia: disponible - r.total,
    faltaCobrar,
    dni
  }
}

/** Un pago de deuda: se reparte por concepto; no puede pasar de lo que se debe. */
export function repartirPagoDeDeuda(monto: number, deuda: DeudaPorConcepto): DeudaPorConcepto {
  if (!Number.isSafeInteger(monto) || monto <= 0) throw new ErrorDeNegocio('El monto a cobrar debe ser mayor que cero.')
  const r = repartir(monto, deuda)
  if (r.sobrante > 0) {
    throw new ErrorDeNegocio(`El cliente debe ${formatearSoles(deuda.total)}: no se puede cobrar ${formatearSoles(monto)}.`)
  }
  return { saldo: r.saldo, danos: r.danos, mora: r.mora, total: r.total }
}
