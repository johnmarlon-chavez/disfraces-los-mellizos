import { Link } from 'react-router'
import { formatearTelefono } from '../../../../shared/clientes'
import { formatearFecha, formatearSoles } from '../../../../shared/formato'
import { NOMBRE_ESTADO_PEDIDO, NOMBRE_MEDIO } from '../../../../shared/pedidos'
import { NOMBRE_CATEGORIA, type CategoriaIngreso, type FilaIngresos, type Periodo } from '../../../../shared/reportes'
import { useReporte } from './useReporte'

const CATEGORIAS: CategoriaIngreso[] = ['alquiler', 'retenido', 'mora', 'danos']
const COLOR: Record<CategoriaIngreso, string> = {
  alquiler: 'bg-blue-600',
  retenido: 'bg-violet-600',
  mora: 'bg-amber-500',
  danos: 'bg-red-600'
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (clave: string): string => `${MESES[Number(clave.slice(5, 7)) - 1]} ${clave.slice(0, 4)}`
const clave = (p: Periodo): string => `${p.desde}|${p.hasta}`

export function Cargando({ error }: { error: string | null }): React.JSX.Element {
  return error ? <p role="alert" className="text-lg text-red-800">{error}</p> : <p className="text-lg">Cargando…</p>
}

function Barras({ filas, etiqueta }: { filas: FilaIngresos[]; etiqueta: (clave: string) => string }): React.JSX.Element {
  const maximo = Math.max(1, ...filas.map((f) => CATEGORIAS.reduce((s, c) => s + Math.max(0, f[c]), 0)))
  if (filas.length === 0) return <p className="text-lg text-slate-700">No hubo ingresos en este período.</p>
  return (
    <table className="w-full text-left text-lg">
      <thead>
        <tr className="border-b-2 border-slate-300">
          <th className="py-1 pr-2">Fecha</th>
          {CATEGORIAS.map((c) => (
            <th key={c} className="py-1 pr-2 text-right">
              {NOMBRE_CATEGORIA[c]}
            </th>
          ))}
          <th className="py-1 pr-2 text-right">Total</th>
          <th className="w-1/4 py-1" />
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.clave} className="border-b border-slate-200">
            <td className="py-1 pr-2 whitespace-nowrap">{etiqueta(f.clave)}</td>
            {CATEGORIAS.map((c) => (
              <td key={c} className={`py-1 pr-2 text-right whitespace-nowrap ${f[c] < 0 ? 'text-red-700' : f[c] === 0 ? 'text-slate-400' : ''}`}>
                {formatearSoles(f[c])}
              </td>
            ))}
            <td className="py-1 pr-2 text-right font-bold whitespace-nowrap">{formatearSoles(f.total)}</td>
            <td className="py-1">
              <div className="flex h-4 w-full" aria-hidden>
                {CATEGORIAS.map((c) => (
                  <div key={c} className={COLOR[c]} style={{ width: `${(Math.max(0, f[c]) / maximo) * 100}%` }} />
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ReporteIngresos({ periodo }: { periodo: Periodo }): React.JSX.Element {
  const { datos, error } = useReporte(() => window.api.reportes.ingresos(periodo), clave(periodo))
  if (!datos) return <Cargando error={error} />
  const t = datos.totales
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-3">
        {CATEGORIAS.map((c) => (
          <div key={c} className="rounded-lg border-2 border-slate-200 bg-white p-3">
            <p className="flex items-center gap-2 text-base text-slate-700">
              <span className={`inline-block size-3 rounded-sm ${COLOR[c]}`} /> {NOMBRE_CATEGORIA[c]}
            </p>
            <p className="text-2xl font-bold">{formatearSoles(t[c])}</p>
          </div>
        ))}
        <div className="rounded-lg border-2 border-green-700 bg-green-50 p-3">
          <p className="text-base text-slate-700">Total de ingresos</p>
          <p className="text-2xl font-bold text-green-900">{formatearSoles(t.total)}</p>
        </div>
      </div>
      <p className="text-base text-slate-700">
        Por la fecha en que entró el dinero. La garantía no es ingreso. Por cobrar (deudas de pedidos cerrados, aún no es ingreso):{' '}
        <strong>{formatearSoles(datos.porCobrar)}</strong>
      </p>
      {datos.porMes.length > 1 && (
        <div className="rounded-lg bg-white p-3 shadow">
          <h3 className="mb-2 text-xl font-bold">Por mes</h3>
          <Barras filas={datos.porMes} etiqueta={nombreMes} />
        </div>
      )}
      <div className="rounded-lg bg-white p-3 shadow">
        <h3 className="mb-2 text-xl font-bold">Por día</h3>
        <Barras filas={datos.porDia} etiqueta={(d) => formatearFecha(d)} />
      </div>
    </div>
  )
}

export function ReporteMedios({ periodo }: { periodo: Periodo }): React.JSX.Element {
  const { datos, error } = useReporte(() => window.api.reportes.medios(periodo), clave(periodo))
  if (!datos) return <Cargando error={error} />
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
      <div className="rounded-lg bg-white p-3 shadow">
        <h3 className="mb-1 text-xl font-bold">Dinero por medio de pago</h3>
        <p className="mb-2 text-base text-slate-700">Lo que entró y salió de verdad en el período, incluidas las garantías. Sirve para cuadrar la caja.</p>
        <table className="w-full text-left text-lg">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="py-1">Medio</th>
              <th className="py-1 text-right">Entró</th>
              <th className="py-1 text-right">Salió</th>
              <th className="py-1 text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {datos.medios.map((m) => (
              <tr key={m.medio} className="border-b border-slate-200">
                <td className="py-1">{NOMBRE_MEDIO[m.medio]}</td>
                <td className="py-1 text-right">{formatearSoles(m.entradas)}</td>
                <td className="py-1 text-right">{formatearSoles(m.salidas)}</td>
                <td className="py-1 text-right font-bold">{formatearSoles(m.neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border-2 border-slate-400 bg-white p-3">
        <h3 className="text-xl font-bold">Garantías en custodia: {formatearSoles(datos.totalCustodia)}</h3>
        <p className="mb-2 text-base text-slate-700">
          Dinero de garantías que todavía no se devolvió ni se usó para cubrir deudas. <strong>No es de la tienda</strong>: se devuelve.
          (Al día de hoy, no depende del período.)
        </p>
        {datos.custodia.length === 0 ? (
          <p className="text-lg text-slate-700">No hay garantías en custodia.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-lg">
            {datos.custodia.map((g) => (
              <li key={g.pedidoId} className="flex justify-between gap-2">
                <Link to={`/alquileres/${g.pedidoId}`} className="text-blue-800 hover:underline">
                  N.° {g.pedidoId} · {g.clienteNombre} ({NOMBRE_ESTADO_PEDIDO[g.estado].toLowerCase()}, {NOMBRE_MEDIO[g.medio].toLowerCase()})
                </Link>
                <strong className="whitespace-nowrap">{formatearSoles(g.monto)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function ReporteDescuentos({ periodo }: { periodo: Periodo }): React.JSX.Element {
  const { datos, error } = useReporte(() => window.api.reportes.descuentos(periodo), clave(periodo))
  if (!datos) return <Cargando error={error} />
  const total = datos.pedidos.reduce((s, p) => s + p.descuento, 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-white p-3 shadow">
        <h3 className="mb-2 text-xl font-bold">Pedidos con descuento · total descontado {formatearSoles(total)}</h3>
        {datos.pedidos.length === 0 ? (
          <p className="text-lg text-slate-700">Ningún pedido tuvo descuento en este período.</p>
        ) : (
          <table className="w-full text-left text-lg">
            <thead>
              <tr className="border-b-2 border-slate-300">
                <th className="py-1">Pedido</th>
                <th className="py-1">Salida</th>
                <th className="py-1 text-right">Precio normal</th>
                <th className="py-1 text-right">Cobrado</th>
                <th className="py-1 text-right">Descuento</th>
              </tr>
            </thead>
            <tbody>
              {datos.pedidos.map((p) => (
                <tr key={p.pedidoId} className="border-b border-slate-200">
                  <td className="py-1">
                    <Link to={`/alquileres/${p.pedidoId}`} className="text-blue-800 hover:underline">
                      N.° {p.pedidoId} · {p.clienteNombre}
                    </Link>
                  </td>
                  <td className="py-1">{formatearFecha(p.fechaSalida)}</td>
                  <td className="py-1 text-right">{formatearSoles(p.original)}</td>
                  <td className="py-1 text-right">{formatearSoles(p.cobrado)}</td>
                  <td className="py-1 text-right font-bold">{formatearSoles(p.descuento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-lg bg-white p-3 shadow">
        <h3 className="mb-2 text-xl font-bold">Moras rebajadas o perdonadas</h3>
        {datos.moras.length === 0 ? (
          <p className="text-lg text-slate-700">Ninguna en este período.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-lg">
            {datos.moras.map((m, i) => (
              <li key={i}>
                <Link to={`/alquileres/${m.pedidoId}`} className="text-blue-800 hover:underline">
                  N.° {m.pedidoId} · {m.clienteNombre}
                </Link>
                : {m.descripcion} — de {formatearSoles(m.original)} a {formatearSoles(m.cobrado)} · <em>{m.motivo}</em>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function ReporteDeudas(): React.JSX.Element {
  const { datos, error } = useReporte(() => window.api.reportes.deudas(), 'deudas')
  if (!datos) return <Cargando error={error} />
  if (datos.length === 0) return <p className="rounded-lg bg-white p-4 text-lg shadow">Ningún cliente debe.</p>
  return (
    <div className="rounded-lg bg-white p-3 shadow">
      <h3 className="mb-2 text-xl font-bold">Total por cobrar: {formatearSoles(datos.reduce((s, d) => s + d.monto, 0))}</h3>
      <table className="w-full text-left text-lg">
        <tbody>
          {datos.map((d) => (
            <tr key={d.clienteId} className="border-b border-slate-200">
              <td className="py-1">
                <Link to={`/clientes/${d.clienteId}`} className="font-semibold text-blue-800 hover:underline">
                  {d.clienteNombre}
                </Link>
              </td>
              <td className="py-1">☎ {formatearTelefono(d.telefono)}</td>
              <td className="py-1">
                {d.pedidos.map((id) => (
                  <Link key={id} to={`/alquileres/${id}`} className="mr-2 text-blue-800 hover:underline">
                    N.° {id}
                  </Link>
                ))}
              </td>
              <td className="py-1">{d.documentoRetenido ? `Documento ${d.documentoRetenido} retenido` : ''}</td>
              <td className="py-1 text-right font-bold text-red-800">{formatearSoles(d.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
