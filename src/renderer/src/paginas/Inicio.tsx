import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { formatearTelefono } from '../../../shared/clientes'
import { formatearFecha, formatearSoles } from '../../../shared/formato'
import type { DatosInicio, PedidoInicio, UnidadInicio } from '../../../shared/reportes'
import { llamar, mensajeDe } from '../api'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton from '../componentes/ui/Boton'

type Tono = 'rojo' | 'ambar' | 'normal'

const BORDE: Record<Tono, string> = {
  rojo: 'border-red-700 bg-red-50',
  ambar: 'border-amber-600 bg-amber-50',
  normal: 'border-slate-200 bg-white'
}

const VISIBLES = 4

/** Tarjeta de Inicio. Vacía, se muestra compacta en una línea. */
function Tarjeta({
  titulo,
  cantidad,
  tono,
  vacio,
  children,
  ancho = false
}: {
  titulo: string
  cantidad: number
  tono: Tono
  vacio: string
  children: (verTodas: boolean) => ReactNode
  ancho?: boolean
}): React.JSX.Element {
  const [verTodas, setVerTodas] = useState(false)
  if (cantidad === 0) {
    return (
      <section aria-label={titulo} className={`flex items-center gap-2 rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-lg ${ancho ? 'col-span-2' : ''}`}>
        <span className="font-bold text-green-800">✓</span>
        <span className="text-slate-700">{vacio}</span>
      </section>
    )
  }
  return (
    <section aria-label={titulo} className={`rounded-lg border-2 p-3 ${BORDE[tono]} ${ancho ? 'col-span-2' : ''}`}>
      <h2 className={`mb-2 text-xl font-bold ${tono === 'rojo' ? 'text-red-800' : ''}`}>
        {titulo} <span className="font-normal">({cantidad})</span>
      </h2>
      {children(verTodas)}
      {cantidad > VISIBLES && (
        <button type="button" onClick={() => setVerTodas(!verTodas)} className="mt-1 text-base font-semibold text-blue-800 underline">
          {verTodas ? 'Ver menos' : `Ver todas (${cantidad})`}
        </button>
      )}
    </section>
  )
}

function FilaPedido({ p, detalle }: { p: PedidoInicio; detalle: ReactNode }): React.JSX.Element {
  return (
    <li>
      <Link to={`/alquileres/${p.pedidoId}`} className="block rounded px-1 py-0.5 hover:bg-white/70">
        <span className="block truncate text-lg">
          <strong>{p.clienteNombre}</strong> <span className="text-base text-slate-700">· N.° {p.pedidoId} · {p.evento}</span>
        </span>
        <span className="block text-base">{detalle}</span>
      </Link>
    </li>
  )
}

function Lista<T>({ items, verTodas, render }: { items: T[]; verTodas: boolean; render: (x: T) => ReactNode }): React.JSX.Element {
  return <ul className="flex flex-col gap-0.5">{(verTodas ? items : items.slice(0, VISIBLES)).map(render)}</ul>
}

