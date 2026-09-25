import { useState } from 'react'
import type { Unidad } from '../../../../shared/disfraces'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CampoTexto } from '../ui/Campos'
import Dialogo from '../ui/Dialogo'
import EditorPiezas, { filasAPiezas, piezasAFilas, type FilaPieza } from './EditorPiezas'
import EtiquetaEstado from './EtiquetaEstado'
import SelectorTalla from './SelectorTalla'

interface Props {
  unidad: Unidad
  onCerrar: () => void
  onGuardado: () => void
  onDarDeBaja: () => void
  onReactivar: () => void
}

export default function DialogoUnidad({ unidad, onCerrar, onGuardado, onDarDeBaja, onReactivar }: Props): React.JSX.Element {
  const [talla, setTalla] = useState(unidad.talla)
  const [observaciones, setObservaciones] = useState(unidad.observaciones)
  const [piezas, setPiezas] = useState<FilaPieza[]>(() => piezasAFilas(unidad.piezas))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (): Promise<void> => {
    setError(null)
    const convertidas = filasAPiezas(piezas)
    if ('error' in convertidas) return setError(convertidas.error)
    setGuardando(true)
    try {
      await llamar(window.api.unidades.actualizar(unidad.id, { talla, observaciones, piezas: convertidas.piezas }))
      onGuardado()
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      titulo={`Unidad ${unidad.codigo}`}
      onCerrar={onCerrar}
      ancho="amplio"
      pie={
        <div className="flex items-center justify-between gap-3">
          {unidad.estadoFisico === 'baja' ? (
            <Boton variante="exito" onClick={onReactivar}>
              Reactivar unidad
            </Boton>
          ) : (
            <Boton variante="peligro" onClick={onDarDeBaja} disabled={unidad.alquilada}>
              Dar de baja
            </Boton>
          )}
          <div className="flex gap-3">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 text-lg">
          Estado: <EtiquetaEstado unidad={unidad} />
        </div>
        <div className="grid grid-cols-[16rem_1fr] gap-4">
          <SelectorTalla valor={talla} onCambio={setTalla} />
          <CampoTexto
            etiqueta="Observaciones"
            valor={observaciones}
            onCambio={setObservaciones}
            entrada={{ placeholder: 'Ej. le falta un botón' }}
          />
        </div>
        <EditorPiezas filas={piezas} onCambio={setPiezas} />

        {error && (
          <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg font-semibold text-red-800">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  )
}
