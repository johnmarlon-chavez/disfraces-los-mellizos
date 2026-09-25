import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatearTelefono, type DatosCliente, type FichaCliente as DatosFicha } from '../../../shared/clientes'
import { formatearFecha, formatearSoles } from '../../../shared/formato'
import { llamar, mensajeDe } from '../api'
import EtiquetaTipoCliente from '../componentes/clientes/EtiquetaTipoCliente'
import FormularioCliente from '../componentes/clientes/FormularioCliente'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton from '../componentes/ui/Boton'
import { useConfirmar } from '../componentes/ui/Confirmacion'
import { VOLVER_CON_FILTROS } from '../memoriaFiltros'

const NOMBRE_ESTADO_ALQUILER = {
  reservado: 'Reservado',
  entregado: 'Entregado',
  devuelto: 'Devuelto',
  cancelado: 'Cancelado'
}

function datosDe(f: DatosFicha): DatosCliente {
  const comunes = {
    nombres: f.nombres,
    telefono: formatearTelefono(f.telefono),
    direccion: f.direccion,
    observaciones: f.observaciones
  }
  return f.tipo === 'persona'
    ? { tipo: 'persona', tipoDocumento: f.tipoDocumento!, numeroDocumento: f.numeroDocumento!, ...comunes }
    : {
        tipo: 'colegio',
        distrito: f.distrito,
        responsable: f.responsable,
        dniResponsable: f.dniResponsable ?? '',
        ruc: f.ruc ?? '',
        ...comunes
      }
}

function Indicador({ valor, texto, alerta }: { valor: string; texto: string; alerta: boolean }): React.JSX.Element {
  return (
    <div className={`rounded-lg border-2 p-3 ${alerta ? 'border-amber-600 bg-amber-50' : 'border-slate-200'}`}>
      <p className="text-3xl font-bold">{valor}</p>
      <p className="text-base text-slate-700">{texto}</p>
    </div>
  )
}

