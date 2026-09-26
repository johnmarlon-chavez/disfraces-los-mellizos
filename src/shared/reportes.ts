// Tipos de Inicio y reportes (compartidos por main y renderer). Montos en céntimos, fechas "aaaa-mm-dd".
import type { TipoCliente } from './clientes'
import type { EstadoFisico, Region } from './disfraces'
import type { EstadoPedido, EstadoPendiente, MedioPago } from './pedidos'

/** Período inclusivo, en fechas de Lima. */
export interface Periodo {
  desde: string
  hasta: string
}

export type CategoriaIngreso = 'alquiler' | 'retenido' | 'mora' | 'danos'

export const NOMBRE_CATEGORIA: Record<CategoriaIngreso, string> = {
  alquiler: 'Alquiler',
  retenido: 'Adelantos retenidos',
  mora: 'Mora',
  danos: 'Daños y faltantes'
}

export interface FilaIngresos {
  /** "aaaa-mm-dd" (por día) o "aaaa-mm" (por mes). */
  clave: string
  alquiler: number
  retenido: number
  mora: number
  danos: number
  total: number
}

export interface ReporteIngresos {
  porDia: FilaIngresos[]
  porMes: FilaIngresos[]
  totales: FilaIngresos
  /** Deudas de pedidos cerrados: no son ingreso hasta que se paguen. */
  porCobrar: number
}

export interface MovimientoMedio {
  medio: MedioPago
  entradas: number
  salidas: number
  neto: number
}

export interface GarantiaEnCustodia {
  pedidoId: number
  clienteNombre: string
  estado: EstadoPedido
  medio: MedioPago
  monto: number
}

export interface ReporteMedios {
  medios: MovimientoMedio[]
  /** Garantías en dinero recibidas que todavía no se devolvieron ni se usaron (hoy, no del período). */
  custodia: GarantiaEnCustodia[]
  totalCustodia: number
}

// ---------- Inicio ----------

export interface PedidoInicio {
  pedidoId: number
  clienteNombre: string
  clienteTipo: TipoCliente
  telefono: string
  evento: string
  fechaSalida: string
  fechaDevolucionPactada: string
  unidades: number
  faltanEntregar: number
  faltanDevolver: number
  diasRetraso: number
  /** Mora si devolviera hoy lo que falta (estimada con la configuración actual). */
  moraEstimada: number
}

export interface PendienteInicio {
  id: number
  pedidoId: number
  clienteNombre: string
  modeloNombre: string
  talla: string
  faltan: number
  fechaLimite: string
  estado: EstadoPendiente
  vencido: boolean
  vencePronto: boolean
}

export interface UnidadInicio {
  id: number
  codigo: string
  modeloNombre: string
  talla: string
  estadoFisico: EstadoFisico
  observaciones: string
}

export interface DeudaInicio {
  clienteId: number
  clienteNombre: string
  telefono: string
  monto: number
  pedidos: number[]
  documentoRetenido: string | null
}

export interface DatosInicio {
  hoy: string
  vencidas: PedidoInicio[]
  noRecogidas: PedidoInicio[]
  entregasHoy: PedidoInicio[]
  devolucionesHoy: PedidoInicio[]
  pendientes: PendienteInicio[]
  enLavanderia: UnidadInicio[]
  enReparacion: UnidadInicio[]
  proximasEntregas: PedidoInicio[]
  deudas: DeudaInicio[]
  /** Solo para la dueña (null para Trabajadores). */
  dinero: { ingresosHoy: number; custodia: number } | null
}

// ---------- Otros reportes ----------

export interface PedidoFuera {
  pedidoId: number
  clienteNombre: string
  telefono: string
  fechaDevolucionPactada: string
  diasRetraso: number
  codigos: string[]
}

export interface FilaMasAlquilado {
  modeloId: number
  modeloNombre: string
  region: Region | null
  veces: number
  pedidos: number
  ingreso: number
}

export interface FilaAgrupada {
  clave: string
  /** Solo en "por colegio". */
  clienteId?: number
  pedidos: number
  disfraces: number
  total: number
}

export interface FilaConfeccion {
  modeloId: number
  modeloNombre: string
  talla: string
  faltan: number
  fechaLimiteMasCercana: string
  detalle: { pedidoId: number; clienteNombre: string; faltan: number; fechaLimite: string; estado: EstadoPendiente }[]
}

export interface CalendarioOcupacion {
  modeloNombre: string
  dias: string[]
  tallas: { talla: string; total: number; libres: number[] }[]
}

export interface PedidoConDescuento {
  pedidoId: number
  clienteNombre: string
  fechaSalida: string
  original: number
  cobrado: number
  descuento: number
}

export interface MoraRebajada {
  pedidoId: number
  clienteNombre: string
  descripcion: string
  original: number
  cobrado: number
  motivo: string
}
