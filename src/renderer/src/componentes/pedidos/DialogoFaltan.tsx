import { useState } from 'react'
import { formatearFecha } from '../../../../shared/formato'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'

export interface Faltante {
  modeloNombre: string
  talla: string
  pedidas: number
  libres: number
  faltan: number
}

interface Props {
  faltante: Faltante
  fechaLimiteSugerida: string
  fechaSalida: string
  hoy: string
  onAgregarYConfeccionar: (fechaLimite: string) => void
  onSoloLibres: () => void
  onCancelar: () => void
}

/** "Hay 5 libres, faltan 3": agregar las libres y registrar las que faltan por confeccionar. */
export default function DialogoFaltan(p: Props): React.JSX.Element {
  const [fechaLimite, setFechaLimite] = useState(p.fechaLimiteSugerida)
  const { faltante: f } = p
  const fechaValida = fechaLimite >= p.hoy && fechaLimite <= p.fechaSalida
  const titulo = f.libres === 0 ? 'No hay unidades libres' : `Hay ${f.libres} ${f.libres === 1 ? 'libre' : 'libres'}, faltan ${f.faltan}`

  return (
    <Dialogo
      titulo={titulo}
      onCerrar={p.onCancelar}
      ancho="amplio"
      pie={
        <div className="flex flex-wrap justify-end gap-3">
          <Boton variante="secundario" onClick={p.onCancelar}>
            Cancelar
          </Boton>
          {f.libres > 0 && (
            <Boton variante="secundario" onClick={p.onSoloLibres}>
              Agregar solo {f.libres === 1 ? 'la libre' : `las ${f.libres}`}
            </Boton>
          )}
          <Boton onClick={() => p.onAgregarYConfeccionar(fechaLimite)} disabled={!fechaValida}>
            {f.libres > 0
              ? `Agregar ${f.libres} y confeccionar ${f.faltan}`
              : `Registrar ${f.faltan} por confeccionar`}
          </Boton>
        </div>
      }
    >
      <p className="mb-4 text-lg">
        Pidió <strong>{f.pedidas}</strong> de <strong>{f.modeloNombre} talla {f.talla}</strong> y en esas fechas{' '}
        {f.libres === 0 ? 'no hay ninguna libre' : `solo hay ${f.libres} ${f.libres === 1 ? 'libre' : 'libres'}`}. Las{' '}
        {f.faltan} que faltan se pueden registrar como <strong>pendientes de confección</strong>: el pedido se guarda igual y,
        cuando estén listas, se agregan en Disfraces y se asignan a este pedido.
      </p>
      <label className="flex items-center gap-3 text-lg">
        <span className="font-semibold">Fecha límite de confección</span>
        <input
          type="date"
          value={fechaLimite}
          min={p.hoy}
          max={p.fechaSalida}
          onChange={(e) => setFechaLimite(e.target.value)}
          className="rounded-lg border-2 border-slate-400 px-2 py-1"
        />
      </label>
      <p className="mt-1 text-base text-slate-700">
        Sugerida: 2 días antes de la salida ({formatearFecha(p.fechaSalida)}). Nunca después de la salida.
      </p>
      {!fechaValida && <p className="font-semibold text-red-700">Elija una fecha entre hoy y la salida.</p>}
    </Dialogo>
  )
}
