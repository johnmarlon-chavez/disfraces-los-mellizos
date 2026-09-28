// Herramienta de soporte: clave que solo conoce el técnico, definida al instalar.
import { problemaDeContrasena } from './contrasenas'

export const LARGO_MINIMO_CLAVE_SOPORTE = 12

export interface EstadoSoporte {
  hayCuentas: boolean
  claveDefinida: boolean
  /** Segundos que faltan para poder volver a intentar (0 = sin bloqueo). */
  segundosBloqueado: number
}

/** Motivo por el que la clave de soporte no sirve, o null. Más exigente que una contraseña común. */
export function problemaDeClaveSoporte(clave: string): string | null {
  if (clave.trim().length < LARGO_MINIMO_CLAVE_SOPORTE) {
    return `La clave de soporte debe tener al menos ${LARGO_MINIMO_CLAVE_SOPORTE} caracteres.`
  }
  const problema = problemaDeContrasena(clave)
  return problema ? problema.replace('La contraseña', 'La clave de soporte') : null
}
