import { createContext, useCallback, useContext, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { AutorizacionDuena } from '../../../../shared/autorizacion'
import { llamar, mensajeDe } from '../../api'
import CampoContrasena from '../acceso/CampoContrasena'
import { useSesion } from '../acceso/Sesion'
import Boton, { type Variante } from './Boton'
import { useConfirmar } from './Confirmacion'
import Dialogo from './Dialogo'

interface Opciones {
  titulo: string
  mensaje: ReactNode
  textoConfirmar: string
  variante?: Variante
}

/** null = la usuaria canceló. Si no, la autorización para enviar al main (null si no hizo falta contraseña). */
export type ResultadoAutorizacion = { autorizacion: AutorizacionDuena | null } | null

type Autorizar = (opciones: Opciones) => Promise<ResultadoAutorizacion>

const Contexto = createContext<Autorizar | null>(null)

/**
 * Único punto por donde pasan las acciones "solo para la dueña" (dar de baja, reactivar,
 * autorizar saldo pendiente, entregar con pendientes, rebajar mora...).
 * Con la sesión de la dueña es una confirmación; con la de Trabajadores pide la contraseña
 * de la dueña en ese momento, sin cerrar sesión, y la devuelve en `autorizacion`.
 */
export function useAutorizacionDuena(): Autorizar {
  const autorizar = useContext(Contexto)
  if (!autorizar) throw new Error('useAutorizacionDuena requiere ProveedorAutorizacionDuena')
  return autorizar
}

export function ProveedorAutorizacionDuena({ children }: { children: ReactNode }): React.JSX.Element {
  const { esDuena } = useSesion()
  const confirmar = useConfirmar()
  const [opciones, setOpciones] = useState<Opciones | null>(null)
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)
  const resolver = useRef<(valor: ResultadoAutorizacion) => void>(() => {})
  const idFormulario = useId()

  const autorizar = useCallback<Autorizar>(
    async (o) => {
      if (esDuena) return (await confirmar(o)) ? { autorizacion: null } : null
      setContrasena('')
      setError(null)
      setOpciones(o)
      return new Promise<ResultadoAutorizacion>((resolve) => {
        resolver.current = resolve
      })
    },
    [esDuena, confirmar]
  )

  const responder = useCallback((valor: ResultadoAutorizacion) => {
    setOpciones(null)
    setContrasena('')
    resolver.current(valor)
  }, [])
  const cancelar = useCallback(() => responder(null), [responder])

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!contrasena) return setError('Pídale a la dueña que escriba su contraseña.')
    setVerificando(true)
    try {
      await llamar(window.api.acceso.verificarDuena(contrasena))
      responder({ autorizacion: { contrasena } })
    } catch (error) {
      // El diálogo queda abierto para volver a intentarlo.
      setError(mensajeDe(error))
      setContrasena('')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <Contexto.Provider value={autorizar}>
      {children}
      {opciones && (
        <Dialogo
          titulo={opciones.titulo}
          onCerrar={cancelar}
          pie={
            <div className="flex justify-end gap-3">
              <Boton variante="secundario" onClick={cancelar}>
                No, volver
              </Boton>
              <Boton type="submit" form={idFormulario} variante={opciones.variante ?? 'primario'} disabled={verificando}>
                {opciones.textoConfirmar}
              </Boton>
            </div>
          }
        >
          <form id={idFormulario} onSubmit={enviar} className="flex flex-col gap-4">
            <div className="text-lg">{opciones.mensaje}</div>
            <p className="rounded-lg bg-amber-50 p-3 text-lg">
              🔒 Esta acción es <strong>solo para la dueña</strong>. Pídale que escriba su contraseña aquí (no se cierra la sesión).
            </p>
            <CampoContrasena etiqueta="Contraseña de la dueña" valor={contrasena} onCambio={setContrasena} error={error} autoFocus autoComplete="off" />
          </form>
        </Dialogo>
      )}
    </Contexto.Provider>
  )
}
