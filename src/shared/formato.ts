// Formatos de moneda y fecha para Perú. Los montos siempre viajan como enteros en céntimos.

export const ZONA_HORARIA = 'America/Lima'

/** 2500 -> "S/ 25.00"; 125000 -> "S/ 1,250.00"; -500 -> "-S/ 5.00" */
export function formatearSoles(centimos: number): string {
  if (!Number.isInteger(centimos)) {
    throw new Error(`El monto debe estar en céntimos enteros: ${centimos}`)
  }
  const signo = centimos < 0 ? '-' : ''
  const absoluto = Math.abs(centimos)
  const soles = Math.floor(absoluto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cent = (absoluto % 100).toString().padStart(2, '0')
  return `${signo}S/ ${soles}.${cent}`
}

/**
 * Convierte lo que escribe la usuaria ("25", "25.5", "S/ 1,250.00") a céntimos.
 * Devuelve null si el texto no es un monto válido (negativo, más de 2 decimales, letras...).
 */
export function solesACentimos(texto: string): number | null {
  const limpio = texto.trim().replace(/^S\/\s*/i, '')
  // La coma solo se acepta como separador de miles bien formado ("1,250"), para que
  // "25,5" (coma decimal) sea rechazado en vez de leerse como S/ 255.
  const coincidencia = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(limpio)
  if (!coincidencia) return null
  const soles = Number(coincidencia[1].replace(/,/g, ''))
  const cent = Number((coincidencia[2] ?? '0').padEnd(2, '0'))
  const total = soles * 100 + cent
  return Number.isSafeInteger(total) ? total : null
}

function partesEnLima(fecha: Date): { dia: string; mes: string; anio: string } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(fecha)
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? ''
  return { dia: valor('day'), mes: valor('month'), anio: valor('year') }
}

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Acepta una fecha "aaaa-mm-dd" (como se guarda en la BD) o un Date (un instante,
 * que se muestra según la hora de Lima). Devuelve "dd/mm/aaaa".
 */
export function formatearFecha(fecha: string | Date): string {
  if (typeof fecha === 'string') {
    const m = FECHA_ISO.exec(fecha)
    if (!m) throw new Error(`Fecha con formato inválido: ${fecha}`)
    return `${m[3]}/${m[2]}/${m[1]}`
  }
  const { dia, mes, anio } = partesEnLima(fecha)
  return `${dia}/${mes}/${anio}`
}

/** Fecha de hoy en Lima como "aaaa-mm-dd". */
export function hoyEnLima(ahora: Date = new Date()): string {
  const { dia, mes, anio } = partesEnLima(ahora)
  return `${anio}-${mes}-${dia}`
}
