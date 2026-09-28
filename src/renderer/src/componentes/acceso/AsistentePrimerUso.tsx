import { useState, type FormEvent, type ReactNode } from 'react'
import { NOMBRE_TIENDA } from '../../../../shared/constantes'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CampoTexto } from '../ui/Campos'
import CampoContrasena, { errorDeNueva } from './CampoContrasena'

type Paso = 'duena' | 'trabajadores' | 'codigo' | 'confirmar'
const PASOS: Paso[] = ['duena', 'trabajadores', 'codigo', 'confirmar']

/** Pantalla centrada para el ingreso y el primer uso. */
export function MarcoAcceso({ titulo, children }: { titulo: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto bg-slate-900 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-xl">
        <p className="text-center text-2xl font-bold text-slate-900">{NOMBRE_TIENDA}</p>
        <h1 className="mt-1 mb-6 text-center text-xl text-slate-700">{titulo}</h1>
        {children}
      </div>
    </div>
  )
}

/** Código de recuperación en letra grande, fácil de copiar a mano. */
export function CodigoGrande({ codigo }: { codigo: string }): React.JSX.Element {
  return (
    <p
      aria-label="Código de recuperación"
      className="my-4 rounded-lg border-4 border-dashed border-amber-500 bg-amber-50 py-4 text-center font-mono text-4xl font-bold tracking-widest text-slate-900 select-all"
    >
      {codigo}
    </p>
  )
}

/**
 * Primer uso: la dueña elige su contraseña y la de Trabajadores, y anota el código de recuperación.
 * No hay contraseñas por defecto: sin este paso nadie puede entrar.
 */
export default function AsistentePrimerUso({ onListo }: { onListo: () => void }): React.JSX.Element {
  const [paso, setPaso] = useState<Paso>('duena')
  const [duena, setDuena] = useState({ nueva: '', repetida: '' })
  const [trab, setTrab] = useState({ nueva: '', repetida: '' })
  const [codigo, setCodigo] = useState('')
  const [confirmado, setConfirmado] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const ir = (p: Paso): void => {
    setError(null)
    setPaso(p)
  }

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (paso === 'duena') {
      const err = errorDeNueva(duena.nueva, duena.repetida)
      return err ? setError(err) : ir('trabajadores')
    }
    if (paso === 'trabajadores') {
      const err =
        errorDeNueva(trab.nueva, trab.repetida) ??
        (trab.nueva === duena.nueva ? 'La contraseña de Trabajadores debe ser distinta de la de la dueña.' : null)
      if (err) return setError(err)
      setOcupado(true)
      try {
        setCodigo(await llamar(window.api.acceso.prepararCodigo()))
        ir('codigo')
      } catch (error) {
        setError(mensajeDe(error))
      } finally {
        setOcupado(false)
      }
      return
    }
    if (paso === 'codigo') return ir('confirmar')
    setOcupado(true)
    try {
      await llamar(
        window.api.acceso.crearCuentas({
          contrasenaDuena: duena.nueva,
          contrasenaTrabajadores: trab.nueva,
          codigoConfirmado: confirmado
        })
      )
      onListo()
    } catch (error) {
      setError(mensajeDe(error))
      setOcupado(false)
    }
  }

  const numero = PASOS.indexOf(paso) + 1
  return (
    <MarcoAcceso titulo={`Bienvenida · Paso ${numero} de ${PASOS.length}`}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        {paso === 'duena' && (
          <>
            <p className="text-lg">
              Primero, elija <strong>la contraseña de la dueña</strong>. Con ella se ven los reportes, se cambia la configuración y se
              autorizan las acciones importantes.
            </p>
            <CampoContrasena
              etiqueta="Contraseña de la dueña"
              valor={duena.nueva}
              onCambio={(nueva) => setDuena({ ...duena, nueva })}
              conIndicador
              autoFocus
              autoComplete="new-password"
            />
            <CampoContrasena
              etiqueta="Repita la contraseña de la dueña"
              valor={duena.repetida}
              onCambio={(repetida) => setDuena({ ...duena, repetida })}
              autoComplete="new-password"
            />
          </>
        )}
        {paso === 'trabajadores' && (
          <>
            <p className="text-lg">
              Ahora, la contraseña de la cuenta <strong>Trabajadores</strong>, que usan todas las personas que atienden en la tienda. Debe
              ser distinta de la suya.
            </p>
            <CampoContrasena
              etiqueta="Contraseña de Trabajadores"
              valor={trab.nueva}
              onCambio={(nueva) => setTrab({ ...trab, nueva })}
              conIndicador
              autoFocus
              autoComplete="new-password"
            />
            <CampoContrasena
              etiqueta="Repita la contraseña de Trabajadores"
              valor={trab.repetida}
              onCambio={(repetida) => setTrab({ ...trab, repetida })}
              autoComplete="new-password"
            />
          </>
        )}
        {paso === 'codigo' && (
          <>
            <p className="text-lg">
              Este es su <strong>código de recuperación</strong>. Sirve para entrar si algún día olvida su contraseña.
            </p>
            <CodigoGrande codigo={codigo} />
            <p className="text-lg font-semibold text-red-800">
              Anótelo en papel ahora y guárdelo en un lugar seguro. No se volverá a mostrar.
            </p>
          </>
        )}
        {paso === 'confirmar' && (
          <>
            <p className="text-lg">Para comprobar que lo anotó bien, escriba el código mirando su papel.</p>
            <CampoTexto
              etiqueta="Código de recuperación"
              valor={confirmado}
              onCambio={(v) => setConfirmado(v.toUpperCase())}
              ayuda="Puede escribirlo con o sin guiones."
              entrada={{ autoFocus: true, autoComplete: 'off', spellCheck: false }}
            />
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg text-red-800">
            {error}
          </p>
        )}

        <div className="flex justify-between gap-3">
          {paso === 'trabajadores' && (
            <Boton variante="secundario" onClick={() => ir('duena')}>
              ← Atrás
            </Boton>
          )}
          {paso === 'confirmar' && (
            <Boton variante="secundario" onClick={() => ir('codigo')}>
              ← Ver el código otra vez
            </Boton>
          )}
          <Boton type="submit" disabled={ocupado} className="ml-auto">
            {paso === 'codigo' ? 'Ya lo anoté' : paso === 'confirmar' ? 'Crear las cuentas y entrar' : 'Siguiente →'}
          </Boton>
        </div>
      </form>
    </MarcoAcceso>
  )
}
