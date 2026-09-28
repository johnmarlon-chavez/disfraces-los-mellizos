import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { ResumenSoporte } from '../../../shared/contrasenas'
import type { Configuracion as DatosConfiguracion, InfoApp, ModoMora } from '../../../shared/ipc'
import { formatearFecha, formatearHora, formatearSoles } from '../../../shared/formato'
import { llamar, mensajeDe } from '../api'
import { CodigoGrande } from '../componentes/acceso/AsistentePrimerUso'
import CampoContrasena, { errorDeNueva } from '../componentes/acceso/CampoContrasena'
import PanelRespaldos from '../componentes/respaldos/PanelRespaldos'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton from '../componentes/ui/Boton'
import CampoPrecio from '../componentes/ui/CampoPrecio'
import { useConfirmar } from '../componentes/ui/Confirmacion'
import Dialogo from '../componentes/ui/Dialogo'

interface Estado {
  config: DatosConfiguracion
  info: InfoApp
  soporte: ResumenSoporte
}

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }): React.JSX.Element {
  return (
    <section aria-label={titulo} className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-2xl font-bold">{titulo}</h2>
      {children}
    </section>
  )
}

function Opciones<T extends string | boolean>({
  etiqueta,
  valor,
  onCambio,
  opciones
}: {
  etiqueta: string
  valor: T
  onCambio: (v: T) => void
  opciones: { valor: T; texto: string }[]
}): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-semibold">{etiqueta}</legend>
      {opciones.map((o) => (
        <label key={String(o.valor)} className="flex items-center gap-2 text-lg">
          <input type="radio" className="size-5" checked={valor === o.valor} onChange={() => onCambio(o.valor)} />
          {o.texto}
        </label>
      ))}
    </fieldset>
  )
}

const NOMBRE_MODO: Record<ModoMora, string> = {
  por_unidad: 'Por cada disfraz atrasado',
  por_pedido: 'Una sola vez por pedido'
}

function ReglasDelNegocio({ config, onGuardado }: { config: DatosConfiguracion; onGuardado: () => void }): React.JSX.Element {
  const confirmar = useConfirmar()
  const avisos = useAvisos()
  const [datos, setDatos] = useState({
    moraPorDia: config.moraPorDia,
    modoMora: config.modoMora,
    diasMargenLavado: String(config.diasMargenLavado),
    precioPorDia: config.precioPorDia
  })
  const dias = Number(datos.diasMargenLavado)
  const diasValidos = /^\d+$/.test(datos.diasMargenLavado.trim()) && dias <= 14
  const cambiado =
    datos.moraPorDia !== config.moraPorDia ||
    datos.modoMora !== config.modoMora ||
    dias !== config.diasMargenLavado ||
    datos.precioPorDia !== config.precioPorDia

  const guardar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!diasValidos) return
    const ok = await confirmar({
      titulo: '¿Guardar los cambios?',
      mensaje: (
        <ul className="list-disc pl-6">
          <li>Mora por día: {formatearSoles(datos.moraPorDia)} ({NOMBRE_MODO[datos.modoMora].toLowerCase()})</li>
          <li>Días para lavado: {dias}</li>
          <li>Precio del alquiler: {datos.precioPorDia ? 'por día' : 'por evento'}</li>
          <li className="mt-2 list-none text-base text-slate-700">
            Se aplica desde ahora. Los precios de los pedidos ya registrados no cambian.
          </li>
        </ul>
      ),
      textoConfirmar: 'Sí, guardar'
    })
    if (!ok) return
    try {
      await llamar(
        window.api.config.actualizar({
          moraPorDia: datos.moraPorDia,
          modoMora: datos.modoMora,
          diasMargenLavado: dias,
          precioPorDia: datos.precioPorDia
        })
      )
      avisos.exito('Configuración guardada.')
      onGuardado()
    } catch (error) {
      avisos.error(mensajeDe(error))
    }
  }

  return (
    <Tarjeta titulo="Reglas del negocio">
      <form onSubmit={guardar} className="flex flex-col gap-5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          <div className="flex flex-col gap-4">
            <CampoPrecio etiqueta="Mora por día de retraso" valor={datos.moraPorDia} onCambio={(moraPorDia) => setDatos({ ...datos, moraPorDia })} />
            <Opciones
              etiqueta="¿Cómo se cobra la mora?"
              valor={datos.modoMora}
              onCambio={(modoMora) => setDatos({ ...datos, modoMora })}
              opciones={(['por_unidad', 'por_pedido'] as const).map((v) => ({ valor: v, texto: NOMBRE_MODO[v] }))}
            />
          </div>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Días para lavado después de la devolución</span>
              <input
                type="number"
                min={0}
                max={14}
                value={datos.diasMargenLavado}
                onChange={(e) => setDatos({ ...datos, diasMargenLavado: e.target.value })}
                aria-invalid={!diasValidos}
                className="w-28 rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg"
              />
              {!diasValidos && <span className="text-base font-semibold text-red-700">Escriba un número entero entre 0 y 14.</span>}
              <span className="text-base text-slate-600">Un traje que vuelve no se puede volver a alquilar hasta pasados estos días.</span>
            </label>
            <Opciones
              etiqueta="Precio del alquiler"
              valor={datos.precioPorDia}
              onCambio={(precioPorDia) => setDatos({ ...datos, precioPorDia })}
              opciones={[
                { valor: false, texto: 'Por evento (un solo precio)' },
                { valor: true, texto: 'Por día (se multiplica por los días)' }
              ]}
            />
          </div>
        </div>
        <div>
          <Boton type="submit" disabled={!cambiado || !diasValidos}>
            Guardar cambios
          </Boton>
        </div>
      </form>
    </Tarjeta>
  )
}

