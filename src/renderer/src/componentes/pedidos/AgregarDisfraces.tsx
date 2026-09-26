import { useState } from 'react'
import { NOMBRE_REGION, mismaTalla, normalizarTexto } from '../../../../shared/disfraces'
import { formatearSoles } from '../../../../shared/formato'
import type { ModeloDisponible } from '../../../../shared/pedidos'
import SelectorTalla from '../disfraces/SelectorTalla'
import Boton from '../ui/Boton'

interface Props {
  catalogo: ModeloDisponible[] | null
  /** Unidades del carrito por modelo+talla, para descontarlas de las libres. */
  enCarrito: (modeloId: number, talla: string) => number
  onAgregar: (modelo: ModeloDisponible, talla: string, cantidad: number) => Promise<void>
  deshabilitado: string | null
}

export default function AgregarDisfraces({ catalogo, enCarrito, onAgregar, deshabilitado }: Props): React.JSX.Element {
  const [texto, setTexto] = useState('')
  const [modeloId, setModeloId] = useState<number | null>(null)
  const [talla, setTalla] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [agregando, setAgregando] = useState(false)
  const [otraTalla, setOtraTalla] = useState(false)

  if (deshabilitado) {
    return <p className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-lg text-slate-700">{deshabilitado}</p>
  }
  if (!catalogo) return <p className="text-lg">Cargando disfraces…</p>

  const palabras = normalizarTexto(texto).split(/\s+/).filter(Boolean)
  const encontrados = catalogo
    .filter((m) => {
      const t = normalizarTexto(`${m.nombre} ${m.categoria} ${m.region ? NOMBRE_REGION[m.region] : ''}`)
      return palabras.every((p) => t.includes(p))
    })
    .slice(0, 8)
  const modelo = catalogo.find((m) => m.id === modeloId) ?? null
  const n = Number(cantidad)
  const cantidadValida = Number.isInteger(n) && n >= 1 && n <= 200

  const agregar = async (): Promise<void> => {
    if (!modelo || !talla || !cantidadValida) return
    setAgregando(true)
    try {
      await onAgregar(modelo, talla, n)
      setCantidad('1')
    } finally {
      setAgregando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Buscar disfraz</span>
        <input
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setModeloId(null)
            setTalla('')
          }}
          placeholder="Ej. huaylas, marinera, sierra…"
          className="w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg"
        />
      </label>

      {!modelo && (
        <ul aria-label="Disfraces encontrados" className="grid grid-cols-2 gap-2">
          {encontrados.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setModeloId(m.id)
                  setTalla('')
                  setOtraTalla(m.tallas.length === 0)
                }}
                className="w-full rounded-lg border-2 border-slate-200 bg-white p-2 text-left hover:border-blue-700"
              >
                <span className="block truncate text-lg font-semibold">{m.nombre}</span>
                <span className="block text-base text-slate-700">
                  {formatearSoles(m.precioSugerido)}
                  {m.region && ` · ${NOMBRE_REGION[m.region]}`}
                </span>
              </button>
            </li>
          ))}
          {encontrados.length === 0 && <li className="text-slate-700">No se encontró ningún disfraz.</li>}
        </ul>
      )}

      {modelo && (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-blue-700 bg-blue-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xl font-bold">
              {modelo.nombre} <span className="font-normal text-slate-700">· {formatearSoles(modelo.precioSugerido)} c/u</span>
            </p>
            <Boton variante="secundario" compacto onClick={() => setModeloId(null)}>
              Elegir otro
            </Boton>
          </div>
          {modelo.tallas.length === 0 && (
            <p className="text-lg">Este disfraz todavía no tiene unidades: se registrará para confeccionar.</p>
          )}
          {modelo.tallas.length > 0 && !otraTalla && (
            <div role="radiogroup" aria-label="Talla" className="flex flex-wrap gap-2">
              {modelo.tallas.map((t) => {
                const libres = Math.max(0, t.libres - enCarrito(modelo.id, t.talla))
                const elegida = mismaTalla(t.talla, talla)
                return (
                  <button
                    key={t.talla}
                    type="button"
                    role="radio"
                    aria-checked={elegida}
                    onClick={() => setTalla(t.talla)}
                    className={`rounded-lg border-2 px-3 py-1 text-left ${
                      elegida ? 'border-blue-700 bg-white ring-2 ring-blue-700' : 'border-slate-400 bg-white'
                    }`}
                  >
                    <span className="block text-lg font-bold">T{t.talla}</span>
                    <span className={`block text-sm ${libres === 0 ? 'font-semibold text-red-700' : 'text-slate-700'}`}>
                      {libres} {libres === 1 ? 'libre' : 'libres'} de {t.total}
                    </span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  setOtraTalla(true)
                  setTalla('')
                }}
                className="rounded-lg border-2 border-dashed border-slate-400 bg-white px-3 py-1 text-base"
              >
                Otra talla…
                <span className="block text-sm text-slate-700">para confeccionar</span>
              </button>
            </div>
          )}
          {otraTalla && (
            <div className="flex items-end gap-3">
              <div className="w-72">
                <SelectorTalla valor={talla} onCambio={setTalla} />
              </div>
              {modelo.tallas.length > 0 && (
                <Boton variante="secundario" compacto onClick={() => setOtraTalla(false)}>
                  Ver tallas que hay
                </Boton>
              )}
            </div>
          )}
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Cantidad</span>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputMode="numeric"
                className="w-24 rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg"
              />
            </label>
            <Boton onClick={agregar} disabled={!talla || !cantidadValida || agregando}>
              {agregando ? 'Buscando…' : 'Agregar al pedido'}
            </Boton>
            {!talla && modelo.tallas.length > 0 && <p className="pb-3 text-slate-700">Elija la talla.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
