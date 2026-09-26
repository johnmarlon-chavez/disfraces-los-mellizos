// Tipos de pedidos (alquileres) compartidos por main y renderer. Montos en céntimos.
import type { TipoCliente } from './clientes'
import type { EstadoFisico, Region } from './disfraces'
import { diasEntre, sumarDias } from './fechas'

export type EstadoPedido = 'reservado' | 'entregado' | 'devuelto' | 'cancelado'
export type EstadoPendiente = 'pendiente' | 'en_confeccion' | 'listo'
export type MedioPago = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'tarjeta'
export type TipoGarantia = 'efectivo' | 'dni'
export type ConceptoPago =
  | 'adelanto'
  | 'saldo'
  | 'garantia_recibida'
  | 'garantia_devuelta'
  | 'mora'
  | 'dano'
  | 'devolucion_adelanto'

export const MEDIOS_PAGO: MedioPago[] = ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta']

export const NOMBRE_MEDIO: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta'
}

export const NOMBRE_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  reservado: 'Reservado',
  entregado: 'Entregado',
  devuelto: 'Devuelto',
  cancelado: 'Cancelado'
}

export const NOMBRE_ESTADO_PENDIENTE: Record<EstadoPendiente, string> = {
  pendiente: 'Por confeccionar',
  en_confeccion: 'En confección',
  listo: 'Listo'
}

export const NOMBRE_CONCEPTO: Record<ConceptoPago, string> = {
  adelanto: 'Adelanto',
  saldo: 'Saldo',
  garantia_recibida: 'Garantía recibida',
  garantia_devuelta: 'Garantía devuelta',
  mora: 'Mora',
  dano: 'Daños',
  devolucion_adelanto: 'Devolución de adelanto'
}

/** Sugerencias de evento. "Otro" para lo que no encaje; el evento es obligatorio. */
export const EVENTOS_SUGERIDOS = [
  'Día de la Madre',
  'Fiestas Patrias',
  'Aniversario del colegio',
  'Primavera',
  'Clausura',
  'Otro'
]

export interface Rango {
  /** Fecha de salida "aaaa-mm-dd". */
  inicio: string
  /** Fecha de devolución pactada "aaaa-mm-dd". */
  fin: string
}

// ---------- Catálogo para armar el pedido ----------

export interface TallaDisponible {
  talla: string
  /** Unidades que no están de baja. */
  total: number
  /** Libres en las fechas del pedido (incluye las que están en lavandería). */
  libres: number
}

export interface ModeloDisponible {
  id: number
  nombre: string
  categoria: string
  region: Region | null
  prefijo: string
  /** Precio sugerido para este pedido (ya multiplicado por los días si el precio es por día). */
  precioSugerido: number
  tallas: TallaDisponible[]
}

/** Una unidad lista para ponerla en el carrito. */
export interface UnidadParaPedido {
  unidadId: number
  codigo: string
  modeloId: number
  modeloNombre: string
  talla: string
  estadoFisico: EstadoFisico
  precioSugerido: number
}

export interface ResultadoAsignacion {
  asignadas: UnidadParaPedido[]
  /** Libres que había en total (antes de descontar las del carrito). */
  libres: number
  faltan: number
}

export interface ConflictoUnidad {
  unidadId: number
  codigo: string
  mensaje: string
}

// ---------- Borrador que se envía al guardar ----------

export interface LineaBorrador {
  unidadId: number
  precioCobrado: number
}

export interface PendienteBorrador {
  /** Solo al editar un pendiente que ya existe. */
  id?: number
  modeloId: number
  talla: string
  cantidad: number
  fechaLimite: string
  precioCobrado: number
  observaciones: string
}

export interface BorradorPedido {
  clienteId: number
  fechaSalida: string
  fechaDevolucionPactada: string
  evento: string
  gradoSeccion: string
  observaciones: string
  garantiaTipo: TipoGarantia | null
  garantiaMonto: number
  lineas: LineaBorrador[]
  pendientes: PendienteBorrador[]
  /** Solo al crear. Al editar, los adelantos se registran aparte. */
  adelanto: { monto: number; medio: MedioPago } | null
}

// ---------- Lectura ----------

