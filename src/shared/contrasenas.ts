// Reglas de contraseña: fáciles de usar pero no triviales. Compartidas por main y renderer
// (el indicador de la pantalla usa exactamente las mismas reglas que valida el main).
import { normalizarTexto } from './disfraces'

export type Cuenta = 'duena' | 'trabajadores'

export const NOMBRE_CUENTA: Record<Cuenta, string> = {
  duena: 'Dueña',
  trabajadores: 'Trabajadores'
}

export const LARGO_MINIMO = 8

const OBVIAS = [
  'contrasena',
  'contraseña',
  'password',
  'clave',
  'disfraces',
  'disfraz',
  'mellizos',
  'losmellizos',
  'trujillo',
  'duena',
  'dueña',
  'trabajadores',
  'trabajador',
  'administrador',
  'admin',
  'usuario',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  'abc123',
  'peru',
  'tienda'
]

const SECUENCIAS = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']

const SUGERENCIA = 'Pruebe con una frase corta que recuerde, como «mi gato come pan 7».'

/** Solo letras y números, en minúsculas y sin tildes, para comparar. */
function esencia(contrasena: string): string {
  return normalizarTexto(contrasena).replace(/[^a-z0-9]/g, '')
}

/**
 * Motivo por el que la contraseña no sirve, o null si es aceptable.
 * Se permiten espacios, así que valen frases. No se exigen mayúsculas ni símbolos.
 */
export function problemaDeContrasena(contrasena: string): string | null {
  if (contrasena.trim().length < LARGO_MINIMO) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO} letras o números. ${SUGERENCIA}`
  }
  const e = esencia(contrasena)
  if (e.length < 6) return `La contraseña tiene muy pocas letras o números. ${SUGERENCIA}`
  if (new Set(e).size <= 2) return `La contraseña repite casi siempre lo mismo. ${SUGERENCIA}`
  if (SECUENCIAS.some((s) => s.includes(e))) return `La contraseña es una secuencia muy fácil de adivinar (como 12345678). ${SUGERENCIA}`
  if (/^\d+$/.test(e)) {
    if (e.length <= 8 && /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d\d$/.test(e)) {
      return `No use una fecha como contraseña: es fácil de adivinar. ${SUGERENCIA}`
    }
    if (e.length < 10) return `Una contraseña solo de números debe tener al menos 10. ${SUGERENCIA}`
  }
  const sinNumeros = e.replace(/\d+/g, '')
  if (OBVIAS.some((o) => esencia(o) === sinNumeros || esencia(o) === e)) {
    return `La contraseña es una palabra muy fácil de adivinar. ${SUGERENCIA}`
  }
  return null
}

export type Fuerza = 'muy_facil' | 'aceptable' | 'buena'

export const NOMBRE_FUERZA: Record<Fuerza, string> = {
  muy_facil: 'Muy fácil',
  aceptable: 'Aceptable',
  buena: 'Buena'
}

/** Indicador simple mientras se escribe. */
export function fuerzaDeContrasena(contrasena: string): Fuerza {
  if (problemaDeContrasena(contrasena)) return 'muy_facil'
  const tipos = [/[a-z]/i, /\d/, /[^a-z0-9\s]/i, /\s/].filter((r) => r.test(contrasena)).length
  return contrasena.trim().length >= 12 || tipos >= 3 ? 'buena' : 'aceptable'
}

/** Código de recuperación: se escribe con o sin guiones y en mayúsculas o minúsculas. */
export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface SesionInfo {
  cuenta: Cuenta
  nombre: string
}

export interface EstadoAcceso {
  hayCuentas: boolean
  sesion: SesionInfo | null
  /** Tiempo sin actividad tras el que se cierra la sesión de la dueña. */
  inactividadMs: number
}

export interface DatosPrimerUso {
  contrasenaDuena: string
  contrasenaTrabajadores: string
  /** El código de recuperación, escrito de nuevo por la dueña para comprobar que lo anotó. */
  codigoConfirmado: string
}

/** La sesión de la dueña se cierra sola tras este tiempo sin actividad; se avisa un minuto antes. */
export const INACTIVIDAD_DUENA_MS = 10 * 60 * 1000
export const AVISO_INACTIVIDAD_MS = 60 * 1000
