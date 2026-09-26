// Mora por retraso en la devolución. Funciones puras.
//
// Días de retraso de una unidad = fecha real de devolución − fecha pactada (días calendario, mínimo 0).
// El margen de lavado es interno de la tienda y no cuenta para la mora.
//
// modo_mora:
// - por_unidad: cada unidad atrasada genera su propio cargo: días × mora por día.
// - por_pedido: una sola mora por pedido = mayor retraso × mora por día. En devoluciones parciales
//   se cobra solo la diferencia en días respecto a lo ya cobrado (nunca dos veces el mismo día).
import { diasEntre } from '../../shared/fechas'
import type { ModoMora } from '../../shared/ipc'

export function diasDeRetraso(pactada: string, real: string): number {
  return Math.max(0, diasEntre(pactada, real))
}

export interface UnidadDevuelta {
  unidadId: number
  codigo: string
  fechaDevolucion: string
}

export interface CargoMoraNuevo {
  /** null en modo por pedido. */
  unidadId: number | null
  dias: number
  monto: number
  descripcion: string
}

const dias = (n: number): string => `${n} ${n === 1 ? 'día' : 'días'}`

/**
 * Cargos de mora que genera esta devolución.
 * `devueltasAntes`: fechas de las unidades del pedido que ya se habían devuelto.
 */
export function calcularMora(
  modo: ModoMora,
  moraPorDia: number,
  fechaPactada: string,
  devueltasAntes: { fechaDevolucion: string }[],
  nuevas: UnidadDevuelta[]
): CargoMoraNuevo[] {
  if (moraPorDia <= 0 || nuevas.length === 0) return []

  if (modo === 'por_unidad') {
    return nuevas
      .map((u) => ({ u, d: diasDeRetraso(fechaPactada, u.fechaDevolucion) }))
      .filter(({ d }) => d > 0)
      .map(({ u, d }) => ({
        unidadId: u.unidadId,
        dias: d,
        monto: d * moraPorDia,
        descripcion: `${u.codigo}: ${dias(d)} de retraso`
      }))
  }

  const maxAntes = Math.max(0, ...devueltasAntes.map((u) => diasDeRetraso(fechaPactada, u.fechaDevolucion)))
  const maxNuevo = Math.max(0, ...nuevas.map((u) => diasDeRetraso(fechaPactada, u.fechaDevolucion)))
  const delta = maxNuevo - maxAntes
  if (delta <= 0) return []
  return [
    {
      unidadId: null,
      dias: delta,
      monto: delta * moraPorDia,
      descripcion:
        maxAntes > 0
          ? `Pedido: ${dias(maxNuevo)} de retraso (ya se habían cobrado ${dias(maxAntes)})`
          : `Pedido: ${dias(maxNuevo)} de retraso`
    }
  ]
}
