import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatearTelefono } from '../../../../shared/clientes'
import { NOMBRE_REGION, REGIONES, type Region, type ResumenModelo } from '../../../../shared/disfraces'
import { formatearFecha, formatearSoles, hoyEnLima } from '../../../../shared/formato'
import { NOMBRE_ESTADO_PENDIENTE, EVENTOS_SUGERIDOS } from '../../../../shared/pedidos'
import type { PedidoInicio, Periodo } from '../../../../shared/reportes'
import { llamar } from '../../api'
import { Selector } from '../ui/Campos'
import { Cargando } from './ReportesDinero'
import { useReporte } from './useReporte'

const clave = (p: Periodo): string => `${p.desde}|${p.hasta}`

export function ReporteFuera(): React.JSX.Element {
  const fuera = useReporte(() => window.api.reportes.fuera(), 'fuera')
  const vencidos = useReporte(() => window.api.reportes.vencidos(), 'vencidos')
  if (!fuera.datos || !vencidos.datos) return <Cargando error={fuera.error ?? vencidos.error} />
  const fila = (p: PedidoInicio, detalle: string): React.JSX.Element => (
    <li key={p.pedidoId}>
      <Link to={`/alquileres/${p.pedidoId}`} className="text-blue-800 hover:underline">
        N.° {p.pedidoId} · {p.clienteNombre}
      </Link>{' '}
      — {detalle} · ☎ {formatearTelefono(p.telefono)}
    </li>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border-2 border-red-700 bg-red-50 p-3">
          <h3 className="mb-2 text-xl font-bold text-red-800">Alquileres vencidos ({vencidos.datos.vencidas.length})</h3>
          <ul className="flex flex-col gap-1 text-lg">
            {vencidos.datos.vencidas.map((p) =>
              fila(p, `${p.diasRetraso} días de retraso, faltan ${p.faltanDevolver}${p.moraEstimada ? `, mora estimada ${formatearSoles(p.moraEstimada)}` : ''}`)
            )}
            {vencidos.datos.vencidas.length === 0 && <li>Ninguno.</li>}
          </ul>
        </div>
        <div className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3">
          <h3 className="mb-2 text-xl font-bold">Reservas no recogidas ({vencidos.datos.noRecogidas.length})</h3>
          <ul className="flex flex-col gap-1 text-lg">
            {vencidos.datos.noRecogidas.map((p) => fila(p, `salía el ${formatearFecha(p.fechaSalida)}`))}
            {vencidos.datos.noRecogidas.length === 0 && <li>Ninguna.</li>}
          </ul>
        </div>
      </div>
      <div className="rounded-lg bg-white p-3 shadow">
        <h3 className="mb-2 text-xl font-bold">
          Disfraces fuera ahora ({fuera.datos.reduce((s, p) => s + p.codigos.length, 0)}) y cuándo vuelven
        </h3>
        {fuera.datos.length === 0 ? (
          <p className="text-lg text-slate-700">No hay disfraces fuera.</p>
        ) : (
          <table className="w-full text-left text-lg">
            <tbody>
              {fuera.datos.map((p) => (
                <tr key={p.pedidoId} className={`border-b border-slate-200 ${p.diasRetraso > 0 ? 'text-red-800' : ''}`}>
                  <td className="py-1 whitespace-nowrap">
                    {p.diasRetraso > 0 ? `venció el ${formatearFecha(p.fechaDevolucionPactada)}` : `vuelve el ${formatearFecha(p.fechaDevolucionPactada)}`}
                  </td>
                  <td className="py-1">
                    <Link to={`/alquileres/${p.pedidoId}`} className="text-blue-800 hover:underline">
                      N.° {p.pedidoId} · {p.clienteNombre}
                    </Link>
                  </td>
                  <td className="py-1 font-mono text-base">{p.codigos.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function ReporteMasAlquilados({ periodo }: { periodo: Periodo }): React.JSX.Element {
  const [region, setRegion] = useState<Region | ''>('')
  const [evento, setEvento] = useState('')
  const { datos, error } = useReporte(() => window.api.reportes.masAlquilados(periodo, region, evento), `${clave(periodo)}|${region}|${evento}`)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid w-2/3 grid-cols-2 gap-3">
        <Selector
          etiqueta="Región"
          valor={region}
          onCambio={(v) => setRegion(v as Region | '')}
          opciones={[{ valor: '', texto: 'Todas' }, ...REGIONES.map((r) => ({ valor: r, texto: NOMBRE_REGION[r] }))]}
        />
        <Selector
          etiqueta="Evento"
          valor={evento}
          onCambio={setEvento}
          opciones={[{ valor: '', texto: 'Todos' }, ...EVENTOS_SUGERIDOS.map((e) => ({ valor: e, texto: e }))]}
        />
      </div>
      {!datos ? (
        <Cargando error={error} />
      ) : datos.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-lg shadow">No hubo alquileres con esos filtros.</p>
      ) : (
        <div className="rounded-lg bg-white p-3 shadow">
          <table className="w-full text-left text-lg">
            <thead>
              <tr className="border-b-2 border-slate-300">
                <th className="py-1">#</th>
                <th className="py-1">Disfraz</th>
                <th className="py-1 text-right">Veces alquilado</th>
                <th className="py-1 text-right">Pedidos</th>
                <th className="py-1 text-right">Ingreso</th>
                <th className="w-1/4 py-1" />
              </tr>
            </thead>
            <tbody>
              {datos.map((f, i) => (
                <tr key={f.modeloId} className="border-b border-slate-200">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">
                    {f.modeloNombre}
                    {f.region && <span className="text-base text-slate-600"> · {NOMBRE_REGION[f.region]}</span>}
                  </td>
                  <td className="py-1 text-right font-bold">{f.veces}</td>
                  <td className="py-1 text-right">{f.pedidos}</td>
                  <td className="py-1 text-right">{formatearSoles(f.ingreso)}</td>
                  <td className="py-1">
                    <div className="h-4 bg-blue-600" style={{ width: `${(f.veces / datos[0].veces) * 100}%` }} aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ReporteAgrupados({ periodo }: { periodo: Periodo }): React.JSX.Element {
  const colegios = useReporte(() => window.api.reportes.agrupados(periodo, 'colegio'), `c|${clave(periodo)}`)
  const eventos = useReporte(() => window.api.reportes.agrupados(periodo, 'evento'), `e|${clave(periodo)}`)
  const tabla = (titulo: string, filas: typeof colegios.datos, enlace: boolean): React.JSX.Element => (
    <div className="rounded-lg bg-white p-3 shadow">
      <h3 className="mb-2 text-xl font-bold">{titulo}</h3>
      {!filas || filas.length === 0 ? (
        <p className="text-lg text-slate-700">Sin alquileres en este período.</p>
      ) : (
        <table className="w-full text-left text-lg">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="py-1" />
              <th className="py-1 text-right">Pedidos</th>
              <th className="py-1 text-right">Disfraces</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-b border-slate-200">
                <td className="py-1">
                  {enlace && f.clienteId ? (
                    <Link to={`/clientes/${f.clienteId}`} className="text-blue-800 hover:underline">
                      {f.clave}
                    </Link>
                  ) : (
                    f.clave
                  )}
                </td>
                <td className="py-1 text-right">{f.pedidos}</td>
                <td className="py-1 text-right font-bold">{f.disfraces}</td>
                <td className="py-1 text-right">{formatearSoles(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
  if (!colegios.datos || !eventos.datos) return <Cargando error={colegios.error ?? eventos.error} />
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
      {tabla('Por colegio', colegios.datos, true)}
      {tabla('Por evento', eventos.datos, false)}
    </div>
  )
}

export function ReporteConfeccion(): React.JSX.Element {
  const { datos, error } = useReporte(() => window.api.reportes.confeccion(), 'confeccion')
  const hoy = hoyEnLima()
  if (!datos) return <Cargando error={error} />
  if (datos.length === 0) return <p className="rounded-lg bg-white p-4 text-lg shadow">No hay nada por confeccionar.</p>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg">
        Hay que confeccionar <strong>{datos.reduce((s, f) => s + f.faltan, 0)}</strong> disfraces:
      </p>
      {datos.map((f) => (
        <div key={`${f.modeloId}-${f.talla}`} className="rounded-lg bg-white p-3 shadow">
          <h3 className="text-xl font-bold">
            {f.modeloNombre} · T{f.talla}: faltan {f.faltan}
            <span className={`ml-2 text-lg font-normal ${f.fechaLimiteMasCercana < hoy ? 'text-red-800' : ''}`}>
              (la más urgente: {formatearFecha(f.fechaLimiteMasCercana)})
            </span>
          </h3>
          <ul className="mt-1 text-lg">
            {f.detalle.map((d) => (
              <li key={d.pedidoId}>
                <Link to={`/alquileres/${d.pedidoId}`} className="text-blue-800 hover:underline">
                  N.° {d.pedidoId} · {d.clienteNombre}
                </Link>{' '}
                — {d.faltan} hasta el {formatearFecha(d.fechaLimite)} · {NOMBRE_ESTADO_PENDIENTE[d.estado]}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

const TEMPORADAS: [string, number][] = [
  ['Día de la Madre', 5],
  ['Fiestas Patrias', 7],
  ['Primavera', 9],
  ['Clausuras', 12]
]
const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function colorOcupacion(libres: number, total: number): string {
  if (total === 0) return 'bg-slate-100'
  const r = libres / total
  if (libres === 0) return 'bg-red-600 text-white'
  if (r < 0.34) return 'bg-orange-400'
  if (r < 0.67) return 'bg-yellow-200'
  return 'bg-green-200'
}

export function ReporteCalendario(): React.JSX.Element {
  const hoy = hoyEnLima()
  const [modelos, setModelos] = useState<ResumenModelo[]>([])
  const [modeloId, setModeloId] = useState<number | null>(null)
  const [mes, setMes] = useState(hoy.slice(0, 7))

  useEffect(() => {
    llamar(window.api.modelos.listar())
      .then((m) => setModelos(m.filter((x) => x.activo)))
      .catch(() => {})
  }, [])

  const elegido = modeloId ?? modelos[0]?.id ?? null
  const { datos, error } = useReporte(
    () => window.api.reportes.calendario(elegido ?? 0, mes),
    elegido === null ? '' : `${elegido}|${mes}`
  )

  const irATemporada = (numeroMes: number): void => {
    const actual = Number(hoy.slice(5, 7))
    const anio = Number(hoy.slice(0, 4)) + (numeroMes < actual ? 1 : 0)
    setMes(`${anio}-${String(numeroMes).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Selector
            etiqueta="Disfraz"
            valor={String(elegido ?? '')}
            onCambio={(v) => setModeloId(Number(v))}
            opciones={modelos.map((m) => ({ valor: String(m.id), texto: m.nombre }))}
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Mes</span>
          <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="rounded-lg border-2 border-slate-400 px-2 py-2 text-lg" />
        </label>
        <div className="flex flex-wrap gap-2 pb-1">
          {TEMPORADAS.map(([t, m]) => (
            <button key={t} type="button" onClick={() => irATemporada(m)} className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1 text-base">
              {t}
            </button>
          ))}
        </div>
      </div>
      {elegido === null ? (
        <p className="text-lg">No hay disfraces.</p>
      ) : !datos ? (
        <Cargando error={error} />
      ) : datos.tallas.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-lg shadow">Este disfraz no tiene unidades.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white p-3 shadow">
          <table className="border-separate border-spacing-0.5 text-center text-sm">
            <thead>
              <tr>
                <th className="pr-2 text-left text-base">Talla</th>
                {datos.dias.map((d) => (
                  <th key={d} className={`w-7 font-normal ${d === hoy ? 'font-bold text-blue-800' : ''}`}>
                    <span className="block">{DIAS_SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}</span>
                    {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.tallas.map((t) => (
                <tr key={t.talla}>
                  <th className="pr-2 text-left text-base whitespace-nowrap">
                    T{t.talla} <span className="font-normal text-slate-600">({t.total})</span>
                  </th>
                  {t.libres.map((l, i) => (
                    <td key={i} title={`${formatearFecha(datos.dias[i])}: ${l} de ${t.total} libres`} className={`h-7 w-7 rounded ${colorOcupacion(l, t.total)}`}>
                      {l}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-base text-slate-700">
            Cada casilla: unidades libres ese día (se cuenta el día de lavado). Verde: casi todas libres · rojo: ninguna libre.
          </p>
        </div>
      )}
    </div>
  )
}
