/**
 * Error pensado para la usuaria: su mensaje se muestra tal cual en pantalla.
 * Ejemplo: throw new ErrorDeNegocio('Este disfraz ya está reservado del 28/10 al 31/10')
 */
export class ErrorDeNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeNegocio'
  }
}

export const MENSAJE_ERROR_INESPERADO =
  'Ocurrió un problema inesperado. Intente de nuevo; si sigue pasando, cierre y vuelva a abrir el programa.'

/** Traduce cualquier error a un mensaje comprensible. Nunca expone errores técnicos. */
export function mensajeParaUsuario(error: unknown): string {
  if (error instanceof ErrorDeNegocio) return error.message
  return MENSAJE_ERROR_INESPERADO
}
