import type { AutorizacionDuena } from '../shared/autorizacion'
import { ErrorDeNegocio } from './errores'

export type { AutorizacionDuena }

export interface Sesion {
  usuarioId: number
  rol: 'admin' | 'empleado'
}

type VerificadorContrasenaDuena = (contrasena: string) => boolean

let sesionActual: Sesion | null = null
let verificarContrasenaDuena: VerificadorContrasenaDuena | null = null

/** Cuenta que está usando el programa. null mientras no exista el login (fase 7). */
export function obtenerSesion(): Sesion | null {
  return sesionActual
}

export function establecerSesion(sesion: Sesion | null): void {
  sesionActual = sesion
}

/** FASE 7: el login registra aquí cómo verificar la contraseña de la dueña (bcrypt). */
export function establecerVerificadorDuena(verificador: VerificadorContrasenaDuena | null): void {
  verificarContrasenaDuena = verificador
}

/**
 * Acciones reservadas para la dueña (dar de baja, reactivar, autorizar saldo pendiente,
 * entregar con pendientes, rebajar mora...).
 * - Sesión de la dueña: se permite.
 * - Sesión de Trabajadores: se permite solo con la contraseña de la dueña (`autorizacion`).
 * FASE 7: mientras no hay login la sesión es null y se permite todo. Al agregar el login,
 * la sesión nunca será null en uso normal y esta regla se aplicará sola.
 */
export function exigirDuena(sesion: Sesion | null, accion: string, autorizacion: AutorizacionDuena | null = null): void {
  if (!sesion || sesion.rol === 'admin') return
  if (autorizacion && verificarContrasenaDuena?.(autorizacion.contrasena)) return
  throw new ErrorDeNegocio(
    autorizacion
      ? 'La contraseña de la dueña no es correcta.'
      : `Solo la dueña puede ${accion}. Pídale que ingrese su contraseña.`
  )
}
