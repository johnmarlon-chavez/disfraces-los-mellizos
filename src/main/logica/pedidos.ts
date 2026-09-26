// Reglas de pedidos: validaciones, precios por día, fecha límite de confección. Funciones puras.
import { normalizarTalla } from '../../shared/disfraces'
import { esFechaValida } from '../../shared/fechas'
import { formatearFecha, formatearSoles } from '../../shared/formato'
import { MEDIOS_PAGO, type MedioPago, type TipoGarantia } from '../../shared/pedidos'
import { ErrorDeNegocio } from '../errores'

export const MAX_CANTIDAD = 200

export function validarFechas(
  salida: string,
  devolucion: string,
  hoy: string,
  salidaAnterior: string | null = null
): void {
  if (!esFechaValida(salida)) throw new ErrorDeNegocio('Elija la fecha de salida.')
  if (!esFechaValida(devolucion)) throw new ErrorDeNegocio('Elija la fecha de devolución.')
  // Al editar, una reserva cuya salida ya pasó (no la recogieron) puede conservar esa fecha.
  if (salida < hoy && salida !== salidaAnterior) {
    throw new ErrorDeNegocio(`La fecha de salida (${formatearFecha(salida)}) ya pasó. Elija hoy o una fecha futura.`)
  }
  if (devolucion < salida) {
    throw new ErrorDeNegocio('La fecha de devolución no puede ser anterior a la de salida.')
  }
}

export function validarFechaLimite(fechaLimite: string, salida: string, hoy: string): void {
  if (!esFechaValida(fechaLimite)) throw new ErrorDeNegocio('Elija la fecha límite de confección.')
  if (fechaLimite > salida) {
    throw new ErrorDeNegocio(
      `La fecha límite de confección no puede ser después de la salida (${formatearFecha(salida)}).`
    )
  }
  if (fechaLimite < hoy) throw new ErrorDeNegocio('La fecha límite de confección ya pasó. Elija hoy o una fecha futura.')
}

export function validarEvento(evento: string): string {
  const limpio = evento.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeNegocio('Escriba el evento (por ejemplo, Día de la Madre). Si no encaja en ninguno, elija "Otro".')
  if (limpio.length > 60) throw new ErrorDeNegocio('El evento es demasiado largo (máximo 60 letras).')
  return limpio
}

export function validarGradoSeccion(grado: string): string {
  const limpio = grado.trim().replace(/\s+/g, ' ')
  if (limpio.length > 30) throw new ErrorDeNegocio('El grado y sección es demasiado largo (máximo 30 letras).')
  return limpio
}

export function validarPrecioCobrado(precio: number, descripcion: string): number {
  if (!Number.isSafeInteger(precio) || precio < 0) throw new ErrorDeNegocio(`El precio de ${descripcion} no es válido.`)
  return precio
}

export function validarCantidad(cantidad: number): number {
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorDeNegocio('La cantidad debe ser al menos 1.')
  if (cantidad > MAX_CANTIDAD) throw new ErrorDeNegocio(`La cantidad máxima por línea es ${MAX_CANTIDAD}.`)
  return cantidad
}

export function validarTallaPedido(talla: string): string {
  const limpio = normalizarTalla(talla)
  if (!limpio) throw new ErrorDeNegocio('Elija la talla.')
  return limpio
}

export function validarMedio(medio: MedioPago): MedioPago {
  if (!MEDIOS_PAGO.includes(medio)) throw new ErrorDeNegocio('Elija el medio de pago.')
  return medio
}

export function validarMontoPago(monto: number, descripcion: string): number {
  if (!Number.isSafeInteger(monto) || monto <= 0) throw new ErrorDeNegocio(`El monto ${descripcion} debe ser mayor que cero.`)
  return monto
}

/** El adelanto acumulado no puede pasar del total del pedido. */
export function validarAdelantoTotal(adelantoNeto: number, total: number): void {
  if (adelantoNeto > total) {
    throw new ErrorDeNegocio(
      `El adelanto (${formatearSoles(adelantoNeto)}) no puede ser mayor que el total del pedido (${formatearSoles(total)}).`
    )
  }
}

export function validarGarantia(tipo: TipoGarantia | null, monto: number): { tipo: TipoGarantia | null; monto: number } {
  if (tipo === null) return { tipo: null, monto: 0 }
  if (tipo !== 'efectivo' && tipo !== 'dni') throw new ErrorDeNegocio('Elija el tipo de garantía: efectivo o DNI.')
  if (tipo === 'dni') return { tipo, monto: 0 }
  if (!Number.isSafeInteger(monto) || monto < 0) throw new ErrorDeNegocio('El monto de la garantía no es válido.')
  return { tipo, monto }
}
