import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

const CLASES_ENTRADA =
  'w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg text-slate-900 placeholder:text-slate-500 focus:border-blue-700'

interface PropsCampo {
  etiqueta: string
  valor: string
  onCambio: (valor: string) => void
  error?: string | null
  ayuda?: ReactNode
  sugerencias?: string[]
  prefijo?: string
  multilinea?: boolean
  entrada?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>
}

/** Campo con etiqueta visible, mensaje de ayuda y de error. */
export function CampoTexto({
  etiqueta,
  valor,
  onCambio,
  error,
  ayuda,
  sugerencias,
  prefijo,
  multilinea,
  entrada
}: PropsCampo): React.JSX.Element {
  const id = useId()
  const idLista = sugerencias ? `${id}-lista` : undefined
  const idError = error ? `${id}-error` : undefined
  const borde = error ? 'border-red-700' : ''

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {etiqueta}
      </label>
      {multilinea ? (
        <textarea
          id={id}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          rows={2}
          aria-invalid={!!error}
          aria-describedby={idError}
          className={`${CLASES_ENTRADA} ${borde}`}
        />
      ) : (
        <div className="flex items-center gap-2">
          {prefijo && <span className="text-lg font-semibold text-slate-700">{prefijo}</span>}
          <input
            id={id}
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            list={idLista}
            aria-invalid={!!error}
            aria-describedby={idError}
            className={`${CLASES_ENTRADA} ${borde}`}
            {...entrada}
          />
        </div>
      )}
      {sugerencias && (
        <datalist id={idLista}>
          {sugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {ayuda && !error && <p className="text-base text-slate-600">{ayuda}</p>}
      {error && (
        <p id={idError} className="text-base font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

interface PropsSelector {
  etiqueta: string
  valor: string
  onCambio: (valor: string) => void
  opciones: { valor: string; texto: string }[]
}

export function Selector({ etiqueta, valor, onCambio, opciones }: PropsSelector): React.JSX.Element {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {etiqueta}
      </label>
      <select id={id} value={valor} onChange={(e) => onCambio(e.target.value)} className={CLASES_ENTRADA}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  )
}
