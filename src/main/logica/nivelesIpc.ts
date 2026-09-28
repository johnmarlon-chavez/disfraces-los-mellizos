// Nivel de acceso de cada canal IPC. Por defecto, todo canal exige una sesión abierta.
import type { NombreCanal } from '../../shared/ipc'

/** publico: sin sesión (pantalla de ingreso); sesion: cualquier cuenta; duena: solo la dueña. */
export type NivelAcceso = 'publico' | 'sesion' | 'duena'

const PUBLICOS: ReadonlySet<NombreCanal> = new Set<NombreCanal>([
  'app:info',
  'acceso:estado',
  'acceso:prepararCodigo',
  'acceso:crearCuentas',
  'acceso:ingresar',
  'acceso:recuperar',
  'acceso:salir'
])

const SOLO_DUENA: ReadonlySet<NombreCanal> = new Set<NombreCanal>([
  'config:actualizar',
  'acceso:cambiarMiContrasena',
  'acceso:cambiarContrasenaTrabajadores',
  'acceso:nuevoCodigo'
])

export function nivelDeCanal(canal: NombreCanal): NivelAcceso {
  if (PUBLICOS.has(canal)) return 'publico'
  if (SOLO_DUENA.has(canal) || canal.startsWith('reportes:')) return 'duena'
  return 'sesion'
}

/** Qué hace la dueña en cada canal "solo dueña", para el mensaje de error. */
export function accionDeCanal(canal: NombreCanal): string {
  if (canal.startsWith('reportes:')) return 'ver los reportes'
  if (canal === 'config:actualizar') return 'cambiar la configuración'
  return 'cambiar las contraseñas'
}
