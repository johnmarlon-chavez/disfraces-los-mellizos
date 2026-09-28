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

/**
 * Cuenta que está usando el programa (la abre y la cierra acceso.ts). null sin sesión: el IPC ya
 * no deja pasar nada sin sesión, así que null solo llega en pruebas y en el seed.
 */
export function obtenerSesion(): Sesion | null {
  return sesionActual
}

export function establecerSesion(sesion: Sesion | null): void {
  sesionActual = sesion
}

/** acceso.ts registra aquí cómo verificar la contraseña de la dueña (bcrypt, con su contador de intentos). */
export function establecerVerificadorDuena(verificador: VerificadorContrasenaDuena | null): void {
  verificarContrasenaDuena = verificador
}

/**
 * Acciones reservadas para la dueña (dar de baja, reactivar, autorizar saldo pendiente,
 * entregar con pendientes, rebajar mora...).
 * - Sesión de la dueña: se permite.
 * - Sesión de Trabajadores: se permite solo con la contraseña de la dueña (`autorizacion`).
 * - Sin sesión (solo pruebas y seed; el IPC exige sesión): se permite.
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
