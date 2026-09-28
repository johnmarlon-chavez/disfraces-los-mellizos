import { useEffect, useState, type FormEvent } from 'react'
import { NOMBRE_TIENDA } from '../../../../shared/constantes'
import { problemaDeClaveSoporte, type EstadoSoporte } from '../../../../shared/soporte'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CodigoGrande, MarcoAcceso } from './AsistentePrimerUso'
import CampoContrasena from './CampoContrasena'

export type ModoSoporte = 'restablecer' | 'definir-clave'

function MensajeError({ texto }: { texto: string | null }): React.JSX.Element | null {
  if (!texto) return null
  return (
    <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg text-red-800">
      {texto}
    </p>
  )
}

const cerrar = (): void => window.close()

/** Ventana de las herramientas de soporte. Solo funciona con la clave de soporte. */
export default function PantallaSoporte({ modo }: { modo: ModoSoporte }): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoSoporte | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${NOMBRE_TIENDA} · Soporte`
    window.api.soporte.estado().then((r) => (r.ok ? setEstado(r.datos) : setError(r.error)))
  }, [])

  if (!estado) {
    return (
      <MarcoAcceso titulo="Soporte técnico">
        {error ? <MensajeError texto={error} /> : <p className="text-lg">Cargando…</p>}
      </MarcoAcceso>
    )
  }
  return modo === 'restablecer' ? <Restablecer estado={estado} /> : <DefinirClave estado={estado} />
}

function Restablecer({ estado }: { estado: EstadoSoporte }): React.JSX.Element {
  const [clave, setClave] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!clave) return setError('Escriba la clave de soporte.')
    setOcupado(true)
    try {
      setCodigo(await llamar(window.api.soporte.restablecer(clave)))
      setError(null)
    } catch (error) {
      setError(mensajeDe(error))
      setClave('')
    } finally {
      setOcupado(false)
    }
  }

  if (!estado.hayCuentas || !estado.claveDefinida) {
    return (
      <MarcoAcceso titulo="Restablecer el acceso de la dueña">
        <MensajeError
          texto={
            !estado.hayCuentas
              ? 'Todavía no se crearon las cuentas. Abra el programa normalmente.'
              : 'La clave de soporte no fue definida en este equipo. Sin ella, esta herramienta no hace nada.'
          }
        />
        <Boton variante="secundario" onClick={cerrar} className="mt-4 w-full">
          Cerrar
        </Boton>
      </MarcoAcceso>
    )
  }

  if (codigo) {
    return (
      <MarcoAcceso titulo="Código de recuperación nuevo">
        <CodigoGrande codigo={codigo} />
        <p className="text-lg">
          La dueña debe anotarlo en papel. Luego abre el programa, elige <strong>Dueña</strong> → <strong>¿Olvidó su contraseña?</strong>,
          escribe este código y elige una contraseña nueva. El código anterior ya no sirve.
        </p>
        <p className="mt-2 text-base text-slate-700">Al ingresar, la dueña verá un aviso de que su acceso fue restablecido por soporte.</p>
        <Boton onClick={cerrar} className="mt-4 w-full">
          Ya lo anotó, cerrar
        </Boton>
      </MarcoAcceso>
    )
  }

  return (
    <MarcoAcceso titulo="Restablecer el acceso de la dueña">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <p className="text-lg">
          Solo para el técnico. Genera un código de recuperación nuevo para la dueña; no cambia ninguna contraseña ni ningún dato.
        </p>
        <CampoContrasena etiqueta="Clave de soporte" valor={clave} onCambio={setClave} autoFocus autoComplete="off" />
        <MensajeError texto={error} />
        <div className="flex justify-between gap-3">
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={ocupado}>
            Generar código nuevo
          </Boton>
        </div>
      </form>
    </MarcoAcceso>
  )
}

function DefinirClave({ estado }: { estado: EstadoSoporte }): React.JSX.Element {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const cambiar = estado.claveDefinida

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (cambiar && !actual) return setError('Escriba la clave de soporte actual.')
    const problema = problemaDeClaveSoporte(nueva) ?? (nueva !== repetida ? 'Las dos claves no son iguales. Escríbala otra vez.' : null)
    if (problema) return setError(problema)
    setOcupado(true)
    try {
      await llamar(window.api.soporte.definirClave(cambiar ? actual : null, nueva))
      setListo(true)
    } catch (error) {
      setError(mensajeDe(error))
      setActual('')
    } finally {
      setOcupado(false)
    }
  }

  if (listo) {
    return (
      <MarcoAcceso titulo="Clave de soporte guardada">
        <p className="text-lg">
          La clave quedó guardada (solo como hash). Guárdela en un lugar seguro: sin ella no se puede restablecer el acceso de la dueña.
        </p>
        <Boton onClick={cerrar} className="mt-4 w-full">
          Cerrar
        </Boton>
      </MarcoAcceso>
    )
  }

  return (
    <MarcoAcceso titulo={cambiar ? 'Cambiar la clave de soporte' : 'Definir la clave de soporte'}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <p className="text-lg">
          Solo para el técnico. Esta clave protege la herramienta que restablece el acceso de la dueña. Debe tener al menos 12
          caracteres y no compartirse con nadie de la tienda.
        </p>
        {cambiar && (
          <CampoContrasena etiqueta="Clave de soporte actual" valor={actual} onCambio={setActual} autoFocus autoComplete="off" />
        )}
        <CampoContrasena etiqueta="Clave de soporte nueva" valor={nueva} onCambio={setNueva} autoFocus={!cambiar} autoComplete="new-password" />
        <CampoContrasena etiqueta="Repita la clave de soporte nueva" valor={repetida} onCambio={setRepetida} autoComplete="new-password" />
        <MensajeError texto={error} />
        <div className="flex justify-between gap-3">
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={ocupado}>
            Guardar clave
          </Boton>
        </div>
      </form>
    </MarcoAcceso>
  )
}
