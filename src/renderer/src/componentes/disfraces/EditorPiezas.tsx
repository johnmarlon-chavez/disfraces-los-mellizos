import { useId } from 'react'
import type { PiezaEditable } from '../../../../shared/disfraces'
import { formatearSoles, leerMonto } from '../../../../shared/formato'
import Boton from '../ui/Boton'

export interface FilaPieza {
  clave: number
  id?: number
  nombre: string
  costo: string
}

let siguienteClave = 1

export function piezasAFilas(piezas: PiezaEditable[]): FilaPieza[] {
  return piezas.map((p) => ({
    clave: siguienteClave++,
    id: p.id,
    nombre: p.nombre,
    costo: formatearSoles(p.costoReposicion).replace('S/ ', '')
  }))
}

/** Convierte las filas del formulario a piezas, o devuelve el primer error encontrado. */
export function filasAPiezas(filas: FilaPieza[]): { piezas: PiezaEditable[] } | { error: string } {
  const piezas: PiezaEditable[] = []
  for (const f of filas) {
    const nombre = f.nombre.trim()
    if (!nombre && !f.costo.trim()) continue // fila vacía: se ignora
    if (!nombre) return { error: 'Cada pieza debe tener un nombre.' }
    const costo = f.costo.trim() === '' ? { ok: true as const, centimos: 0 } : leerMonto(f.costo)
    if (!costo.ok) return { error: `Pieza "${nombre}": ${costo.error}` }
    piezas.push({ id: f.id, nombre, costoReposicion: costo.centimos })
  }
  return { piezas }
}

interface Props {
  filas: FilaPieza[]
  onCambio: (filas: FilaPieza[]) => void
}

export default function EditorPiezas({ filas, onCambio }: Props): React.JSX.Element {
  const id = useId()
  const cambiar = (clave: number, campo: 'nombre' | 'costo', valor: string): void =>
    onCambio(filas.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)))

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">Piezas</legend>
      {filas.length === 0 && <p className="text-slate-600">Sin piezas registradas.</p>}
      {filas.length > 0 && (
        <div className="grid grid-cols-[1fr_9rem_auto] items-center gap-2 text-base font-semibold text-slate-700">
          <span id={`${id}-n`}>Nombre de la pieza</span>
          <span id={`${id}-c`}>Costo si se pierde</span>
          <span />
        </div>
      )}
      {filas.map((f) => (
        <div key={f.clave} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
          <input
            value={f.nombre}
            onChange={(e) => cambiar(f.clave, 'nombre', e.target.value)}
            aria-labelledby={`${id}-n`}
            placeholder="Ej. Máscara"
            className="w-full rounded-lg border-2 border-slate-400 px-3 py-2 text-lg"
          />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-700">S/</span>
            <input
              value={f.costo}
              onChange={(e) => cambiar(f.clave, 'costo', e.target.value)}
              aria-labelledby={`${id}-c`}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-lg border-2 border-slate-400 px-3 py-2 text-lg"
            />
          </div>
          <Boton variante="secundario" compacto onClick={() => onCambio(filas.filter((x) => x.clave !== f.clave))}>
            Quitar
          </Boton>
        </div>
      ))}
      <div>
        <Boton
          variante="secundario"
          compacto
          onClick={() => onCambio([...filas, { clave: siguienteClave++, nombre: '', costo: '' }])}
        >
          + Agregar pieza
        </Boton>
      </div>
    </fieldset>
  )
}