function CambiarContrasena({ cuenta }: { cuenta: 'duena' | 'trabajadores' }): React.JSX.Element {
  const avisos = useAvisos()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const esDuena = cuenta === 'duena'

  const guardar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (esDuena && !actual) return setError('Escriba su contraseña actual.')
    const err = errorDeNueva(nueva, repetida)
    if (err) return setError(err)
    setOcupado(true)
    try {
      await llamar(
        esDuena ? window.api.acceso.cambiarMiContrasena(actual, nueva) : window.api.acceso.cambiarContrasenaTrabajadores(nueva)
      )
      avisos.exito(esDuena ? 'Su contraseña fue cambiada.' : 'La contraseña de Trabajadores fue cambiada. Avísele al personal.')
      setActual('')
      setNueva('')
      setRepetida('')
      setError(null)
    } catch (error) {
      setError(mensajeDe(error))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={guardar} aria-label={esDuena ? 'Mi contraseña' : 'Contraseña de Trabajadores'} className="flex flex-col gap-3">
      <h3 className="text-xl font-bold">{esDuena ? 'Mi contraseña (dueña)' : 'Contraseña de Trabajadores'}</h3>
      {!esDuena && (
        <p className="text-base text-slate-700">Por ejemplo, cuando alguien deja de trabajar en la tienda. No hace falta la anterior.</p>
      )}
      {esDuena && <CampoContrasena etiqueta="Contraseña actual" valor={actual} onCambio={setActual} />}
      <CampoContrasena etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} conIndicador autoComplete="new-password" />
      <CampoContrasena etiqueta="Repita la contraseña nueva" valor={repetida} onCambio={setRepetida} autoComplete="new-password" />
      {error && (
        <p role="alert" className="text-lg font-semibold text-red-700">
          {error}
        </p>
      )}
      <div>
        <Boton type="submit" disabled={ocupado}>
          Cambiar contraseña
        </Boton>
      </div>
    </form>
  )
}