export default function FichaCliente(): React.JSX.Element {
  const id = Number(useParams().id)
  const navegar = useNavigate()
  const avisos = useAvisos()
  const confirmar = useConfirmar()
  const [ficha, setFicha] = useState<DatosFicha | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  // Cambia al guardar, para volver a montar el formulario con los datos normalizados.
  const [version, setVersion] = useState(0)

  const recargar = useCallback(async (): Promise<void> => {
    try {
      setFicha(await llamar(window.api.clientes.obtener(id)))
      setVersion((v) => v + 1)
    } catch (e) {
      setErrorCarga(mensajeDe(e))
    }
  }, [id])

  useEffect(() => {
    let vigente = true
    llamar(window.api.clientes.obtener(id))
      .then((f) => vigente && setFicha(f))
      .catch((e) => vigente && setErrorCarga(mensajeDe(e)))
    return () => {
      vigente = false
    }
  }, [id])

  const volver = (
    <Link to="/clientes" state={VOLVER_CON_FILTROS} className="text-lg font-semibold text-blue-800 hover:underline">
      ← Volver a Clientes
    </Link>
  )

  if (errorCarga) {
    return (
      <section>
        {volver}
        <p role="alert" className="mt-4 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {errorCarga}
        </p>
      </section>
    )
  }
  if (!ficha) return <p className="text-lg">Cargando…</p>

  const { historial } = ficha

  const desactivar = async (): Promise<void> => {
    const ok = await confirmar({
      titulo: `¿Desactivar a ${ficha.nombres}?`,
      mensaje: 'No aparecerá al registrar nuevos alquileres. Su historial se conserva y se puede reactivar después.',
      textoConfirmar: 'Sí, desactivar',
      variante: 'peligro'
    })
    if (!ok) return
    try {
      await llamar(window.api.clientes.desactivar(ficha.id))
      avisos.exito(`${ficha.nombres} fue desactivado.`)
      await recargar()
    } catch (e) {
      avisos.error(mensajeDe(e))
    }
  }

  const reactivar = async (): Promise<void> => {
    const ok = await confirmar({
      titulo: `¿Reactivar a ${ficha.nombres}?`,
      mensaje: 'Volverá a aparecer al registrar nuevos alquileres.',
      textoConfirmar: 'Sí, reactivar',
      variante: 'exito'
    })
    if (!ok) return
    try {
      await llamar(window.api.clientes.reactivar(ficha.id))
      avisos.exito(`${ficha.nombres} fue reactivado.`)
      await recargar()
    } catch (e) {
      avisos.error(mensajeDe(e))
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        {volver}
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold">
          <EtiquetaTipoCliente tipo={ficha.tipo} />
          {ficha.nombres}
          {!ficha.activo && (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-lg text-slate-700">Desactivado</span>
          )}
        </h1>
      </div>

      {ficha.conAntecedentes && (
        <p role="note" className="rounded-lg border-2 border-amber-600 bg-amber-50 p-4 text-lg font-semibold text-amber-900">
          Este cliente tiene antecedentes: devoluciones tardías o cargos por daños. Revise el historial antes de alquilarle.
        </p>
      )}

      <div className="grid grid-cols-[1fr_20rem] items-start gap-6">
        <div className="rounded-lg bg-white p-5 shadow">
          <h2 className="mb-4 text-2xl font-bold">Datos</h2>
          <FormularioCliente
            key={`${ficha.id}-${version}`}
            clienteId={ficha.id}
            inicial={datosDe(ficha)}
            textoGuardar="Guardar cambios"
            onGuardado={async () => {
              avisos.exito('Datos guardados.')
              await recargar()
            }}
            onUsarExistente={(otro) => navegar(`/clientes/${otro}`)}
          />
        </div>

        <div className="flex flex-col gap-4 rounded-lg bg-white p-5 shadow">
          <h2 className="text-2xl font-bold">Historial</h2>
          <Indicador valor={String(historial.alquileresTotales)} texto="alquileres" alerta={false} />
          <Indicador
            valor={String(historial.devolucionesTardias)}
            texto="devoluciones tardías"
            alerta={historial.devolucionesTardias > 0}
          />
          <Indicador
            valor={String(historial.cargosPorDanos)}
            texto={
              historial.cargosPorDanos > 0
                ? `cargos por daños (${formatearSoles(historial.montoCargosPorDanos)})`
                : 'cargos por daños'
            }
            alerta={historial.cargosPorDanos > 0}
          />
        </div>
      </div>

      <div className="rounded-lg bg-white p-5 shadow">
        <h2 className="mb-4 text-2xl font-bold">Alquileres</h2>
        {ficha.alquileres.length === 0 ? (
          <p className="text-lg text-slate-700">Todavía no tiene alquileres.</p>
        ) : (
          <table className="w-full text-left text-lg">
            <thead>
              <tr className="border-b-2 border-slate-300">
                <th className="py-2 pr-3">Salida</th>
                <th className="py-2 pr-3">Devolución pactada</th>
                <th className="py-2 pr-3">Devuelto</th>
                <th className="py-2 pr-3">Disfraces</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ficha.alquileres.map((a) => (
                <tr key={a.id} className="border-b border-slate-200">
                  <td className="py-2 pr-3">{formatearFecha(a.fechaSalida)}</td>
                  <td className="py-2 pr-3">{formatearFecha(a.fechaDevolucionPactada)}</td>
                  <td className="py-2 pr-3">{a.fechaDevolucionReal ? formatearFecha(a.fechaDevolucionReal) : '—'}</td>
                  <td className="py-2 pr-3">{a.unidades}</td>
                  <td className="py-2">{NOMBRE_ESTADO_ALQUILER[a.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border-2 border-slate-300 bg-white p-4">
        <p className="text-lg text-slate-700">
          {ficha.activo
            ? 'Si ya no trabaja con este cliente, puede desactivarlo. No se borra nada.'
            : 'Este cliente está desactivado y no aparece para nuevos alquileres.'}
        </p>
        {ficha.activo ? (
          <Boton variante="peligro" onClick={desactivar}>
            Desactivar cliente
          </Boton>
        ) : (
          <Boton variante="exito" onClick={reactivar}>
            Reactivar cliente
          </Boton>
        )}
      </div>
    </section>
  )
}
