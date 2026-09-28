import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatearFecha, formatearHora } from '../../../../shared/formato'
import { NOMBRE_NUBE, type ArchivoRespaldo, type EstadoRespaldos, type VistaRestauracion } from '../../../../shared/respaldos'
import { llamar, mensajeDe } from '../../api'
import CampoContrasena from '../acceso/CampoContrasena'
import { useAvisos } from '../ui/Avisos'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'

const fechaHora = (iso: string): string => `${formatearFecha(new Date(iso))} a las ${formatearHora(new Date(iso))}`
const megas = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Panel "Respaldos" de Configuración (solo la dueña). */
export default function PanelRespaldos(): React.JSX.Element {
  const avisos = useAvisos()
  const [e, setE] = useState<EstadoRespaldos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [restaurando, setRestaurando] = useState(false)

  const cargar = useCallback(() => {
    window.api.respaldos.estado().then((r) => (r.ok ? setE(r.datos) : setError(r.error)))
  }, [])
  useEffect(() => cargar(), [cargar])

  const accion = async (fn: () => Promise<void>): Promise<void> => {
    setOcupado(true)
    try {
      await fn()
    } catch (err) {
      avisos.error(mensajeDe(err))
    } finally {
      setOcupado(false)
      cargar()
    }
  }

  const hacerAhora = (): Promise<void> =>
    accion(async () => {
      const r = await llamar(window.api.respaldos.hacerAhora())
      if (r.nube && !r.nube.ok) avisos.error(`Se guardó en esta computadora, pero no en la nube: ${r.nube.error}.`)
      else if (!r.local.ok) avisos.error(`No se pudo guardar el respaldo: ${r.local.error}.`)
      else avisos.exito(r.nube ? 'Respaldo guardado y verificado, en la nube y en esta computadora.' : 'Respaldo guardado y verificado en esta computadora.')
    })
  const elegirCarpeta = (): Promise<void> =>
    accion(async () => {
      const carpeta = await llamar(window.api.respaldos.elegirCarpeta())
      if (carpeta) avisos.exito('Carpeta de respaldos guardada.')
    })
  const usarCarpeta = (ruta: string): Promise<void> =>
    accion(async () => {
      await llamar(window.api.respaldos.usarCarpeta(ruta))
      avisos.exito('Carpeta de respaldos guardada.')
    })
  const probar = (archivo: ArchivoRespaldo): Promise<void> =>
    accion(async () => {
      const m = await llamar(window.api.respaldos.probar(archivo.ruta))
      avisos.exito(
        `El respaldo del ${fechaHora(m.fecha)} está bien: ${m.conteos.clientes} clientes, ${m.conteos.pedidos} pedidos y ${m.conteos.fotos} fotos.`
      )
    })
  const abrir = (cual: 'nube' | 'local' | 'datos'): Promise<void> => accion(() => llamar(window.api.respaldos.abrirCarpeta(cual)))

  if (!e) {
    return error ? (
      <p role="alert" className="text-lg text-red-800">
        {error}
      </p>
    ) : (
      <p className="text-lg">Cargando…</p>
    )
  }

  const ultimo = e.ultimoIntento
  const ultimoOk = e.carpetaNube ? e.ultimoOkNube : e.ultimoOkLocal
  const semaforo =
    ultimo && !ultimo.ok
      ? { tono: 'border-red-700 bg-red-50 text-red-900', texto: `✖ El último respaldo falló: ${ultimo.error}.` }
      : ultimoOk
        ? { tono: 'border-green-700 bg-green-50 text-green-900', texto: `✔ Último respaldo: ${fechaHora(ultimoOk)}, verificado.` }
        : { tono: 'border-amber-600 bg-amber-50', texto: 'Todavía no hay ningún respaldo.' }
  const ultimoArchivo = e.enNube[0] ?? e.locales[0] ?? null

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className={`rounded-lg border-2 px-4 py-3 text-lg font-semibold ${semaforo.tono}`}>
        {semaforo.texto}
      </p>
      {e.datosEnNube && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 px-4 py-3 text-lg text-red-900">
          ⚠ Los datos del programa están en una carpeta que se sincroniza con {NOMBRE_NUBE[e.datosEnNube]}. Eso puede dañarlos: pida
          ayuda a su técnico.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold">Dónde se guardan</h3>
          {e.carpetaNube ? (
            <>
              <p className="text-lg">
                {e.servicioNube ? (
                  <>
                    En <strong>{NOMBRE_NUBE[e.servicioNube]}</strong>:
                  </>
                ) : (
                  <span className="font-semibold text-amber-800">⚠ Esta carpeta no se sube a internet:</span>
                )}{' '}
                <span className="break-all">{e.carpetaNube}</span>
              </p>
              {!e.carpetaNubeDisponible && (
                <p className="text-lg font-semibold text-red-800">Ahora mismo la carpeta no está disponible.</p>
              )}
              <p className="text-base text-slate-700">
                Se guardan 30 días distintos ({e.enNube.length} respaldos, {megas(e.espacioNube)}) y, además, los últimos 7 en esta
                computadora.
              </p>
            </>
          ) : (
            <p className="text-lg font-semibold text-amber-800">
              Solo se guardan en esta computadora. Si la laptop se pierde o se daña, se pierden también. Elija una carpeta de Google Drive u
              OneDrive.
            </p>
          )}
          {e.sugerencias
            .filter((s) => s.ruta.toLowerCase() !== e.carpetaNube?.toLowerCase())
            .map((s) => (
              <Boton key={s.ruta} variante="secundario" compacto disabled={ocupado} onClick={() => void usarCarpeta(s.ruta)} className="self-start">
                Usar {NOMBRE_NUBE[s.servicio]} ({s.ruta})
              </Boton>
            ))}
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" compacto disabled={ocupado} onClick={() => void elegirCarpeta()}>
              Elegir otra carpeta…
            </Boton>
            {e.carpetaNube && (
              <Boton variante="secundario" compacto disabled={ocupado} onClick={() => void abrir('nube')}>
                Abrir la carpeta de respaldos
              </Boton>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-bold">Revisar</h3>
          <div className="flex flex-wrap gap-2">
            <Boton disabled={ocupado} onClick={() => void hacerAhora()}>
              Hacer un respaldo ahora
            </Boton>
            {ultimoArchivo && (
              <Boton variante="secundario" disabled={ocupado} onClick={() => void probar(ultimoArchivo)}>
                Probar el último respaldo
              </Boton>
            )}
          </div>
          {e.carpetaNube && (
            <p className="text-base text-slate-700">
              ¿Llegan a la nube? Una vez al mes, busque el último respaldo en Google Drive u OneDrive desde su celular. Última vez que lo
              confirmó: <strong>{e.confirmadoNubeEn ? formatearFecha(new Date(e.confirmadoNubeEn)) : 'nunca'}</strong>.
            </p>
          )}
          <div className="mt-2 border-t border-slate-200 pt-3">
            <Boton variante="peligro" disabled={ocupado} onClick={() => setRestaurando(true)}>
              Restaurar un respaldo…
            </Boton>
          </div>
        </div>
      </div>
      {restaurando && <DialogoRestaurar estado={e} onCerrar={() => setRestaurando(false)} />}
    </div>
  )
}

/** Elegir un respaldo, ver qué pasa al restaurarlo y confirmar con la contraseña de la dueña. */
function DialogoRestaurar({ estado, onCerrar }: { estado: EstadoRespaldos; onCerrar: () => void }): React.JSX.Element {
  const [vista, setVista] = useState<VistaRestauracion | null>(null)
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)

  // Los de la nube y los de esta computadora, sin repetir, del más nuevo al más viejo.
  const vistos = new Set<string>()
  const lista = [...estado.enNube, ...estado.locales]
    .filter((a) => !vistos.has(a.archivo) && vistos.add(a.archivo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const elegir = async (ruta: string | null): Promise<void> => {
    setError(null)
    setOcupado(true)
    try {
      const r = ruta ?? (await llamar(window.api.respaldos.elegirArchivo()))
      if (r) setVista(await llamar(window.api.respaldos.vistaRestauracion(r)))
    } catch (err) {
      setError(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  const restaurar = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault()
    if (!vista) return
    if (!contrasena) return setError('Escriba su contraseña para confirmar.')
    setOcupado(true)
    setError(null)
    try {
      await llamar(window.api.respaldos.restaurar(vista.archivo, contrasena))
      setReiniciando(true)
    } catch (err) {
      setError(mensajeDe(err))
      setContrasena('')
      setOcupado(false)
    }
  }

  if (reiniciando) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 p-4">
        <p role="status" className="rounded-xl bg-white p-8 text-2xl font-bold">
          Respaldo restaurado. El programa se está reiniciando…
        </p>
      </div>
    )
  }

  return (
    <Dialogo
      titulo={vista ? '¿Restaurar este respaldo?' : 'Restaurar un respaldo'}
      onCerrar={onCerrar}
      ancho="amplio"
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={vista ? () => setVista(null) : onCerrar}>
            {vista ? '← Elegir otro' : 'No, volver'}
          </Boton>
          {vista && !vista.impedimento && (
            <Boton type="submit" form="form-restaurar" variante="peligro" disabled={ocupado}>
              Sí, restaurar
            </Boton>
          )}
        </div>
      }
    >
      {!vista ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg">Elija el respaldo que quiere recuperar:</p>
          {lista.length === 0 && <p className="text-lg text-slate-700">No hay respaldos en las carpetas de siempre.</p>}
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {lista.map((a) => (
              <li key={a.archivo}>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void elegir(a.ruta)}
                  className="w-full rounded-lg border-2 border-slate-300 px-3 py-2 text-left text-lg hover:bg-slate-50"
                >
                  {fechaHora(a.fecha)} {a.antesDeRestaurar && <span className="text-slate-600">(antes de restaurar)</span>}
                  {a.antesDeActualizarA && <span className="text-slate-600">(antes de actualizar a {a.antesDeActualizarA})</span>}
                  <span className="ml-2 text-base text-slate-600">{megas(a.tamano)}</span>
                </button>
              </li>
            ))}
          </ul>
          <Boton variante="secundario" compacto disabled={ocupado} onClick={() => void elegir(null)} className="self-start">
            Elegir otro archivo…
          </Boton>
        </div>
      ) : (
        <form id="form-restaurar" onSubmit={restaurar} className="flex flex-col gap-3 text-lg">
          <p>
            Respaldo del <strong>{fechaHora(vista.fecha)}</strong>: {vista.conteos.clientes} clientes, {vista.conteos.pedidos} pedidos y{' '}
            {vista.conteos.fotos} fotos.
          </p>
          {vista.impedimento ? (
            <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-red-900">
              {vista.impedimento}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 rounded-lg border-2 border-amber-600 bg-amber-50 p-3">
                <li>
                  🔑 <strong>Sus contraseñas, su código de recuperación y la clave de soporte no cambian.</strong> Seguirá entrando como
                  hasta ahora.
                </li>
                <li>
                  ⚠ Se perderá lo registrado después del {fechaHora(vista.fecha)}
                  {vista.sePerderan.pedidos + vista.sePerderan.pagos > 0 ? (
                    <>
                      : <strong>{vista.sePerderan.pedidos} pedidos</strong> y <strong>{vista.sePerderan.pagos} pagos</strong>.
                    </>
                  ) : (
                    ' (no hay pedidos ni pagos nuevos).'
                  )}
                </li>
                <li>💾 Antes de restaurar se guarda un respaldo del estado actual, por si necesita volver atrás.</li>
                <li>🔄 El programa se reiniciará y tendrá que volver a ingresar.</li>
              </ul>
              <CampoContrasena etiqueta="Su contraseña (dueña)" valor={contrasena} onCambio={setContrasena} autoFocus autoComplete="off" />
            </>
          )}
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg text-red-800">
          {error}
        </p>
      )}
    </Dialogo>
  )
}
