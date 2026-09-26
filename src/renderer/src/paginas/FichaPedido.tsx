import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { formatearTelefono } from '../../../shared/clientes'
import type { CargoPedido } from '../../../shared/entregas'
import { sumarDias } from '../../../shared/fechas'
import { formatearFecha, formatearSoles, hoyEnLima } from '../../../shared/formato'
import {
  NOMBRE_CONCEPTO,
  NOMBRE_ESTADO_PENDIENTE,
  NOMBRE_MEDIO,
  type FichaPedido as DatosPedido,
  type LineaPedido
} from '../../../shared/pedidos'
import { llamar, mensajeDe } from '../api'
import EtiquetaTipoCliente from '../componentes/clientes/EtiquetaTipoCliente'
import DialogoEntrega from '../componentes/pedidos/DialogoEntrega'
import { DialogoLiquidar, DialogoPagoDeuda, DialogoRebajarMora } from '../componentes/pedidos/DialogosCierre'
import { DialogoAdelanto, DialogoCancelar } from '../componentes/pedidos/DialogosPedido'
import EtiquetaEstadoPedido from '../componentes/pedidos/EtiquetaEstadoPedido'
import { agrupar } from '../componentes/pedidos/modeloCarrito'
import { useAutorizacionDuena } from '../componentes/ui/AutorizacionDuena'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton, { clasesBoton } from '../componentes/ui/Boton'
import { VOLVER_CON_FILTROS } from '../memoriaFiltros'

type DialogoAbierto = 'adelanto' | 'cancelar' | 'entregar' | 'liquidar' | 'pago' | { mora: CargoPedido } | null

const NOMBRE_DEVOLUCION = {
  bien: 'bien',
  con_danos: 'con daños',
  con_faltantes: 'con faltantes',
  con_danos_y_faltantes: 'con daños y faltantes'
}

function EstadoUnidad({ l }: { l: LineaPedido }): React.JSX.Element {
  if (l.fechaDevolucionReal) {
    return (
      <span className={`text-sm ${l.estadoDevolucion === 'bien' ? 'text-green-800' : 'font-semibold text-amber-800'}`}>
        volvió {formatearFecha(l.fechaDevolucionReal).slice(0, 5)}
        {l.estadoDevolucion && l.estadoDevolucion !== 'bien' ? ` ${NOMBRE_DEVOLUCION[l.estadoDevolucion]}` : ''}
      </span>
    )
  }
  if (l.fechaEntregaReal) return <span className="text-sm font-semibold text-purple-800">fuera</span>
  return <span className="text-sm text-slate-600">por entregar</span>
}

