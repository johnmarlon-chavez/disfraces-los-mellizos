import { useState } from 'react'
import { formatearSoles } from '../../../../shared/formato'
import Boton from '../ui/Boton'
import CampoPrecio from '../ui/CampoPrecio'
import { agrupar, type LineaCarrito, type PendienteCarrito } from './modeloCarrito'

interface Props {
  lineas: LineaCarrito[]
  pendientes: PendienteCarrito[]
  conflictos: Map<number, string>
  fechaSalida: string
  hoy: string
  onPrecioLinea: (unidadId: number, precio: number) => void
  onPrecioGrupo: (modeloId: number, talla: string, precio: number) => void
  onPrecioModelo: (modeloId: number, precio: number) => void
  onQuitarLinea: (unidadId: number) => void
  onCambiarLinea: (linea: LineaCarrito) => void
  onPendiente: (clave: number, cambio: Partial<PendienteCarrito>) => void
  onQuitarPendiente: (clave: number) => void
}

export default function Carrito(p: Props): React.JSX.Element {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const grupos = agrupar(p.lineas)
  const unidadesPorModelo = (modeloId: number): number =>
    p.lineas.filter((l) => l.modeloId === modeloId).length +
    p.pendientes.filter((x) => x.modeloId === modeloId).reduce((s, x) => s + x.cantidad - x.cantidadAsignada, 0)

  if (grupos.length === 0 && p.pendientes.length === 0) {
    return <p className="text-lg text-slate-700">Todavía no hay disfraces en el pedido.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((g) => {
        const abierto = abiertos.has(g.clave) || g.lineas.some((l) => p.conflictos.has(l.unidadId))
        const precios = new Set(g.lineas.map((l) => l.precioCobrado))
        const precioComun = precios.size === 1 ? g.lineas[0].precioCobrado : null
        const conConflicto = g.lineas.filter((l) => p.conflictos.has(l.unidadId)).length
        const otrasDelModelo = unidadesPorModelo(g.modeloId) > g.lineas.length
        return (
          <section
            key={g.clave}
            aria-label={`${g.modeloNombre} talla ${g.talla}`}
            className={`rounded-lg border-2 p-3 ${conConflicto ? 'border-red-700 bg-red-50' : 'border-slate-300 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-bold">
                {g.modeloNombre} · T{g.talla} × {g.lineas.length}
              </p>
              <button
                type="button"
                className="text-base font-semibold text-blue-800 underline"
                onClick={() => {
                  const s = new Set(abiertos)
                  if (s.has(g.clave)) s.delete(g.clave)
                  else s.add(g.clave)
                  setAbiertos(s)
                }}
              >
                {abierto ? 'Ocultar códigos' : 'Ver códigos'}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {precioComun !== null ? (
                <CampoPrecio
                  etiqueta="c/u"
                  valor={precioComun}
                  onCambio={(v) => p.onPrecioGrupo(g.modeloId, g.talla, v)}
                />
              ) : (
                <span className="text-base text-slate-700">Precios distintos (ver códigos)</span>
              )}
              <span className="ml-auto text-lg font-semibold">
                {formatearSoles(g.lineas.reduce((s, l) => s + l.precioCobrado, 0))}
              </span>
            </div>
            {precioComun !== null && otrasDelModelo && (
              <button
                type="button"
                onClick={() => p.onPrecioModelo(g.modeloId, precioComun)}
                className="mt-1 text-base font-semibold text-blue-800 underline"
              >
                Aplicar este precio a todos los {g.modeloNombre} del pedido
              </button>
            )}
            {conConflicto > 0 && (
              <p className="mt-1 font-semibold text-red-800">
                {conConflicto === 1 ? '1 unidad ya no está libre' : `${conConflicto} unidades ya no están libres`} en estas
                fechas: cámbiela{conConflicto === 1 ? '' : 's'} o quítela{conConflicto === 1 ? '' : 's'}.
              </p>
            )}
            {abierto && (
              <ul className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-2">
                {g.lineas.map((l) => (
                  <li key={l.unidadId} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-20 font-mono font-semibold">{l.codigo}</span>
                      <CampoPrecio
                        etiqueta={`Precio de ${l.codigo}`}
                        etiquetaOculta
                        valor={l.precioCobrado}
                        onCambio={(v) => p.onPrecioLinea(l.unidadId, v)}
                        ancho="w-20"
                      />
                      <Boton compacto variante="secundario" onClick={() => p.onCambiarLinea(l)}>
                        Cambiar
                      </Boton>
                      <Boton compacto variante="secundario" onClick={() => p.onQuitarLinea(l.unidadId)} aria-label={`Quitar ${l.codigo}`}>
                        Quitar
                      </Boton>
                    </div>
                    {l.estadoFisico === 'lavanderia' && (
                      <p className={`text-base ${p.fechaSalida === p.hoy ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
                        {l.codigo} está en lavandería{p.fechaSalida === p.hoy ? ' y el pedido sale hoy.' : '.'}
                      </p>
                    )}
                    {p.conflictos.has(l.unidadId) && <p className="text-base font-semibold text-red-800">{p.conflictos.get(l.unidadId)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {p.pendientes.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-bold">Por confeccionar</h3>
          {p.pendientes.map((x) => {
            const fechaMal = x.fechaLimite > p.fechaSalida
            const faltan = x.cantidad - x.cantidadAsignada
            return (
              <section
                key={x.clave}
                aria-label={`Por confeccionar ${x.modeloNombre} talla ${x.talla}`}
                className="rounded-lg border-2 border-dashed border-amber-600 bg-amber-50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-bold">
                    {x.modeloNombre} · T{x.talla}
                  </p>
                  <Boton
                    compacto
                    variante="secundario"
                    disabled={x.cantidadAsignada > 0}
                    title={x.cantidadAsignada > 0 ? 'Ya tiene unidades asignadas' : undefined}
                    onClick={() => p.onQuitarPendiente(x.clave)}
                  >
                    Quitar
                  </Boton>
                </div>
                <div className="mt-1 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col">
                    <span className="text-base font-semibold">Cantidad</span>
                    <input
                      value={x.cantidad}
                      inputMode="numeric"
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''))
                        p.onPendiente(x.clave, { cantidad: Math.min(200, Math.max(x.cantidadAsignada || 1, n || 0)) })
                      }}
                      className="w-20 rounded-lg border-2 border-slate-400 bg-white px-2 py-1 text-lg"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-base font-semibold">Fecha límite</span>
                    <input
                      type="date"
                      value={x.fechaLimite}
                      min={p.hoy}
                      max={p.fechaSalida}
                      onChange={(e) => p.onPendiente(x.clave, { fechaLimite: e.target.value })}
                      className={`rounded-lg border-2 bg-white px-2 py-1 text-lg ${fechaMal ? 'border-red-700' : 'border-slate-400'}`}
                    />
                  </label>
                  <CampoPrecio etiqueta="c/u" valor={x.precioCobrado} onCambio={(v) => p.onPendiente(x.clave, { precioCobrado: v })} ancho="w-24" />
                </div>
                <p className="mt-1 text-base text-slate-700">
                  {x.cantidadAsignada > 0 ? `Asignadas ${x.cantidadAsignada}; faltan ${faltan}. ` : ''}
                  Subtotal por confeccionar: {formatearSoles(faltan * x.precioCobrado)}
                </p>
                {fechaMal && <p className="font-semibold text-red-800">La fecha límite no puede ser después de la salida.</p>}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
