import { ErrorDeNegocio } from './errores'

export interface Sesion {
  usuarioId: number
  rol: 'admin' | 'empleado'
}

let sesionActual: Sesion | null = null

/** Cuenta que está usando el programa. null mientras no exista el login (fase 7). */
export function obtenerSesion(): Sesion | null {
  return sesionActual
}

export function establecerSesion(sesion: Sesion | null): void {
  sesionActual = sesion
}

/**
 * Acciones reservadas para la dueña (dar de baja, reactivar...).
 * FASE 7: mientras no hay login la sesión es null y se permite todo. Al agregar el
 * login, la sesión nunca será null en uso normal y esta regla se aplicará sola.
 */
export function exigirDuena(sesion: Sesion | null, accion: string): void {
  if (sesion && sesion.rol !== 'admin') {
    throw new ErrorDeNegocio(`Solo la dueña puede ${accion}.`)
  }
}
