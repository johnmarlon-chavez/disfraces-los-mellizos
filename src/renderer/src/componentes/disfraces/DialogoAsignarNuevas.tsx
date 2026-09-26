import { useState } from 'react'
import { formatearFecha } from '../../../../shared/formato'
import type { PendienteAbierto } from '../../../../shared/pedidos'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'

interface Props {
  modeloNombre: string
  talla: string
  /** Unidades recién agregadas, aún sin pedido. */
  unidades: { id: number; codigo: string }[]
  pendientes: PendienteAbierto[]
  onCerrar: (asignadas: number) => void
}

/** Después de agregar unidades: ofrecer asignarlas a los pedidos que esperan ese modelo y talla. */
export default function DialogoAsignarNuevas({ modeloNombre, talla, unidades, pendientes, onCerrar }: Props): React.JSX.Element {
  const [libres, setLibres] = useState(unidades)
  const [lista, setLista] = useState(pendientes)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const asignadas = unidades.length - libres.length

  const asignar = async (p: PendienteAbierto): Promise<void> => {
    setError(null)
    const elegidas = libres.slice(0, p.faltan)
    try {
      const codigos = await llamar(window.api.pendientes.asignar(p.id, elegidas.map((u) => u.id)))
      setLibres(libres.filter((u) => !codigos.includes(u.codigo)))
      setLista(lista.map((x) => (x.id === p.id ? { ...x, faltan: x.faltan - codigos.length } : x)).filter((x) => x.faltan > 0))
      setMensaje(`${codigos.join(', ')} asignadas al pedido N.° ${p.pedidoId} (${p.clienteNombre}).`)
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  return (
    <Dialogo
      titulo={`Hay pedidos esperando ${modeloNombre} talla ${talla}`}
      onCerrar={() => onCerrar(asignadas)}
      ancho="amplio"
      pie={
        <div className="flex justify-end">
          <Boton onClick={() => onCerrar(asignadas)}>{asignadas > 0 ? 'Listo' : 'Ahora no'}</Boton>
        </div>
      }
    >
      <p className="mb-3 text-lg">
        Unidades nuevas sin pedido: <strong className="font-mono">{libres.map((u) => u.codigo).join(', ') || 'ninguna'}</strong>
      </p>
      {mensaje && (
        <p role="status" className="mb-3 rounded-lg bg-green-50 p-2 text-lg font-semibold text-green-800">
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 font-semibold text-red-700">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {lista.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-amber-600 bg-amber-50 p-3">
            <span className="text-lg">
              <strong>{p.clienteNombre}</strong> · {p.evento} · sale el {formatearFecha(p.fechaSalida)}
              <span className="block text-base">
                Faltan {p.faltan} · fecha límite {formatearFecha(p.fechaLimite)}
              </span>
            </span>
            <Boton compacto onClick={() => asignar(p)} disabled={libres.length === 0}>
              Asignar {Math.min(p.faltan, libres.length)} aquí
            </Boton>
          </li>
        ))}
        {lista.length === 0 && <li className="text-lg text-green-800">Todos los pendientes de esta talla quedaron cubiertos.</li>}
      </ul>
    </Dialogo>
  )
}
