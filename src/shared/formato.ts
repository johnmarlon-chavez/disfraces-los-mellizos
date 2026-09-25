// Formatos de moneda y fecha para Perú. Los montos siempre viajan como enteros en céntimos.

export const ZONA_HORARIA = 'America/Lima'

/**
 * 2500 -> "S/ 25.00"; 125000 -> "S/ 1250.00"; -500 -> "-S/ 5.00"
 * Sin separador de miles, para que un monto copiado de la pantalla se pueda volver a escribir tal cual.
 */
export function formatearSoles(centimos: number): string {
  if (!Number.isInteger(centimos)) {
    throw new Error(`El monto debe estar en céntimos enteros: ${centimos}`)
  }
  const signo = centimos < 0 ? '-' : ''
  const absoluto = Math.abs(centimos)
  const soles = Math.floor(absoluto / 100)
  const cent = (absoluto % 100).toString().padStart(2, '0')
  return `${signo}S/ ${soles}.${cent}`
}

export type LecturaMonto = { ok: true; centimos: number } | { ok: false; error: string }

/**
 * Convierte lo que escribe la usuaria a céntimos. El punto y la coma valen como
 * separador decimal: "25", "25.5", "25,5", "25,50" y "S/ 25.50" son válidos.
 * No se aceptan separadores de miles: "1.250,00" o "25,555" son ambiguos y se
 * rechazan con un mensaje claro, en vez de adivinar el monto.
 */
export function leerMonto(texto: string): LecturaMonto {
  const limpio = texto.trim().replace(/^S\/\s*/i, '')
  if (limpio === '') return { ok: false, error: 'Escriba un monto.' }
  if (limpio.startsWith('-')) return { ok: false, error: 'El monto no puede ser negativo.' }

  const coincidencia = /^(\d+)(?:[.,](\d+))?$/.exec(limpio)
  if (!coincidencia) {
    if (/^[\d.,]+$/.test(limpio)) {
      return {
        ok: false,
        error: `No se entiende el monto "${texto.trim()}". Escríbalo sin separador de miles, por ejemplo 1250.50`
      }
    }
    return { ok: false, error: 'Escriba el monto solo con números, por ejemplo 25.50' }
  }

  const [, enteros, decimales = ''] = coincidencia
  if (decimales.length > 2) {
    return {
      ok: false,
      error: `No se entiende el monto "${texto.trim()}". Use como máximo 2 decimales y no use separador de miles, por ejemplo 1250.50`
    }
  }

  const total = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'))
  if (!Number.isSafeInteger(total)) return { ok: false, error: 'El monto es demasiado grande.' }
  return { ok: true, centimos: total }
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
