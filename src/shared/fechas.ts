// Aritmética de fechas de calendario "aaaa-mm-dd", sin horas ni zona horaria.
// Se opera en UTC para que los cambios de horario nunca muevan un día.

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/** true si es una fecha real ("2026-02-30" no lo es). */
export function esFechaValida(fecha: string): boolean {
  const m = FECHA.exec(fecha)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

function aUtc(fecha: string): number {
  if (!esFechaValida(fecha)) throw new Error(`Fecha inválida: ${fecha}`)
  const [a, m, d] = fecha.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

function deUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const DIA = 86_400_000

/** sumarDias('2026-12-31', 1) -> '2027-01-01'. Acepta días negativos. */
export function sumarDias(fecha: string, dias: number): string {
  return deUtc(aUtc(fecha) + dias * DIA)
}

/** Días de `desde` a `hasta`: diasEntre('2026-10-28', '2026-10-31') -> 3. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / DIA)
}

/** Fechas "aaaa-mm-dd" se comparan bien como texto. */
export function maxFecha(a: string, b: string): string {
  return a >= b ? a : b
}