export interface ClienteDePedido {
  id: number
  nombres: string
  tipo: TipoCliente
  telefono: string
  responsable: string
  dniResponsable: string | null
  conAntecedentes: boolean
}

export interface LineaPedido {
  detalleId: number
  unidadId: number
  codigo: string
  modeloId: number
  modeloNombre: string
  talla: string
  estadoFisico: EstadoFisico
  precioOriginal: number
  precioCobrado: number
  pendienteId: number | null
}

export interface PendientePedido {
  id: number
  modeloId: number
  modeloNombre: string
  talla: string
  cantidad: number
  cantidadAsignada: number
  fechaLimite: string
  estado: EstadoPendiente
  precioOriginal: number
  precioCobrado: number
  observaciones: string
}

export interface PagoPedido {
  id: number
  fecha: string
  monto: number
  concepto: ConceptoPago
  medio: MedioPago
}

export interface TotalesPedido {
  /** Suma de precios cobrados de unidades y pendientes. */
  total: number
  /** Adelantos pagados menos devoluciones de adelanto. */
  adelantoNeto: number
  saldo: number
}

export interface FichaPedido {
  id: number
  cliente: ClienteDePedido
  fechaReserva: string
  fechaSalida: string
  fechaDevolucionPactada: string
  estado: EstadoPedido
  evento: string
  gradoSeccion: string
  observaciones: string
  garantiaTipo: TipoGarantia | null
  garantiaMonto: number
  lineas: LineaPedido[]
  pendientes: PendientePedido[]
  pagos: PagoPedido[]
  totales: TotalesPedido
}

export interface ResumenPedido {
  id: number
  clienteId: number
  clienteNombre: string
  clienteTipo: TipoCliente
  evento: string
  gradoSeccion: string
  fechaSalida: string
  fechaDevolucionPactada: string
  estado: EstadoPedido
  unidades: number
  /** Unidades que faltan confeccionar y asignar. */
  porConfeccionar: number
  total: number
  codigos: string[]
}

export interface PendienteAbierto {
  id: number
  pedidoId: number
  clienteNombre: string
  evento: string
  fechaSalida: string
  fechaLimite: string
  faltan: number
}

export type OpcionAdelantoAlCancelar =
  | { tipo: 'devolver_todo'; medio: MedioPago }
  | { tipo: 'devolver_parte'; monto: number; medio: MedioPago }
  | { tipo: 'retener' }

/**
 * Total del pedido: unidades asignadas + unidades que faltan confeccionar.
 * Lo ya asignado de un pendiente está en las líneas: no se cuenta dos veces.
 */
export function totalDelPedido(
  lineas: { precioCobrado: number }[],
  pendientes: { cantidad: number; cantidadAsignada?: number; precioCobrado: number }[]
): number {
  return (
    lineas.reduce((s, l) => s + l.precioCobrado, 0) +
    pendientes.reduce((s, p) => s + (p.cantidad - (p.cantidadAsignada ?? 0)) * p.precioCobrado, 0)
  )
}

/** Días del alquiler para el precio por día: diferencia entre fechas, mínimo 1. */
export function diasDeAlquiler(salida: string, devolucion: string): number {
  return Math.max(1, diasEntre(salida, devolucion))
}

/** Precio de una unidad para este pedido: el del modelo, por los días si el precio es por día. */
export function precioParaPedido(precioModelo: number, salida: string, devolucion: string, precioPorDia: boolean): number {
  return precioPorDia ? precioModelo * diasDeAlquiler(salida, devolucion) : precioModelo
}

/**
 * Si cambian las fechas de un pedido con precio por día, los precios ya copiados se ajustan
 * en proporción a los días.
 */
export function reajustarPorDias(precio: number, diasAntes: number, diasAhora: number): number {
  return diasAntes === diasAhora ? precio : Math.round((precio * diasAhora) / diasAntes)
}

/** Fecha límite sugerida para confeccionar: 2 días antes de la salida, pero nunca antes de hoy. */
export function fechaLimiteSugerida(salida: string, hoy: string): string {
  const sugerida = sumarDias(salida, -2)
  return sugerida < hoy ? hoy : sugerida
}
