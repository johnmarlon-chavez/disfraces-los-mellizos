import { useEffect, useId, type ReactNode } from 'react'

interface Props {
  titulo: string
  onCerrar: () => void
  children: ReactNode
  /** Botones de acción; quedan fijos abajo, siempre visibles aunque el contenido sea largo. */
  pie?: ReactNode
  ancho?: 'normal' | 'amplio'
}

// Diálogos abiertos, del más antiguo al más reciente: Escape cierra solo el de arriba.
const abiertos: string[] = []

/** Ventana modal. Se cierra con Escape o con el botón "Cerrar". */
export default function Dialogo({ titulo, onCerrar, children, pie, ancho = 'normal' }: Props): React.JSX.Element {
  const idTitulo = useId()

  useEffect(() => {
    abiertos.push(idTitulo)
    return () => {
      abiertos.splice(abiertos.indexOf(idTitulo), 1)
    }
  }, [idTitulo])

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && abiertos[abiertos.length - 1] === idTitulo) onCerrar()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar, idTitulo])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`flex max-h-[92vh] w-full flex-col rounded-xl bg-white shadow-xl ${
          ancho === 'amplio' ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <h2 id={idTitulo} className="text-2xl font-bold">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-3 py-1 text-lg font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cerrar ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {pie && <div className="border-t border-slate-200 px-6 py-4">{pie}</div>}
      </div>
    </div>
  )
}
