import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatearFecha, formatearSoles, hoyEnLima, leerMonto } from '../../../shared/formato'
import type { DatosDevolucion, PrevisualizacionDevolucion, UnidadADevolver } from '../../../shared/entregas'
import type { FichaPedido, LineaPedido } from '../../../shared/pedidos'
import { llamar, mensajeDe } from '../api'
import { agrupar } from '../componentes/pedidos/modeloCarrito'
import ResumenLiquidacion from '../componentes/pedidos/ResumenLiquidacion'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton from '../componentes/ui/Boton'

interface Revision {
  /** piezaId -> monto escrito, para las piezas que NO volvieron. */
  faltantes: Record<number, string>
  conDano: boolean
  danoMonto: string
  danoDescripcion: string
  destino: 'lavanderia' | 'reparacion'
  abierta: boolean
}

const nueva = (): Revision => ({ faltantes: {}, conDano: false, danoMonto: '', danoDescripcion: '', destino: 'lavanderia', abierta: false })
const sinSoles = (c: number): string => formatearSoles(c).replace('S/ ', '')

/** Convierte la revisión a lo que espera el main, o devuelve el primer error. */
function aUnidad(l: LineaPedido, r: Revision): UnidadADevolver | string {
  const piezasFaltantes: UnidadADevolver['piezasFaltantes'] = []
  for (const [piezaId, texto] of Object.entries(r.faltantes)) {
    const m = texto.trim() ? leerMonto(texto) : ({ ok: true, centimos: 0 } as const)
    if (!m.ok) return `${l.codigo}: ${m.error}`
    piezasFaltantes.push({ piezaId: Number(piezaId), monto: m.centimos })
  }
  let dano: UnidadADevolver['dano'] = null
  if (r.conDano) {
    const m = leerMonto(r.danoMonto)
    if (!m.ok) return `${l.codigo} (daño): ${m.error}`
    if (!r.danoDescripcion.trim()) return `Describa el daño de ${l.codigo}.`
    dano = { monto: m.centimos, descripcion: r.danoDescripcion }
  }
  return { detalleId: l.detalleId, piezasFaltantes, dano, destino: r.destino, observaciones: '' }
}

