import { useRef, useState, type FormEvent } from 'react'
import { NOMBRE_CUENTA, type Cuenta } from '../../../../shared/contrasenas'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CampoTexto } from '../ui/Campos'
import { CodigoGrande, MarcoAcceso } from './AsistentePrimerUso'
import CampoContrasena, { errorDeNueva } from './CampoContrasena'
import type { MotivoSalida } from './Sesion'

type Modo = 'ingreso' | 'recuperar' | 'codigoNuevo'

const MENSAJE_MOTIVO: Record<Exclude<MotivoSalida, null>, string> = {
  inactividad: 'La sesión de la dueña se cerró sola porque no hubo actividad por 10 minutos.',
  cerrada: 'La sesión se cerró. Vuelva a ingresar.'
}

/** Ingreso: se elige la cuenta (Dueña o Trabajadores) y se escribe la contraseña. */
export default function PantallaIngreso({ motivo, onIngreso }: { motivo: MotivoSalida; onIngreso: () => void }): React.JSX.Element {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [modo, setModo] = useState<Modo>('ingreso')
  const [contrasena, setContrasena] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nueva, setNueva] = useState({ nueva: '', repetida: '' })
  const [codigoNuevo, setCodigoNuevo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ayudaTrabajadores, setAyudaTrabajadores] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)

  const elegir = (c: Cuenta): void => {
    setCuenta(c)
    setContrasena('')
    setError(null)
    setAyudaTrabajadores(false)
    // Llevar el cursor a la contraseña apenas se elige la cuenta.
    requestAnimationFrame(() => formulario.current?.querySelector<HTMLInputElement>('input[type=password]')?.focus())
  }

  const ingresar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!cuenta) return setError('Elija primero con qué cuenta va a entrar.')
    if (!contrasena) return setError('Escriba la contraseña.')
    setOcupado(true)
    try {
      await llamar(window.api.acceso.ingresar(cuenta, contrasena))
      onIngreso()
    } catch (error) {
      setError(mensajeDe(error))
      setContrasena('')
      setOcupado(false)
    }
  }

  const recuperar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!codigo.trim()) return setError('Escriba el código de recuperación que anotó en papel.')
    const err = errorDeNueva(nueva.nueva, nueva.repetida)
    if (err) return setError(err)
    setOcupado(true)
    try {
      setCodigoNuevo(await llamar(window.api.acceso.recuperar(codigo, nueva.nueva)))
      setError(null)
      setModo('codigoNuevo')
    } catch (error) {
      setError(mensajeDe(error))
    } finally {
      setOcupado(false)
    }
  }

  const errorVisible = error && (
    <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg text-red-800">
      {error}
    </p>
  )

  if (modo === 'codigoNuevo') {
    return (
      <MarcoAcceso titulo="Contraseña cambiada">
        <p className="text-lg">
          Su contraseña nueva ya está lista. El código que usó <strong>ya no sirve</strong>; este es el nuevo:
        </p>
        <CodigoGrande codigo={codigoNuevo} />
        <p className="mb-4 text-lg font-semibold text-red-800">Anótelo en papel ahora y guárdelo. No se volverá a mostrar.</p>
        <Boton onClick={onIngreso} className="w-full">
          Ya lo anoté, entrar
        </Boton>
      </MarcoAcceso>
    )
  }

  if (modo === 'recuperar') {
    return (
      <MarcoAcceso titulo="Recuperar la contraseña de la dueña">
        <form onSubmit={recuperar} className="flex flex-col gap-4">
          <CampoTexto
            etiqueta="Código de recuperación (el que anotó en papel)"
            valor={codigo}
            onCambio={(v) => setCodigo(v.toUpperCase())}
            entrada={{ autoFocus: true, autoComplete: 'off', spellCheck: false }}
          />
          <CampoContrasena
            etiqueta="Contraseña nueva"
            valor={nueva.nueva}
            onCambio={(v) => setNueva({ ...nueva, nueva: v })}
            conIndicador
            autoComplete="new-password"
          />
          <CampoContrasena
            etiqueta="Repita la contraseña nueva"
            valor={nueva.repetida}
            onCambio={(v) => setNueva({ ...nueva, repetida: v })}
            autoComplete="new-password"
          />
          {errorVisible}
          <p className="text-base text-slate-700">
            Si también perdió el código, pida ayuda a quien le instaló el programa: puede darle un código nuevo sin tocar sus datos.
          </p>
          <div className="flex justify-between gap-3">
            <Boton
              variante="secundario"
              onClick={() => {
                setError(null)
                setModo('ingreso')
              }}
            >
              ← Volver
            </Boton>
            <Boton type="submit" disabled={ocupado}>
              Cambiar y entrar
            </Boton>
          </div>
        </form>
      </MarcoAcceso>
    )
  }

  return (
    <MarcoAcceso titulo="Ingresar al sistema">
      {motivo && (
        <p role="status" className="mb-4 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-lg">
          {MENSAJE_MOTIVO[motivo]}
        </p>
      )}
      <form ref={formulario} onSubmit={ingresar} className="flex flex-col gap-4">
        <div role="group" aria-label="¿Quién va a entrar?" className="grid grid-cols-2 gap-3">
          {(['duena', 'trabajadores'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cuenta === c}
              onClick={() => elegir(c)}
              className={`rounded-xl border-4 px-4 py-5 text-2xl font-bold ${
                cuenta === c ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden>{c === 'duena' ? '👑 ' : '🧵 '}</span>
              {NOMBRE_CUENTA[c]}
            </button>
          ))}
        </div>
        {cuenta && (
          <CampoContrasena etiqueta={cuenta === 'duena' ? 'Contraseña de la dueña' : 'Contraseña de Trabajadores'} valor={contrasena} onCambio={setContrasena} />
        )}
        {errorVisible}
        <Boton type="submit" disabled={ocupado || !cuenta} className="w-full">
          Entrar
        </Boton>
        {cuenta && (
          <button
            type="button"
            className="self-center text-lg text-blue-800 underline"
            onClick={() => {
              setError(null)
              if (cuenta === 'duena') setModo('recuperar')
              else setAyudaTrabajadores(true)
            }}
          >
            ¿Olvidó su contraseña?
          </button>
        )}
        {ayudaTrabajadores && (
          <p role="status" className="rounded-lg bg-slate-100 p-3 text-lg">
            Pídale a la dueña que le asigne una contraseña nueva desde <strong>Configuración</strong>.
          </p>
        )}
      </form>
    </MarcoAcceso>
  )
}