function NuevoCodigo(): React.JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const [contrasena, setContrasena] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cerrar = (): void => {
    setAbierto(false)
    setContrasena('')
    setCodigo(null)
    setError(null)
  }
  const generar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      setCodigo(await llamar(window.api.acceso.nuevoCodigo(contrasena)))
      setError(null)
    } catch (error) {
      setError(mensajeDe(error))
      setContrasena('')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xl font-bold">Código de recuperación</h3>
      <p className="text-base text-slate-700">
        Si perdió el papel con su código, genere uno nuevo. El anterior dejará de servir.
      </p>
      <div>
        <Boton variante="secundario" onClick={() => setAbierto(true)}>
          Generar código nuevo
        </Boton>
      </div>
      {abierto && (
        <Dialogo
          titulo="Código de recuperación nuevo"
          onCerrar={cerrar}
          pie={
            <div className="flex justify-end gap-3">
              {codigo ? (
                <Boton onClick={cerrar}>Ya lo anoté</Boton>
              ) : (
                <>
                  <Boton variante="secundario" onClick={cerrar}>
                    No, volver
                  </Boton>
                  <Boton type="submit" form="form-nuevo-codigo">
                    Generar
                  </Boton>
                </>
              )}
            </div>
          }
        >
          {codigo ? (
            <>
              <CodigoGrande codigo={codigo} />
              <p className="text-lg font-semibold text-red-800">Anótelo en papel ahora y guárdelo. No se volverá a mostrar.</p>
            </>
          ) : (
            <form id="form-nuevo-codigo" onSubmit={generar} className="flex flex-col gap-3">
              <p className="text-lg">Para generar un código nuevo, escriba su contraseña.</p>
              <CampoContrasena etiqueta="Contraseña de la dueña" valor={contrasena} onCambio={setContrasena} error={error} autoFocus />
            </form>
          )}
        </Dialogo>
      )}
    </div>
  )
}

export default function Configuracion(): React.JSX.Element {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    Promise.all([window.api.config.obtener(), window.api.app.info(), window.api.acceso.resumenSoporte()]).then(([config, info, soporte]) => {
      if (!vigente) return
      if (!config.ok) return setError(config.error)
      if (!info.ok) return setError(info.error)
      if (!soporte.ok) return setError(soporte.error)
      setEstado({ config: config.datos, info: info.datos, soporte: soporte.datos })
    })
    return () => {
      vigente = false
    }
  }, [version])

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Configuración</h1>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {error}
        </p>
      )}

      {!estado && !error && <p className="text-lg">Cargando…</p>}

      {estado && (
        <>
          {/* La key cambia cuando llegan los valores guardados: el formulario se reinicia con ellos. */}
          <ReglasDelNegocio key={JSON.stringify(estado.config)} config={estado.config} onGuardado={() => setVersion((v) => v + 1)} />

          <Tarjeta titulo="Respaldos">
            <PanelRespaldos />
          </Tarjeta>

          <Tarjeta titulo="Cuentas y contraseñas">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
              <CambiarContrasena cuenta="duena" />
              <div className="flex flex-col gap-8">
                <CambiarContrasena cuenta="trabajadores" />
                <NuevoCodigo />
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Información">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-3 text-lg">
              <dt className="font-semibold">Nombre de la tienda</dt>
              <dd>{estado.config.nombreTienda}</dd>
              <dt className="font-semibold">Carpeta de datos</dt>
              <dd className="break-all">
                {estado.info.carpetaDatos}{' '}
                <button
                  type="button"
                  className="text-base text-blue-800 underline"
                  onClick={() => void window.api.respaldos.abrirCarpeta('datos')}
                >
                  Abrir
                </button>
                <span className="block text-base text-slate-600">No se sincroniza con la nube a propósito: la base de datos no debe subirse mientras se usa.</span>
              </dd>
              <dt className="font-semibold">Versión del programa</dt>
              <dd>{estado.info.version}</dd>
              <dt className="font-semibold">Clave de soporte</dt>
              <dd>
                {estado.soporte.claveDefinida ? (
                  'Definida por su técnico'
                ) : (
                  <span className="font-semibold text-amber-800">No definida: pida a su técnico que la defina.</span>
                )}
              </dd>
              <dt className="font-semibold">Último restablecimiento por soporte</dt>
              <dd>
                {estado.soporte.ultimoRestablecimiento
                  ? `${formatearFecha(new Date(estado.soporte.ultimoRestablecimiento))} a las ${formatearHora(new Date(estado.soporte.ultimoRestablecimiento))}`
                  : 'Nunca'}
              </dd>
            </dl>
          </Tarjeta>
        </>
      )}
    </section>
  )
}
