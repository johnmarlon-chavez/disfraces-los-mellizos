import { useEffect, useState, type FormEvent } from 'react'
import { NOMBRE_TIENDA } from '../../../../shared/constantes'
import { formatearFecha, formatearHora } from '../../../../shared/formato'
import type { EstadoVersionNueva, RespaldoCompatible } from '../../../../shared/respaldos'
import { problemaDeClaveSoporte, type EstadoSoporte } from '../../../../shared/soporte'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CodigoGrande, MarcoAcceso } from './AsistentePrimerUso'
import CampoContrasena from './CampoContrasena'

export type ModoSoporte = 'restablecer' | 'definir-clave' | 'version-nueva'

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
  return modo === 'version-nueva' ? <VersionNueva /> : <Herramienta modo={modo} />
}

function Herramienta({ modo }: { modo: Exclude<ModoSoporte, 'version-nueva'> }): React.JSX.Element {
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
  const [contrasenaDuena, setContrasenaDuena] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const cambiar = estado.claveDefinida
  // Primera definición con las cuentas ya creadas: la autoriza la dueña con su contraseña.
  const pideDuena = !cambiar && estado.hayCuentas

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    // Mismo orden que el main: primero el formato de la clave nueva, luego la autorización.
    const problema = problemaDeClaveSoporte(nueva) ?? (nueva !== repetida ? 'Las dos claves no son iguales. Escríbala otra vez.' : null)
    if (problema) return setError(problema)
    if (cambiar && !actual) return setError('Escriba la clave de soporte actual.')
    if (pideDuena && !contrasenaDuena) return setError('Pídale a la dueña que escriba su contraseña.')
    setOcupado(true)
    try {
      await llamar(
        window.api.soporte.definirClave({
          actual: cambiar ? actual : null,
          contrasenaDuena: pideDuena ? contrasenaDuena : null,
          nueva
        })
      )
      setListo(true)
    } catch (error) {
      setError(mensajeDe(error))
      setActual('')
      setContrasenaDuena('')
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
        {pideDuena && (
          <>
            <p className="rounded-lg bg-amber-50 p-3 text-lg">
              🔒 Las cuentas ya fueron creadas: la dueña debe autorizar la clave de soporte escribiendo su contraseña.
            </p>
            <CampoContrasena etiqueta="Contraseña de la dueña" valor={contrasenaDuena} onCambio={setContrasenaDuena} autoFocus autoComplete="off" />
          </>
        )}
        <CampoContrasena
          etiqueta="Clave de soporte nueva"
          valor={nueva}
          onCambio={setNueva}
          autoFocus={!cambiar && !pideDuena}
          autoComplete="new-password"
        />
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

const fechaHora = (iso: string): string => `${formatearFecha(new Date(iso))} a las ${formatearHora(new Date(iso))}`

/**
 * Se instaló una versión anterior del programa y los datos son de una más nueva: esta versión no
 * puede usarlos. El técnico, con la clave de soporte, vuelve a un respaldo compatible
 * (normalmente el "antes de actualizar"). Antes se guarda un respaldo del estado actual.
 */
function VersionNueva(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoVersionNueva | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegido, setElegido] = useState<RespaldoCompatible | null>(null)
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    document.title = `${NOMBRE_TIENDA} · Soporte`
    window.api.soporte.versionNueva().then((r) => (r.ok ? setEstado(r.datos) : setError(r.error)))
  }, [])

  const volver = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!elegido) return setError('Elija el respaldo al que quiere volver.')
    if (!clave) return setError('Escriba la clave de soporte.')
    setOcupado(true)
    setError(null)
    try {
      await llamar(window.api.soporte.volverARespaldo(elegido.ruta, clave))
      setListo(true)
    } catch (err) {
      setError(mensajeDe(err))
      setClave('')
      setOcupado(false)
    }
  }

  if (listo) {
    return (
      <MarcoAcceso titulo="Datos recuperados">
        <p role="status" className="text-lg">
          Listo. El programa se está reiniciando con los datos del {elegido && fechaHora(elegido.fecha)}.
        </p>
      </MarcoAcceso>
    )
  }
  if (!estado) {
    return (
      <MarcoAcceso titulo="Datos de una versión más nueva">
        {error ? <MensajeError texto={error} /> : <p className="text-lg">Cargando…</p>}
      </MarcoAcceso>
    )
  }
  const antesDeActualizar = estado.respaldos.filter((r) => r.antesDeActualizarA)
  const otros = estado.respaldos.filter((r) => !r.antesDeActualizarA)

  const opcion = (r: RespaldoCompatible): React.JSX.Element => (
    <li key={r.archivo}>
      <label className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-2 ${elegido?.archivo === r.archivo ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}>
        <input type="radio" name="respaldo" className="mt-1.5 size-5" checked={elegido?.archivo === r.archivo} onChange={() => setElegido(r)} />
        <span>
          <strong>{fechaHora(r.fecha)}</strong>
          {r.antesDeActualizarA && <> · antes de actualizar a {r.antesDeActualizarA}</>}
          <span className="block text-base text-slate-600">
            Programa {r.versionPrograma} · {r.conteos.clientes} clientes, {r.conteos.pedidos} pedidos, {r.conteos.fotos} fotos
          </span>
        </span>
      </label>
    </li>
  )

  return (
    <MarcoAcceso titulo="Datos de una versión más nueva">
      <form onSubmit={volver} className="flex flex-col gap-4">
        <p className="text-lg">
          Estos datos se guardaron con una versión más nueva del programa, y esta versión ({estado.versionPrograma}) no puede usarlos.
        </p>
        <p className="rounded-lg bg-slate-100 p-3 text-base">
          <strong>Si instaló esta versión a propósito para volver atrás:</strong> elija un respaldo y escriba la clave de soporte. Se
          perderá lo registrado después de ese respaldo (antes se guarda una copia del estado actual). Las contraseñas no cambian.
          <br />
          <strong>Si no:</strong> cierre esta ventana e instale de nuevo la versión más nueva.
        </p>
        {estado.respaldos.length === 0 ? (
          <MensajeError texto="No hay respaldos que esta versión pueda abrir. Instale de nuevo la versión más nueva." />
        ) : (
          <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto text-lg" aria-label="Respaldos compatibles">
            {antesDeActualizar.map(opcion)}
            {otros.map(opcion)}
          </ul>
        )}
        {!estado.claveDefinida && <MensajeError texto="La clave de soporte no fue definida en este equipo. Sin ella no se puede volver atrás." />}
        {estado.respaldos.length > 0 && estado.claveDefinida && (
          <CampoContrasena etiqueta="Clave de soporte" valor={clave} onCambio={setClave} autoComplete="off" />
        )}
        <MensajeError texto={error} />
        <div className="flex justify-between gap-3">
          <Boton variante="secundario" onClick={cerrar}>
            Cerrar
          </Boton>
          {estado.respaldos.length > 0 && estado.claveDefinida && (
            <Boton type="submit" variante="peligro" disabled={ocupado}>
              Volver a este respaldo
            </Boton>
          )}
        </div>
      </form>
    </MarcoAcceso>
  )
}