export default function FichaPedido(): React.JSX.Element {
  const id = Number(useParams().id)
  const pedirLiquidar = (useLocation().state as { liquidar?: boolean } | null)?.liquidar === true
  const avisos = useAvisos()
  const autorizarDuena = useAutorizacionDuena()
  const [p, setP] = useState<DatosPedido | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<DialogoAbierto>(null)
  const hoy = hoyEnLima()

  const recargar = useCallback(async () => {
    setP(await llamar(window.api.pedidos.obtener(id)))
  }, [id])

  useEffect(() => {
    let vigente = true
    llamar(window.api.pedidos.obtener(id))
      .then((f) => {
        if (!vigente) return
        setP(f)
        // Después de la última devolución se abre directamente el cierre.
        if (pedirLiquidar && f.cuenta.listoParaLiquidar) setDialogo('liquidar')
      })
      .catch((e) => vigente && setErrorCarga(mensajeDe(e)))
    return () => {
      vigente = false
    }
  }, [id, pedirLiquidar])

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

  const { cuenta } = p
  const reservado = p.estado === 'reservado'
  const entregado = p.estado === 'entregado'
  const abierto = reservado || entregado
  const debe = cuenta.plan.deuda.total
  const lineasSinEntregar = p.lineas.filter((l) => !l.fechaEntregaReal).length
  const vencido = entregado && cuenta.faltanDevolver > 0 && p.fechaDevolucionPactada < hoy
  const enLavanderia = p.lineas.some((l) => l.fechaDevolucionReal && l.estadoFisico === 'lavanderia')

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

  const cancelarLoQueFalta = async (): Promise<void> => {
    const r = await autorizarDuena({
      titulo: 'Cancelar lo que no se entregó',
      mensaje: `Se quitarán del pedido los ${cuenta.faltanEntregar} disfraces que no se entregaron. El total baja y, si pagó de más, se le devuelve al cerrar el pedido. Solo la dueña puede autorizarlo.`,
      textoConfirmar: 'Autorizar y quitar',
      variante: 'peligro'
    })
    if (r) await ejecutar(() => llamar(window.api.entregas.cancelarLoQueFalta(p.id, r.autorizacion)), 'Se quitó lo que no se entregó.')
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        {volver}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">Pedido N.° {p.id}</h1>
          <EtiquetaEstadoPedido estado={p.estado} />
          {entregado && cuenta.faltanDevolver > 0 && (
            <span className="text-xl font-bold text-purple-900">
              Faltan {cuenta.faltanDevolver} de {cuenta.totalUnidades} por devolver
            </span>
          )}
          {entregado && cuenta.faltanEntregar > 0 && (
            <span className="text-xl font-bold text-amber-800">Faltan {cuenta.faltanEntregar} por entregar</span>
          )}
          {p.estado === 'devuelto' && debe > 0 && <span className="text-xl font-bold text-red-700">Debe {formatearSoles(debe)}</span>}
        </div>
      </div>

      {vencido && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg font-semibold text-red-800">
          Vencido: debía volver el {formatearFecha(p.fechaDevolucionPactada)}. Faltan {cuenta.faltanDevolver} disfraces.
        </p>
      )}
      {p.cliente.conAntecedentes && reservado && (
        <p role="note" className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-lg font-semibold text-amber-900">
          ⚠ Este cliente tiene antecedentes (devoluciones tardías, daños o deudas).
        </p>
      )}
      {cuenta.plan.dni === 'retener' && p.estado === 'devuelto' && (
        <p className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-lg font-semibold text-amber-900">
          Se retiene el documento {cuenta.garantiaDocumento} hasta que pague {formatearSoles(debe)}.
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
            <p className="col-span-2 text-base text-slate-600">
              Reservado el {formatearFecha(p.fechaReserva)}
              {p.entregadoEn && ` · entregado el ${formatearFecha(new Date(p.entregadoEn))}`}
              {p.fechaDevolucionReal && ` · devuelto el ${formatearFecha(p.fechaDevolucionReal)}`}
            </p>
            {p.observaciones && <p className="col-span-2">Observaciones: {p.observaciones}</p>}
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="mb-3 text-2xl font-bold">Disfraces ({p.lineas.length})</h2>
            {p.lineas.length === 0 ? (
              <p className="text-lg text-slate-700">Todavía no hay unidades asignadas.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {agrupar(p.lineas).map((g) => {
                  const lineas = p.lineas.filter((l) => g.lineas.some((x) => x.unidadId === l.unidadId))
                  const descuento = lineas.some((l) => l.precioCobrado < l.precioOriginal)
                  return (
                    <li key={g.clave} className="rounded-lg border-2 border-slate-200 p-3">
                      <p className="text-lg font-bold">
                        {g.modeloNombre} · T{g.talla} × {g.lineas.length}
                        <span className="ml-2 font-normal">{formatearSoles(lineas.reduce((s, l) => s + l.precioCobrado, 0))}</span>
                        {descuento && <span className="ml-2 text-base font-semibold text-green-800">con descuento</span>}
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {lineas.map((l) => (
                          <li key={l.detalleId} className="flex items-baseline gap-1">
                            <span className="font-mono text-base">{l.codigo}</span>
                            {!reservado && <EstadoUnidad l={l} />}
                          </li>
                        ))}
                      </ul>
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
                      {abierto && x.estado !== 'listo' && (
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

          {p.cargos.length > 0 && (
            <div className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-3 text-2xl font-bold">Cargos</h2>
              <ul className="flex flex-col gap-2 text-lg">
                {p.cargos.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      {c.descripcion}
                      {c.motivoRebaja && (
                        <span className="block text-base text-slate-600">
                          Antes {formatearSoles(c.montoOriginal)} · {c.monto === 0 ? 'perdonada' : 'rebajada'}: {c.motivoRebaja}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">{formatearSoles(c.monto)}</span>
                    {c.tipo === 'mora' && c.monto > 0 && (
                      <Boton compacto variante="secundario" onClick={() => setDialogo({ mora: c })}>
                        Rebajar
                      </Boton>
                    )}
                  </li>
                ))}
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
                      <td className="py-1">
                        {NOMBRE_CONCEPTO[x.concepto]}
                        {x.desdeGarantia && <span className="text-base text-slate-600"> (de la garantía)</span>}
                      </td>
                      <td className="py-1">{NOMBRE_MEDIO[x.medio]}</td>
                      <td className="py-1 text-right">
                        {x.concepto === 'devolucion_adelanto' || x.concepto === 'garantia_devuelta' ? '−' : ''}
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
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-lg">
            <dt className="font-semibold">Total del alquiler</dt>
            <dd className="text-right text-xl font-bold">{formatearSoles(p.totales.total)}</dd>
            <dt className="font-semibold">Adelanto</dt>
            <dd className="text-right">{formatearSoles(p.totales.adelantoNeto)}</dd>
            <dt className="font-semibold">Saldo</dt>
            <dd className="text-right text-xl font-bold">{formatearSoles(p.totales.saldo)}</dd>
            {!reservado && (cuenta.plan.deuda.danos > 0 || cuenta.plan.deuda.mora > 0) && (
              <>
                <dt className="font-semibold">Cargos por pagar</dt>
                <dd className="text-right">{formatearSoles(cuenta.plan.deuda.danos + cuenta.plan.deuda.mora)}</dd>
              </>
            )}
            <dt className="mt-2 font-semibold">Garantía</dt>
            <dd className="mt-2 text-right">
              {p.garantiaTipo === null
                ? 'Por definir'
                : p.garantiaTipo === 'dni'
                  ? `DNI ${cuenta.garantiaDocumento ?? 'en prenda'}`
                  : `Dinero ${formatearSoles(p.garantiaMonto)}`}
              {cuenta.garantiaCerrada && <span className="block text-base text-green-800">devuelta / liquidada</span>}
            </dd>
          </dl>

          {reservado && (
            <>
              <Boton variante="exito" onClick={() => setDialogo('entregar')}>
                {p.fechaSalida > hoy ? 'Entregar hoy (adelantar la salida)' : 'Entregar'}
              </Boton>
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
          {entregado && cuenta.faltanDevolver > 0 && (
            <Link to={`/alquileres/${p.id}/devolucion`} className={clasesBoton('exito')}>
              Registrar devolución
            </Link>
          )}
          {entregado && lineasSinEntregar > 0 && (
            <Boton variante="secundario" onClick={() => setDialogo('entregar')}>
              Entregar los que faltan ({lineasSinEntregar})
            </Boton>
          )}
          {cuenta.listoParaLiquidar && (
            <Boton variante="exito" onClick={() => setDialogo('liquidar')}>
              Cerrar el pedido (liquidar)
            </Boton>
          )}
          {entregado && cuenta.faltanEntregar > 0 && (
            <Boton variante="secundario" onClick={cancelarLoQueFalta}>
              Cancelar lo que no se entregó
            </Boton>
          )}
          {!reservado && debe > 0 && p.estado !== 'cancelado' && (
            <Boton variante="secundario" onClick={() => setDialogo('pago')}>
              Registrar pago ({formatearSoles(debe)})
            </Boton>
          )}
          {p.estado === 'devuelto' && p.garantiaTipo === 'dni' && !cuenta.garantiaCerrada && debe === 0 && (
            <Boton variante="exito" onClick={() => ejecutar(() => llamar(window.api.entregas.devolverDocumento(p.id)), 'Documento devuelto.')}>
              Devolver el documento
            </Boton>
          )}
          {enLavanderia && (
            <Boton
              variante="secundario"
              onClick={async () => {
                try {
                  const codigos = await llamar(window.api.entregas.liberar(p.id))
                  avisos.exito(`${codigos.length} marcados como limpios y disponibles.`)
                  await recargar()
                } catch (e) {
                  avisos.error(mensajeDe(e))
                }
              }}
            >
              Marcar todo como limpio
            </Boton>
          )}
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
      {dialogo === 'entregar' && (
        <DialogoEntrega
          pedido={p}
          onCerrar={() => setDialogo(null)}
          onEntregado={async (mensaje) => {
            avisos.exito(mensaje)
            setDialogo(null)
            await recargar()
          }}
        />
      )}
      {dialogo === 'liquidar' && (
        <DialogoLiquidar
          pedido={p}
          onCerrar={() => setDialogo(null)}
          onListo={async (mensaje) => {
            avisos.exito(mensaje)
            setDialogo(null)
            await recargar()
          }}
        />
      )}
      {dialogo === 'pago' && (
        <DialogoPagoDeuda
          debe={debe}
          onCerrar={() => setDialogo(null)}
          onGuardar={(monto, medio) =>
            ejecutar(() => llamar(window.api.entregas.pagarDeuda(p.id, monto, medio)), `Pago de ${formatearSoles(monto)} registrado.`)
          }
        />
      )}
      {dialogo !== null && typeof dialogo === 'object' && (
        <DialogoRebajarMora
          cargo={dialogo.mora}
          onCerrar={() => setDialogo(null)}
          onListo={async (mensaje) => {
            avisos.exito(mensaje)
            setDialogo(null)
            await recargar()
          }}
        />
      )}
    </section>
  )
}
