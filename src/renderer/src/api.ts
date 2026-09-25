import type { Resultado } from '../../shared/ipc'

export class ErrorApi extends Error {}

/** Desenvuelve un Resultado: devuelve los datos o lanza un ErrorApi con el mensaje para la usuaria. */
export async function llamar<T>(promesa: Promise<Resultado<T>>): Promise<T> {
  const r = await promesa
  if (!r.ok) throw new ErrorApi(r.error)
  return r.datos
}

export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorApi) return error.message
  console.error(error)
  return 'Ocurrió un problema inesperado. Intente de nuevo.'
}
