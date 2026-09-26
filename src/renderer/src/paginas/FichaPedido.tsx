import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { formatearTelefono } from '../../../shared/clientes'
import { formatearFecha, formatearSoles, hoyEnLima } from '../../../shared/formato'
import {
  NOMBRE_CONCEPTO,
  NOMBRE_ESTADO_PEDIDO,
  NOMBRE_ESTADO_PENDIENTE,
  NOMBRE_MEDIO,
  type FichaPedido as DatosPedido
} from '../../../shared/pedidos'
import { sumarDias } from '../../../shared/fechas'
import { llamar, mensajeDe } from '../api'
import EtiquetaTipoCliente from '../componentes/clientes/EtiquetaTipoCliente'
import EtiquetaEstadoPedido from '../componentes/pedidos/EtiquetaEstadoPedido'
import { DialogoAdelanto, DialogoCancelar } from '../componentes/pedidos/DialogosPedido'
import { agrupar } from '../componentes/pedidos/modeloCarrito'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton, { clasesBoton } from '../componentes/ui/Boton'
import { VOLVER_CON_FILTROS } from '../memoriaFiltros'

export default function FichaPedido(): React.JSX.Element {
  const id = Number(useParams().id)
  const avisos = useAvisos()
  const [p, setP] = useState<DatosPedido | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<'adelanto' | 'cancelar' | null>(null)
  const hoy = hoyEnLima()

  const recargar = useCallback(async () => {
    setP(await llamar(window.api.pedidos.obtener(id)))
  }, [id])

  useEffect(() => {
    let vigente = true
    llamar(window.api.pedidos.obtener(id))
      .then((f) => vigente && setP(f))
      .catch((e) => vigente && setErrorCarga(mensajeDe(e)))
    return () => {
      vigente = false
    }
  }, [id])

  const volver = (
    <Link to="/alquileres" state={VOLVER_CON_FILTROS} className="text-lg font-semibold text-blue-800 hover:underline">
      ← Volver a Alquileres
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
  if (!p) return <p className="text-lg">Cargando…</p>

  const reservado = p.estado === 'reservado'
  const ejecutar = async (accion: () => Promise<unknown>, exito: string): Promise<void> => {
    try {
      await accion()
      avisos.exito(exito)
      setDialogo(null)
      await recargar()
    } catch (e) {
      avisos.error(mensajeDe(e))
    }
  }

  const asignar = async (pendienteId: number): Promise<void> => {
    try {
      const codigos = await llamar(window.api.pendientes.asignar(pendienteId, null))
      avisos.exito(`Asignadas: ${codigos.join(', ')}.`)
      await recargar()
    } catch (e) {
      avisos.error(mensajeDe(e))
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        {volver}
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-3xl font-bold">Pedido N.° {p.id}</h1>
          <EtiquetaEstadoPedido estado={p.estado} />
        </div>
      </div>

      {p.cliente.conAntecedentes && reservado && (
        <p role="note" className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-lg font-semibold text-amber-900">
          ⚠ Este cliente tiene antecedentes (devoluciones tardías o daños).
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-5">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-white p-4 text-lg shadow">
            <div className="col-span-2 flex items-center gap-3">
              <EtiquetaTipoCliente tipo={p.cliente.tipo} />
              <Link to={`/clientes/${p.cliente.id}`} className="text-xl font-bold text-blue-800 hover:underline">
                {p.cliente.nombres}
              </Link>
              <span className="text-slate-700">{formatearTelefono(p.cliente.telefono)}</span>
            </div>
            {p.cliente.tipo === 'colegio' && (
              <p className="col-span-2">
                Responsable: {p.cliente.responsable} (DNI {p.cliente.dniResponsable})
              </p>
            )}
            <p>
              <span className="font-semibold">Salida:</span> {formatearFecha(p.fechaSalida)}
            </p>
            <p>
              <span className="font-semibold">Devolución:</span> {formatearFecha(p.fechaDevolucionPactada)}
            </p>
            <p>
              <span className="font-semibold">Evento:</span> {p.evento}
            </p>
            <p>
              <span className="font-semibold">Grado y sección:</span> {p.gradoSeccion || '—'}
            </p>
            <p className="col-span-2 text-base text-slate-600">Reservado el {formatearFecha(p.fechaReserva)}</p>
            {p.observaciones && <p className="col-span-2">Observaciones: {p.observaciones}</p>}
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="mb-3 text-2xl font-bold">Disfraces ({p.lineas.length})</h2>
            {p.lineas.length === 0 ? (
              <p className="text-lg text-slate-700">Todavía no hay unidades asignadas.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {agrupar(p.lineas.map((l) => ({ ...l }))).map((g) => {
                  const lineas = p.lineas.filter((l) => g.lineas.some((x) => x.unidadId === l.unidadId))
                  const descuento = lineas.some((l) => l.precioCobrado < l.precioOriginal)
                  return (
                    <li key={g.clave} className="rounded-lg border-2 border-slate-200 p-3">
                      <p className="text-lg font-bold">
                        {g.modeloNombre} · T{g.talla} × {g.lineas.length}
                        <span className="ml-2 font-normal">
                          {formatearSoles(lineas.reduce((s, l) => s + l.precioCobrado, 0))}
                        </span>
                        {descuento && <span className="ml-2 text-base font-semibold text-green-800">con descuento</span>}
                      </p>
                      <p className="font-mono text-base text-slate-700">{g.lineas.map((l) => l.codigo).join('  ')}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {p.pendientes.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-3 text-2xl font-bold">Por confeccionar</h2>
              <ul className="flex flex-col gap-3">
                {p.pendientes.map((x) => {
                  const faltan = x.cantidad - x.cantidadAsignada
                  const vencePronto = x.estado !== 'listo' && x.fechaLimite <= sumarDias(hoy, 7)
                  return (
                    <li
                      key={x.id}
                      aria-label={`Pendiente ${x.modeloNombre} talla ${x.talla}`}
                      className={`flex flex-col gap-2 rounded-lg border-2 p-3 ${
                        x.estado === 'listo' ? 'border-green-700 bg-green-50' : vencePronto ? 'border-red-700 bg-red-50' : 'border-amber-600 bg-amber-50'
                      }`}
                    >
                      <div>
                        <p className="text-lg font-bold">
                          {x.modeloNombre} · T{x.talla} — {x.estado === 'listo' ? `${x.cantidad} asignadas` : `faltan ${faltan} de ${x.cantidad}`}
                        </p>
                        <p className="text-base">
                          {NOMBRE_ESTADO_PENDIENTE[x.estado]} · Fecha límite {formatearFecha(x.fechaLimite)}
                          {vencePronto && <strong className="text-red-800"> · vence pronto</strong>}
                        </p>
                      </div>
                      {reservado && x.estado !== 'listo' && (
                        <div className="flex gap-2">
                          {x.estado === 'pendiente' && (
                            <Boton
                              compacto
                              variante="secundario"
                              onClick={() =>
                                ejecutar(
                                  () => llamar(window.api.pendientes.cambiarEstado(x.id, 'en_confeccion')),
                                  'Marcado en confección.'
                                )
                              }
                            >
                              Marcar en confección
                            </Boton>
                          )}
                          <Boton compacto onClick={() => asignar(x.id)}>
                            Asignar unidades listas
                          </Boton>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {p.pagos.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-3 text-2xl font-bold">Pagos</h2>
              <table className="w-full text-left text-lg">
                <tbody>
                  {p.pagos.map((x) => (
                    <tr key={x.id} className="border-b border-slate-200">
                      <td className="py-1">{formatearFecha(new Date(x.fecha))}</td>
                      <td className="py-1">{NOMBRE_CONCEPTO[x.concepto]}</td>
                      <td className="py-1">{NOMBRE_MEDIO[x.medio]}</td>
                      <td className="py-1 text-right">
                        {x.concepto === 'devolucion_adelanto' ? '−' : ''}
                        {formatearSoles(x.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1 text-lg">
            <dt className="font-semibold">Total</dt>
            <dd className="text-right text-xl font-bold">{formatearSoles(p.totales.total)}</dd>
            <dt className="font-semibold">Adelanto</dt>
            <dd className="text-right">{formatearSoles(p.totales.adelantoNeto)}</dd>
            <dt className="font-semibold">Saldo</dt>
            <dd className="text-right text-xl font-bold">{formatearSoles(p.totales.saldo)}</dd>
            <dt className="mt-2 font-semibold">Garantía</dt>
            <dd className="mt-2 text-right">
              {p.garantiaTipo === null
                ? 'Por definir'
                : p.garantiaTipo === 'dni'
                  ? 'DNI en prenda'
                  : `Efectivo ${formatearSoles(p.garantiaMonto)}`}
            </dd>
          </dl>
          {reservado && (
            <>
              <Link to={`/alquileres/${p.id}/editar`} className={clasesBoton('primario')}>
                Editar pedido
              </Link>
              <Boton variante="secundario" onClick={() => setDialogo('adelanto')} disabled={p.totales.saldo <= 0}>
                Registrar adelanto
              </Boton>
              <Boton variante="peligro" onClick={() => setDialogo('cancelar')}>
                Cancelar pedido
              </Boton>
            </>
          )}
          {!reservado && <p className="text-base text-slate-700">Pedido {NOMBRE_ESTADO_PEDIDO[p.estado].toLowerCase()}.</p>}
        </aside>
      </div>

      {dialogo === 'adelanto' && (
        <DialogoAdelanto
          saldo={p.totales.saldo}
          onCerrar={() => setDialogo(null)}
          onGuardar={(monto, medio) =>
            ejecutar(() => llamar(window.api.pedidos.registrarAdelanto(p.id, monto, medio)), `Adelanto de ${formatearSoles(monto)} registrado.`)
          }
        />
      )}
      {dialogo === 'cancelar' && (
        <DialogoCancelar
          adelantoPagado={p.totales.adelantoNeto}
          onCerrar={() => setDialogo(null)}
          onCancelar={(opcion) => ejecutar(() => llamar(window.api.pedidos.cancelar(p.id, opcion)), 'Pedido cancelado. Los disfraces quedaron libres.')}
        />
      )}
    </section>
  )
}