export default function PantallaDevolucion(): React.JSX.Element {
  const id = Number(useParams().id)
  const navegar = useNavigate()
  const avisos = useAvisos()
  const hoy = hoyEnLima()
  const [pedido, setPedido] = useState<FichaPedido | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [fecha, setFecha] = useState(hoy)
  const [revisiones, setRevisiones] = useState<Map<number, Revision>>(new Map())
  const [vista, setVista] = useState<PrevisualizacionDevolucion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    llamar(window.api.pedidos.obtener(id))
      .then(setPedido)
      .catch((e) => setErrorCarga(mensajeDe(e)))
  }, [id])

  const fuera = useMemo(() => pedido?.lineas.filter((l) => l.fechaEntregaReal && !l.fechaDevolucionReal) ?? [], [pedido])
  const primeraEntrega = fuera.reduce((m, l) => (l.fechaEntregaReal! > m ? l.fechaEntregaReal! : m), '')

  // Lo que se enviaría al main (o el primer error de lo escrito)
  const datos = useMemo((): DatosDevolucion | string | null => {
    if (revisiones.size === 0) return null
    const unidades: UnidadADevolver[] = []
    for (const l of fuera) {
      const r = revisiones.get(l.detalleId)
      if (!r) continue
      const u = aUnidad(l, r)
      if (typeof u === 'string') return u
      unidades.push(u)
    }
    return { fecha, unidades }
  }, [revisiones, fuera, fecha])

  // Vista previa: cargos, mora y, si es la última devolución, la liquidación
  useEffect(() => {
    if (!datos || typeof datos === 'string') return
    let vigente = true
    const t = setTimeout(() => {
      llamar(window.api.entregas.previsualizar(id, datos))
        .then((v) => {
          if (!vigente) return
          setVista(v)
          setError(null)
        })
        .catch((e) => vigente && setError(mensajeDe(e)))
    }, 250)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [id, datos])

  if (errorCarga) return <p role="alert" className="text-lg text-red-800">{errorCarga}</p>
  if (!pedido) return <p className="text-lg">Cargando…</p>

  const cambiar = (detalleId: number, cambio: Partial<Revision> | null): void => {
    const m = new Map(revisiones)
    if (cambio === null) m.delete(detalleId)
    else m.set(detalleId, { ...(m.get(detalleId) ?? nueva()), ...cambio })
    setRevisiones(m)
  }
  const todas = fuera.length > 0 && fuera.every((l) => revisiones.has(l.detalleId))
  const vistaActual = datos && typeof datos !== 'string' ? vista : null

  const registrar = async (): Promise<void> => {
    if (!datos) return setError('Marque los disfraces que se devuelven.')
    if (typeof datos === 'string') return setError(datos)
    setGuardando(true)
    try {
      const r = await llamar(window.api.entregas.devolver(id, datos))
      avisos.exito(
        `Devueltos: ${r.devueltas.length}.` + (r.faltanDevolver > 0 ? ` Faltan ${r.faltanDevolver} de ${pedido.cuenta.totalUnidades}.` : '')
      )
      navegar(`/alquileres/${id}`, { replace: true, state: { liquidar: r.listoParaLiquidar } })
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link to={`/alquileres/${id}`} className="text-lg font-semibold text-blue-800 hover:underline">
          ← Volver al pedido
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Registrar devolución · Pedido N.° {id}</h1>
        <p className="text-lg text-slate-700">
          {pedido.cliente.nombres} · debía volver el {formatearFecha(pedido.fechaDevolucionPactada)} · faltan {fuera.length} de{' '}
          {pedido.cuenta.totalUnidades}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow">
            <label className="flex items-center gap-2 text-lg font-semibold">
              <input
                type="checkbox"
                className="size-5"
                checked={todas}
                onChange={(e) => setRevisiones(e.target.checked ? new Map(fuera.map((l) => [l.detalleId, revisiones.get(l.detalleId) ?? nueva()])) : new Map())}
              />
              Seleccionar todos ({fuera.length})
            </label>
            <span className="text-base text-slate-700">Marcados: {revisiones.size}. Todos vienen “en buen estado”; revise los que tengan problemas.</span>
          </div>

          {agrupar(fuera).map((g) => (
            <section key={g.clave} aria-label={`${g.modeloNombre} talla ${g.talla}`} className="rounded-lg bg-white p-3 shadow">
              <h2 className="mb-2 text-xl font-bold">
                {g.modeloNombre} · T{g.talla}
              </h2>
              <ul className="flex flex-col gap-2">
                {g.lineas.map((x) => {
                  const l = fuera.find((y) => y.unidadId === x.unidadId)!
                  const r = revisiones.get(l.detalleId)
                  const problemas = r ? Object.keys(r.faltantes).length + (r.conDano ? 1 : 0) : 0
                  return (
                    <li key={l.detalleId} className={`rounded-lg border-2 p-2 ${problemas > 0 ? 'border-amber-600 bg-amber-50' : 'border-slate-200'}`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 font-mono text-lg font-semibold">
                          <input type="checkbox" className="size-5" checked={!!r} onChange={(e) => cambiar(l.detalleId, e.target.checked ? {} : null)} />
                          {l.codigo}
                        </label>
                        {r && (
                          <>
                            <span className="text-base">{problemas > 0 ? `${problemas} observación(es)` : 'En buen estado'}</span>
                            <Boton compacto variante="secundario" onClick={() => cambiar(l.detalleId, { abierta: !r.abierta })}>
                              {r.abierta ? 'Cerrar revisión' : 'Revisar piezas y daños'}
                            </Boton>
                          </>
                        )}
                      </div>
                      {r?.abierta && (
                        <div className="mt-2 flex flex-col gap-3 border-t border-slate-200 pt-2">
                          <fieldset>
                            <legend className="font-semibold">Piezas (desmarque las que no volvieron)</legend>
                            {l.piezas.length === 0 && <p className="text-slate-700">Sin piezas registradas.</p>}
                            <div className="flex flex-col gap-1">
                              {l.piezas.map((pz) => {
                                const falta = pz.id in r.faltantes
                                return (
                                  <div key={pz.id} className="flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-2 text-lg">
                                      <input
                                        type="checkbox"
                                        className="size-5"
                                        checked={!falta}
                                        onChange={(e) => {
                                          const f = { ...r.faltantes }
                                          if (e.target.checked) delete f[pz.id]
                                          else f[pz.id] = sinSoles(pz.costoReposicion)
                                          cambiar(l.detalleId, { faltantes: f })
                                        }}
                                      />
                                      {pz.nombre}
                                    </label>
                                    {falta && (
                                      <label className="flex items-center gap-1 font-semibold text-amber-900">
                                        Falta: cobrar S/
                                        <input
                                          aria-label={`Cobro por ${pz.nombre} de ${l.codigo}`}
                                          value={r.faltantes[pz.id]}
                                          inputMode="decimal"
                                          onChange={(e) => cambiar(l.detalleId, { faltantes: { ...r.faltantes, [pz.id]: e.target.value } })}
                                          className="w-24 rounded border-2 border-slate-400 px-2 text-right"
                                        />
                                      </label>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </fieldset>
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-lg">
                              <input
                                type="checkbox"
                                className="size-5"
                                checked={r.conDano}
                                onChange={(e) => cambiar(l.detalleId, { conDano: e.target.checked, destino: e.target.checked ? 'reparacion' : 'lavanderia' })}
                              />
                              Tiene daño
                            </label>
                            {r.conDano && (
                              <>
                                <input
                                  aria-label={`Descripción del daño de ${l.codigo}`}
                                  placeholder="Ej. pollera rota"
                                  value={r.danoDescripcion}
                                  onChange={(e) => cambiar(l.detalleId, { danoDescripcion: e.target.value })}
                                  className="min-w-0 flex-1 rounded border-2 border-slate-400 px-2 py-1"
                                />
                                <label className="flex items-center gap-1">
                                  S/
                                  <input
                                    aria-label={`Cobro por el daño de ${l.codigo}`}
                                    value={r.danoMonto}
                                    inputMode="decimal"
                                    onChange={(e) => cambiar(l.detalleId, { danoMonto: e.target.value })}
                                    className="w-24 rounded border-2 border-slate-400 px-2 py-1 text-right"
                                  />
                                </label>
                              </>
                            )}
                          </div>
                          <label className="flex items-center gap-2 text-lg">
                            Va a:
                            <select
                              aria-label={`Destino de ${l.codigo}`}
                              value={r.destino}
                              onChange={(e) => cambiar(l.detalleId, { destino: e.target.value as Revision['destino'] })}
                              className="rounded border-2 border-slate-400 px-2 py-1"
                            >
                              <option value="lavanderia">Lavandería</option>
                              <option value="reparacion">Reparación</option>
                            </select>
                          </label>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside aria-label="Resumen de la devolución" className="sticky top-0 flex flex-col gap-3 rounded-lg bg-white p-4 shadow">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Fecha en que volvieron</span>
            <input
              type="date"
              value={fecha}
              min={primeraEntrega || undefined}
              max={hoy}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-lg border-2 border-slate-400 px-3 py-2 text-lg"
            />
            <span className="text-base text-slate-600">Si volvieron antes y se registra hoy, elija la fecha real.</span>
          </label>

          {vistaActual && (
            <div className="flex flex-col gap-2 border-t-2 border-slate-200 pt-3">
              <h2 className="text-xl font-bold">Cargos de esta devolución</h2>
              {vistaActual.cargos.length === 0 ? (
                <p className="text-lg text-green-800">Sin cargos.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-base">
                  {vistaActual.cargos.map((c, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{c.descripcion}</span>
                      <span className="font-semibold">{formatearSoles(c.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {vistaActual.completa && vistaActual.plan ? (
                <>
                  <h2 className="mt-2 text-xl font-bold">Al cerrar el pedido</h2>
                  <ResumenLiquidacion plan={vistaActual.plan} documento={pedido.cuenta.garantiaDocumento} />
                </>
              ) : (
                <p className="text-lg font-semibold">Después de esta devolución faltan {vistaActual.faltanDevolver}.</p>
              )}
            </div>
          )}

          {(error || typeof datos === 'string') && (
            <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-2 font-semibold whitespace-pre-line text-red-800">
              {typeof datos === 'string' ? datos : error}
            </p>
          )}
          <Boton variante="exito" onClick={registrar} disabled={guardando || revisiones.size === 0}>
            {guardando ? 'Guardando…' : `Registrar devolución de ${revisiones.size}`}
          </Boton>
        </aside>
      </div>
    </section>
  )
}
