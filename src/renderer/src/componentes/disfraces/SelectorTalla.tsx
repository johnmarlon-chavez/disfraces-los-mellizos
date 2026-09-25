import { useId, useState } from 'react'
import { TALLAS, normalizarTalla } from '../../../../shared/disfraces'

const OTRA = '__otra__'
const CLASES = 'w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg text-slate-900 focus:border-blue-700'

interface Props {
  valor: string
  onCambio: (talla: string) => void
  autoFocus?: boolean
}

/**
 * Talla de la lista fija (4 … 16, S … XL) u "Otra…", que abre un campo de texto.
 * Lo escrito en "Otra" se normaliza (sin espacios sobrantes, en mayúsculas).
 */
export default function SelectorTalla({ valor, onCambio, autoFocus }: Props): React.JSX.Element {
  const id = useId()
  const enLista = (TALLAS as readonly string[]).includes(normalizarTalla(valor))
  const [otra, setOtra] = useState(() => valor.trim() !== '' && !enLista)
  const normalizada = normalizarTalla(valor)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        Talla
      </label>
      <div className="flex gap-2">
        <select
          id={id}
          autoFocus={autoFocus}
          value={otra ? OTRA : normalizada}
          onChange={(e) => {
            if (e.target.value === OTRA) {
              setOtra(true)
              onCambio('')
            } else {
              setOtra(false)
              onCambio(e.target.value)
            }
          }}
          className={`${CLASES} ${otra ? 'max-w-32' : ''}`}
        >
          <option value="">Elija…</option>
          {TALLAS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={OTRA}>Otra…</option>
        </select>
        {otra && (
          <input
            aria-label="Escriba la otra talla"
            value={valor}
            autoFocus
            placeholder="Ej. XXL"
            onChange={(e) => onCambio(e.target.value)}
            onBlur={() => onCambio(normalizada)}
            className={CLASES}
          />
        )}
      </div>
      {otra && valor !== '' && valor !== normalizada && (
        <p className="text-base text-slate-600">Se guardará como “{normalizada}”.</p>
      )}
    </div>
  )
}
