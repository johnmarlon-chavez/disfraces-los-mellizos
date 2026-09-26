import { useState } from 'react'
import { formatearSoles, leerMonto } from '../../../../shared/formato'

interface Props {
  etiqueta: string
  /** Céntimos. */
  valor: number
  onCambio: (centimos: number) => void
  /** Oculta la etiqueta (queda solo para lectores de pantalla). */
  etiquetaOculta?: boolean
  ancho?: string
}

function texto(centimos: number): string {
  return formatearSoles(centimos).replace('S/ ', '')
}

/**
 * Monto editable en soles. Acepta coma o punto; al salir del campo se valida con leerMonto
 * y, si no es válido, muestra el mensaje y conserva el último monto correcto.
 */
export default function CampoPrecio({ etiqueta, valor, onCambio, etiquetaOculta, ancho = 'w-28' }: Props): React.JSX.Element {
  const [escrito, setEscrito] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const confirmar = (): void => {
    if (escrito === null) return
    const r = leerMonto(escrito)
    if (r.ok) {
      setError(null)
      setEscrito(null)
      if (r.centimos !== valor) onCambio(r.centimos)
    } else {
      setError(r.error)
    }
  }

  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-1">
        <span className={etiquetaOculta ? 'sr-only' : 'mr-1 font-semibold'}>{etiqueta}</span>
        <span className="font-semibold text-slate-700">S/</span>
        <input
          value={escrito ?? texto(valor)}
          inputMode="decimal"
          onChange={(e) => setEscrito(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              confirmar()
            }
          }}
          aria-invalid={!!error}
          className={`${ancho} rounded-lg border-2 px-2 py-1 text-right text-lg ${error ? 'border-red-700' : 'border-slate-400'}`}
        />
      </label>
      {error && <p className="max-w-60 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  )
}
