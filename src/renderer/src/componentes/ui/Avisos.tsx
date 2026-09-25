import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

interface Aviso {
  id: number
  tipo: 'exito' | 'error'
  mensaje: string
}

interface ApiAvisos {
  exito: (mensaje: string) => void
  error: (mensaje: string) => void
}

const Contexto = createContext<ApiAvisos | null>(null)

export function useAvisos(): ApiAvisos {
  const avisos = useContext(Contexto)
  if (!avisos) throw new Error('useAvisos requiere ProveedorAvisos')
  return avisos
}

/** Mensajes breves arriba al centro, donde no tapan botones. Los errores duran más y se pueden cerrar. */
export function ProveedorAvisos({ children }: { children: ReactNode }): React.JSX.Element {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguienteId = useRef(1)

  const quitar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), [])

  const agregar = useCallback(
    (tipo: Aviso['tipo'], mensaje: string) => {
      const id = siguienteId.current++
      setAvisos((a) => [...a, { id, tipo, mensaje }])
      setTimeout(() => quitar(id), tipo === 'error' ? 10000 : 4000)
    },
    [quitar]
  )

  const api = useMemo<ApiAvisos>(
    () => ({ exito: (m) => agregar('exito', m), error: (m) => agregar('error', m) }),
    [agregar]
  )

  return (
    <Contexto.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex w-full max-w-xl -translate-x-1/2 flex-col items-center gap-3 px-4">
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg px-5 py-4 text-lg font-semibold text-white shadow-lg ${
              a.tipo === 'error' ? 'bg-red-700' : 'bg-green-700'
            }`}
          >
            <span className="flex-1">{a.mensaje}</span>
            <button type="button" onClick={() => quitar(a.id)} aria-label="Cerrar aviso" className="px-1">
              ✕
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}
