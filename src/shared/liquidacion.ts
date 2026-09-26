// Tipos de la liquidación de un pedido (compartidos por main y renderer). Montos en céntimos.

export interface DeudaPorConcepto {
  saldo: number
  /** Daños y piezas faltantes. */
  danos: number
  mora: number
  total: number
}

export interface PlanLiquidacion {
  deuda: DeudaPorConcepto
  /** El cliente pagó de más por el alquiler (por ejemplo, se cancelaron unidades que nunca se entregaron). */
  aFavor: number
  /** Garantía en efectivo que todavía está en la tienda. */
  garantiaDisponible: number
  /** Lo que se toma de la garantía para cubrir la deuda. */
  retener: DeudaPorConcepto
  /** Lo que se le devuelve de la garantía. */
  devolverGarantia: number
  faltaCobrar: DeudaPorConcepto
  /** DNI en prenda: devolverlo (no debe nada) o retenerlo hasta que pague. */
  dni: 'devolver' | 'retener' | null
}