function TarjetaLimpieza({ lavanderia, reparacion, onLiberar }: { lavanderia: UnidadInicio[]; reparacion: UnidadInicio[]; onLiberar: (ids: number[]) => Promise<void> }): React.JSX.Element {
  const [elegidas, setElegidas] = useState<Set<number>>(new Set())
  const todas = [...lavanderia, ...reparacion]
  return (
    <Tarjeta titulo="En lavandería y reparación" cantidad={todas.length} tono="normal" vacio="Nada en lavandería ni en reparación">
      {(verTodas) => (
        <>
          <ul className="flex flex-col gap-0.5">
            {(verTodas ? todas : todas.slice(0, VISIBLES)).map((u) => (
              <li key={u.id}>
                <label className="flex items-baseline gap-2 text-lg">
                  <input
                    type="checkbox"
                    className="size-5 self-center"
                    checked={elegidas.has(u.id)}
                    onChange={(e) => {
                      const s = new Set(elegidas)
                      if (e.target.checked) s.add(u.id)
                      else s.delete(u.id)
                      setElegidas(s)
                    }}
                  />
                  <span className="font-mono font-semibold">{u.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-base">
                    {u.modeloNombre} · T{u.talla}
                    {u.estadoFisico === 'reparacion' && <span className="text-amber-800"> · reparación{u.observaciones && `: ${u.observaciones}`}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Boton compacto variante="secundario" onClick={() => setElegidas(new Set(lavanderia.map((u) => u.id)))} disabled={lavanderia.length === 0}>
              Elegir toda la lavandería
            </Boton>
            <Boton
              compacto
              variante="exito"
              disabled={elegidas.size === 0}
              onClick={async () => {
                await onLiberar([...elegidas])
                setElegidas(new Set())
              }}
            >
              Marcar como disponibles ({elegidas.size})
            </Boton>
          </div>
        </>
      )}
    </Tarjeta>
  )
}

export default function Inicio(): React.JSX.Element {
  const avisos = useAvisos()
  const [d, setD] = useState<DatosInicio | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setD(await llamar(window.api.inicio.datos()))
  }, [])

  useEffect(() => {
    let vigente = true
    llamar(window.api.inicio.datos())
      .then((x) => vigente && setD(x))
      .catch((e) => vigente && setError(mensajeDe(e)))
    return () => {
      vigente = false
    }
  }, [])

  if (error) return <p role="alert" className="text-lg text-red-800">{error}</p>
  if (!d) return <p className="text-lg">Cargando…</p>

  const liberar = async (ids: number[]): Promise<void> => {
    try {
      const codigos = await llamar(window.api.inicio.liberarUnidades(ids))
      avisos.exito(`${codigos.length} marcados como disponibles.`)
      await cargar()
    } catch (e) {
      avisos.error(mensajeDe(e))
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Inicio</h1>
          <p className="text-lg text-slate-700">Hoy es {formatearFecha(d.hoy)}</p>
        </div>
        {d.dinero && (
          <div aria-label="Dinero de hoy" className="flex gap-3 text-lg">
            <p className="rounded-lg border-2 border-green-700 bg-green-50 px-3 py-1">
              Ingresos de hoy: <strong>{formatearSoles(d.dinero.ingresosHoy)}</strong>
            </p>
            <p className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1" title="Dinero de garantías que hay que devolver: no es de la tienda">
              Garantías en custodia: <strong>{formatearSoles(d.dinero.custodia)}</strong>
              <span className="block text-sm text-slate-600">no es ingreso: se devuelve</span>
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 1. Lo más urgente */}
        <Tarjeta titulo="Devoluciones vencidas" cantidad={d.vencidas.length} tono="rojo" vacio="Sin devoluciones vencidas">
          {(v) => (
            <Lista
              items={d.vencidas}
              verTodas={v}
              render={(p) => (
                <FilaPedido
                  key={p.pedidoId}
                  p={p}
                  detalle={
                    <span className="font-semibold text-red-800">
                      {p.diasRetraso} {p.diasRetraso === 1 ? 'día' : 'días'} · faltan {p.faltanDevolver} · ☎ {formatearTelefono(p.telefono)}
                      {p.moraEstimada > 0 && ` · mora ${formatearSoles(p.moraEstimada)}`}
                    </span>
                  }
                />
              )}
            />
          )}
        </Tarjeta>
        <Tarjeta titulo="Reservas no recogidas" cantidad={d.noRecogidas.length} tono="ambar" vacio="Sin reservas no recogidas">
          {(v) => (
            <Lista
              items={d.noRecogidas}
              verTodas={v}
              render={(p) => (
                <FilaPedido key={p.pedidoId} p={p} detalle={<>salía el {formatearFecha(p.fechaSalida).slice(0, 5)} · ☎ {formatearTelefono(p.telefono)}</>} />
              )}
            />
          )}
        </Tarjeta>

        {/* 2. Hoy */}
        <Tarjeta titulo="Entregas de hoy" cantidad={d.entregasHoy.length} tono="normal" vacio="Sin entregas para hoy">
          {(v) => (
            <Lista
              items={d.entregasHoy}
              verTodas={v}
              render={(p) => <FilaPedido key={p.pedidoId} p={p} detalle={<>{p.faltanEntregar} {p.faltanEntregar === 1 ? 'disfraz' : 'disfraces'} por entregar</>} />}
            />
          )}
        </Tarjeta>
        <Tarjeta titulo="Devoluciones de hoy" cantidad={d.devolucionesHoy.length} tono="normal" vacio="Sin devoluciones para hoy">
          {(v) => (
            <Lista
              items={d.devolucionesHoy}
              verTodas={v}
              render={(p) => <FilaPedido key={p.pedidoId} p={p} detalle={<>faltan {p.faltanDevolver} de {p.unidades}</>} />}
            />
          )}
        </Tarjeta>

        {/* 3. Confección */}
        <Tarjeta
          titulo="Pendientes de confección"
          cantidad={d.pendientes.length}
          tono={d.pendientes.some((x) => x.vencido || x.vencePronto) ? 'ambar' : 'normal'}
          vacio="Nada por confeccionar"
          ancho
        >
          {(v) => (
            <Lista
              items={d.pendientes}
              verTodas={v}
              render={(x) => (
                <li key={x.id}>
                  <Link to={`/alquileres/${x.pedidoId}`} className="flex items-baseline gap-2 rounded px-1 py-0.5 text-lg hover:bg-white/70">
                    <span className="min-w-0 flex-1 truncate">
                      <strong>
                        {x.modeloNombre} · T{x.talla} × {x.faltan}
                      </strong>{' '}
                      <span className="text-base text-slate-700">· {x.clienteNombre} (N.° {x.pedidoId})</span>
                    </span>
                    <span className={`text-base whitespace-nowrap ${x.vencido ? 'font-bold text-red-800' : x.vencePronto ? 'font-semibold text-amber-800' : ''}`}>
                      {x.vencido ? 'venció el' : 'hasta el'} {formatearFecha(x.fechaLimite)}
                    </span>
                  </Link>
                </li>
              )}
            />
          )}
        </Tarjeta>

        {/* 4. Lo demás */}
        <TarjetaLimpieza lavanderia={d.enLavanderia} reparacion={d.enReparacion} onLiberar={liberar} />
        <Tarjeta titulo="Próximas entregas (7 días)" cantidad={d.proximasEntregas.length} tono="normal" vacio="Sin entregas en los próximos 7 días">
          {(v) => (
            <Lista
              items={d.proximasEntregas}
              verTodas={v}
              render={(p) => (
                <FilaPedido key={p.pedidoId} p={p} detalle={<>sale el {formatearFecha(p.fechaSalida).slice(0, 5)} · {p.unidades} {p.unidades === 1 ? 'disfraz' : 'disfraces'}</>} />
              )}
            />
          )}
        </Tarjeta>
        <Tarjeta titulo="Clientes que deben" cantidad={d.deudas.length} tono="normal" vacio="Nadie debe" ancho>
          {(v) => (
            <Lista
              items={d.deudas}
              verTodas={v}
              render={(x) => (
                <li key={x.clienteId}>
                  <Link to={`/clientes/${x.clienteId}`} className="flex items-baseline gap-2 rounded px-1 py-0.5 text-lg hover:bg-white/70">
                    <span className="min-w-0 flex-1 truncate">
                      <strong>{x.clienteNombre}</strong>{' '}
                      <span className="text-base text-slate-700">
                        · ☎ {formatearTelefono(x.telefono)}
                        {x.documentoRetenido && ` · documento ${x.documentoRetenido} retenido`}
                      </span>
                    </span>
                    <span className="font-bold text-red-800">{formatearSoles(x.monto)}</span>
                  </Link>
                </li>
              )}
            />
          )}
        </Tarjeta>
      </div>
    </section>
  )
}
