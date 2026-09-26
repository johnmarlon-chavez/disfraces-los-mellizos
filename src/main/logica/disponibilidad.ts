// Regla de disponibilidad (la más importante del sistema) y asignación por cantidad.
// Funciones puras: reciben unidades y ocupaciones ya leídas de la base.
//
// Una unidad NO está disponible para el rango [inicio, fin] (fechas inclusivas) si:
//   1. su estado físico es `reparacion` o `baja`, o
//   2. está en un alquiler `reservado` o `entregado` tal que
//        fecha_salida <= fin  Y  fin_de_ocupacion >= inicio
//      donde fin_de_ocupacion = devolución pactada + días de margen de lavado.
//      Si el alquiler está entregado y ya pasó la fecha pactada (no ha vuelto), la ocupación
//      se cuenta desde la fecha más tarde entre la pactada y hoy: el traje sigue fuera.
// `lavanderia` no bloquea: el traje volverá limpio (se avisa si sale hoy).
import { mismaTalla, type EstadoFisico } from '../../shared/disfraces'
import { maxFecha, sumarDias } from '../../shared/fechas'
import { formatearFecha } from '../../shared/formato'
import type { Rango } from '../../shared/pedidos'

export interface Ocupacion {
  alquilerId: number
  clienteNombre: string
  estado: 'reservado' | 'entregado'
  fechaSalida: string
  fechaDevolucionPactada: string
}

export interface UnidadConOcupaciones {
  id: number
  codigo: string
  modeloId: number
  talla: string
  estadoFisico: EstadoFisico
  ocupaciones: Ocupacion[]
}

/** Último día (inclusive) en que la unidad está ocupada por este alquiler, contando el lavado. */
export function finDeOcupacion(o: Ocupacion, margen: number, hoy: string): string {
  const vuelve = o.estado === 'entregado' ? maxFecha(o.fechaDevolucionPactada, hoy) : o.fechaDevolucionPactada
  return sumarDias(vuelve, margen)
}

export function ocupacionChoca(o: Ocupacion, rango: Rango, margen: number, hoy: string): boolean {
  return o.fechaSalida <= rango.fin && finDeOcupacion(o, margen, hoy) >= rango.inicio
}

export type MotivoNoDisponible =
  | { tipo: 'estado'; estado: 'reparacion' | 'baja' }
  | { tipo: 'ocupada'; ocupacion: Ocupacion }

/**
 * null si la unidad está libre en el rango. Si no, el motivo (el primer alquiler que choca,
 * dando prioridad a los entregados). `excluirAlquilerId`: el pedido que se está editando.
 */
export function motivoNoDisponible(
  unidad: Pick<UnidadConOcupaciones, 'estadoFisico' | 'ocupaciones'>,
  rango: Rango,
  margen: number,
  hoy: string,
  excluirAlquilerId: number | null = null
): MotivoNoDisponible | null {
  if (unidad.estadoFisico === 'reparacion' || unidad.estadoFisico === 'baja') {
    return { tipo: 'estado', estado: unidad.estadoFisico }
  }
  const choques = unidad.ocupaciones
    .filter((o) => o.alquilerId !== excluirAlquilerId && ocupacionChoca(o, rango, margen, hoy))
    .sort((a, b) => Number(b.estado === 'entregado') - Number(a.estado === 'entregado') || a.fechaSalida.localeCompare(b.fechaSalida))
  return choques.length > 0 ? { tipo: 'ocupada', ocupacion: choques[0] } : null
}

function corta(fecha: string): string {
  return formatearFecha(fecha).slice(0, 5)
}

/** Mensaje para la usuaria: "HUM-003 está reservado del 28/10 al 31/10 para I.E. Los Girasoles (más 1 día de lavado)." */
export function describirMotivo(codigo: string, motivo: MotivoNoDisponible, margen: number, hoy: string): string {
  if (motivo.tipo === 'estado') {
    return motivo.estado === 'reparacion' ? `${codigo} está en reparación.` : `${codigo} está dado de baja.`
  }
  const o = motivo.ocupacion
  const lavado = margen > 0 ? ` (más ${margen} ${margen === 1 ? 'día' : 'días'} de lavado)` : ''
  if (o.estado === 'entregado') {
    if (o.fechaDevolucionPactada < hoy) {
      return `${codigo} está alquilado a ${o.clienteNombre}: debía volver el ${corta(o.fechaDevolucionPactada)} y todavía no vuelve.`
    }
    return `${codigo} está alquilado a ${o.clienteNombre} y vuelve el ${corta(o.fechaDevolucionPactada)}${lavado}.`
  }
  return `${codigo} está reservado del ${corta(o.fechaSalida)} al ${corta(o.fechaDevolucionPactada)} para ${o.clienteNombre}${lavado}.`
}

/**
 * Unidades libres de una talla en el rango, en orden de preferencia:
 * primero las disponibles, luego las que están en lavandería; dentro de cada grupo, por código.
 */
export function unidadesLibres<T extends UnidadConOcupaciones>(
  unidades: T[],
  talla: string,
  rango: Rango,
  margen: number,
  hoy: string,
  excluirAlquilerId: number | null = null
): T[] {
  return unidades
    .filter((u) => mismaTalla(u.talla, talla) && motivoNoDisponible(u, rango, margen, hoy, excluirAlquilerId) === null)
    .sort(
      (a, b) =>
        Number(a.estadoFisico === 'lavanderia') - Number(b.estadoFisico === 'lavanderia') ||
        a.codigo.localeCompare(b.codigo, 'es')
    )
}

/**
 * Asigna `cantidad` unidades de las libres, saltando las que ya están en el carrito.
 * Si no alcanzan, devuelve todas las que hay y cuántas faltan.
 */
export function asignarPorCantidad<T extends { id: number }>(
  libres: T[],
  cantidad: number,
  yaEnCarrito: ReadonlySet<number> = new Set()
): { asignadas: T[]; faltan: number } {
  const candidatas = libres.filter((u) => !yaEnCarrito.has(u.id))
  const asignadas = candidatas.slice(0, Math.max(0, cantidad))
  return { asignadas, faltan: Math.max(0, cantidad - asignadas.length) }
}
