import type { ReactNode } from 'react'
import type { AutorizacionDuena } from '../../../../shared/autorizacion'
import type { Variante } from './Boton'
import { useConfirmar } from './Confirmacion'

interface Opciones {
  titulo: string
  mensaje: ReactNode
  textoConfirmar: string
  variante?: Variante
}

/** null = la usuaria canceló. Si no, la autorización para enviar al main (null si no hizo falta contraseña). */
export type ResultadoAutorizacion = { autorizacion: AutorizacionDuena | null } | null

/**
 * Único punto por donde pasan las acciones "solo para la dueña" (dar de baja, reactivar,
 * autorizar saldo pendiente, entregar con pendientes, rebajar mora...).
 * FASE 7: si la sesión es de Trabajadores, este mismo diálogo pedirá la contraseña de la dueña
 * y la devolverá en `autorizacion`; quienes lo usan no cambian.
 */
export function useAutorizacionDuena(): (opciones: Opciones) => Promise<ResultadoAutorizacion> {
  const confirmar = useConfirmar()
  return async (opciones) => ((await confirmar(opciones)) ? { autorizacion: null } : null)
}
