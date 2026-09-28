import { useId, useState, type KeyboardEvent } from 'react'
import { fuerzaDeContrasena, NOMBRE_FUERZA, problemaDeContrasena, type Fuerza } from '../../../../shared/contrasenas'

interface Props {
  etiqueta: string
  valor: string
  onCambio: (valor: string) => void
  error?: string | null
  autoFocus?: boolean
  /** Muestra el indicador "Muy fácil / Aceptable / Buena" y el motivo si no sirve. */
  conIndicador?: boolean
  autoComplete?: 'current-password' | 'new-password' | 'off'
}

/** Contraseña con botón para mostrarla y aviso de Bloq Mayús activado. */
export default function CampoContrasena({
  etiqueta,
  valor,
  onCambio,
  error,
  autoFocus,
  conIndicador,
  autoComplete = 'current-password'
}: Props): React.JSX.Element {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const [mayusculas, setMayusculas] = useState(false)
  const revisarMayusculas = (e: KeyboardEvent<HTMLInputElement>): void => setMayusculas(e.getModifierState('CapsLock'))

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          onKeyDown={revisarMayusculas}
          onKeyUp={revisarMayusculas}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-invalid={!!error}
          className={`w-full rounded-lg border-2 bg-white px-3 py-2 text-lg text-slate-900 focus:border-blue-700 ${
            error ? 'border-red-700' : 'border-slate-400'
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
          aria-pressed={visible}
          className="rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg whitespace-nowrap hover:bg-slate-100"
        >
          {visible ? '🙈 Ocultar' : '👁 Ver'}
        </button>
      </div>
      {mayusculas && <p className="text-base font-semibold text-amber-800">⚠ Las mayúsculas están activadas (Bloq Mayús).</p>}
      {conIndicador && valor && <IndicadorFuerza contrasena={valor} />}
      {error && <p className="text-base font-semibold text-red-700">{error}</p>}
    </div>
  )
}

const COLOR: Record<Fuerza, string> = {
  muy_facil: 'bg-red-600',
  aceptable: 'bg-amber-500',
  buena: 'bg-green-600'
}
const ANCHO: Record<Fuerza, string> = { muy_facil: 'w-1/3', aceptable: 'w-2/3', buena: 'w-full' }

export function IndicadorFuerza({ contrasena }: { contrasena: string }): React.JSX.Element {
  const fuerza = fuerzaDeContrasena(contrasena)
  const problema = problemaDeContrasena(contrasena)
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="h-2 w-full rounded bg-slate-200" aria-hidden>
        <div className={`h-2 rounded ${COLOR[fuerza]} ${ANCHO[fuerza]}`} />
      </div>
      <p className="text-base">
        Seguridad: <strong>{NOMBRE_FUERZA[fuerza]}</strong>
        {problema && <span className="text-slate-700"> — {problema}</span>}
      </p>
    </div>
  )
}

/** Valida una contraseña nueva escrita dos veces. Devuelve el mensaje de error o null. */
export function errorDeNueva(nueva: string, repetida: string): string | null {
  const problema = problemaDeContrasena(nueva)
  if (problema) return problema
  if (nueva !== repetida) return 'Las dos contraseñas no son iguales. Escríbala otra vez.'
  return null
}
