import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import Boton, { type Variante } from './Boton'
import Dialogo from './Dialogo'

interface Opciones {
  titulo: string
  mensaje: ReactNode
  textoConfirmar: string
  variante?: Variante
}

type Confirmar = (opciones: Opciones) => Promise<boolean>

const Contexto = createContext<Confirmar | null>(null)

/** Pide confirmación antes de una acción importante: `if (await confirmar({...})) ...` */
export function useConfirmar(): Confirmar {
  const confirmar = useContext(Contexto)
  if (!confirmar) throw new Error('useConfirmar requiere ProveedorConfirmacion')
  return confirmar
}

export function ProveedorConfirmacion({ children }: { children: ReactNode }): React.JSX.Element {
  const [opciones, setOpciones] = useState<Opciones | null>(null)
  const resolver = useRef<(valor: boolean) => void>(() => {})

  const confirmar = useCallback<Confirmar>((o) => {
    setOpciones(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const responder = useCallback((valor: boolean) => {
    setOpciones(null)
    resolver.current(valor)
  }, [])
  const cancelar = useCallback(() => responder(false), [responder])

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      {opciones && (
        <Dialogo
          titulo={opciones.titulo}
          onCerrar={cancelar}
          pie={
            <div className="flex justify-end gap-3">
              <Boton variante="secundario" onClick={cancelar} autoFocus>
                No, volver
              </Boton>
              <Boton variante={opciones.variante ?? 'primario'} onClick={() => responder(true)}>
                {opciones.textoConfirmar}
              </Boton>
            </div>
          }
        >
          <div className="text-lg">{opciones.mensaje}</div>
        </Dialogo>
      )}
    </Contexto.Provider>
  )
}
