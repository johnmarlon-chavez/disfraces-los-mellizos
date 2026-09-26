// Entrega y devolución por unidad (compartido por main y renderer). Montos en céntimos.
import type { PlanLiquidacion } from './liquidacion'
import type { MedioPago, TipoGarantia } from './pedidos'

export interface DatosEntrega {
  /** Líneas del pedido que salen ahora (el resto se entrega después). */
  detalleIds: number[]
  /** Solo si la salida es posterior a hoy: entregar hoy adelantando la salida. */
  adelantarSalida: boolean
  /** Unidades en lavandería: la usuaria confirma que ya están limpias. */
  lavanderiaConfirmada: boolean
  /** Solo en la primera entrega. */
  pagos: { monto: number; medio: MedioPago }[]
  saldoPendienteAutorizado: boolean
  garantia: { tipo: TipoGarantia; monto: number; medio: MedioPago; documento: string } | null
}

export interface ResultadoEntrega {
  entregadas: string[]
  faltanEntregar: number
}

export interface UnidadADevolver {
  detalleId: number
  /** Piezas que no volvieron, con el monto a cobrar (por defecto, su costo de reposición). */
  piezasFaltantes: { piezaId: number; monto: number }[]
  dano: { monto: number; descripcion: string } | null
  destino: 'lavanderia' | 'reparacion'
  observaciones: string
}

export interface DatosDevolucion {
  /** Fecha en que volvieron (por defecto hoy; nunca antes de la entrega ni en el futuro). */
  fecha: string
  unidades: UnidadADevolver[]
}

export interface CargoPrevisto {
  tipo: 'mora' | 'dano' | 'pieza_faltante'
  codigo: string | null
  monto: number
  descripcion: string
}

export interface PrevisualizacionDevolucion {
  cargos: CargoPrevisto[]
  /** Con esta devolución no queda nada por devolver ni por entregar: sigue la liquidación. */
  completa: boolean
  faltanDevolver: number
  plan: PlanLiquidacion | null
}

export interface ResultadoDevolucion {
  devueltas: string[]
  faltanDevolver: number
  listoParaLiquidar: boolean
}

export interface DatosLiquidacion {
  /** Lo que el cliente paga en el momento (puede ser menos que lo que falta: queda como deuda). */
  cobros: { monto: number; medio: MedioPago }[]
  /** Cómo se le devuelve la garantía sobrante o lo que pagó de más. */
  medioDevolucion: MedioPago
}

export interface CargoPedido {
  id: number
  tipo: 'mora' | 'dano' | 'pieza_faltante'
  codigo: string | null
  monto: number
  montoOriginal: number
  motivoRebaja: string
  descripcion: string
}

export interface CuentaPedido {
  plan: PlanLiquidacion
  /** Unidades que faltan entregar (asignadas sin entregar + por confeccionar). */
  faltanEntregar: number
  faltanDevolver: number
  totalUnidades: number
  listoParaLiquidar: boolean
  garantiaDocumento: string | null
  garantiaCerrada: boolean
}
