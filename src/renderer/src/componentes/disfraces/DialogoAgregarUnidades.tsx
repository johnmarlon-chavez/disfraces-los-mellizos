import { useEffect, useState } from 'react'
import type { FichaModelo } from '../../../../shared/disfraces'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CampoTexto } from '../ui/Campos'
import Dialogo from '../ui/Dialogo'
import EditorPiezas, { filasAPiezas, piezasAFilas, type FilaPieza } from './EditorPiezas'
import SelectorTalla from './SelectorTalla'

interface Props {
  modelo: FichaModelo
  onCerrar: () => void
  onGuardado: (codigos: string[]) => void
}

export default function DialogoAgregarUnidades({ modelo, onCerrar, onGuardado }: Props): React.JSX.Element {
  const [talla, setTalla] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [codigos, setCodigos] = useState<string[]>([])
  const [piezas, setPiezas] = useState<FilaPieza[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const n = Number(cantidad)
  const cantidadValida = Number.isInteger(n) && n >= 1 && n <= 50

  // Piezas copiadas de otra unidad del mismo modelo.
  useEffect(() => {
    llamar(window.api.unidades.piezasSugeridas(modelo.id))
      .then((p) => setPiezas(piezasAFilas(p)))
      .catch((e) => setError(mensajeDe(e)))
  }, [modelo.id])

  useEffect(() => {
    if (!cantidadValida) return
    let vigente = true
    llamar(window.api.unidades.sugerirCodigos(modelo.id, n))
      .then((c) => vigente && setCodigos(c))
      .catch((e) => vigente && setError(mensajeDe(e)))
    return () => {
      vigente = false
    }
  }, [modelo.id, n, cantidadValida])

  const guardar = async (): Promise<void> => {
    setError(null)
    if (!talla.trim()) return setError('Elija la talla.')
    if (!cantidadValida) return setError('La cantidad debe ser un número del 1 al 50.')
    if (codigos.length < n) return setError('Espere un momento, se están preparando los códigos.')
    const convertidas = filasAPiezas(piezas)
    if ('error' in convertidas) return setError(convertidas.error)
    setGuardando(true)
    try {
      const lista = codigos.slice(0, n)
      await llamar(
        window.api.unidades.crear({
          modeloId: modelo.id,
          talla,
          codigos: lista,
          piezas: convertidas.piezas.map(({ nombre, costoReposicion }) => ({ nombre, costoReposicion }))
        })
      )
      onGuardado(lista)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      titulo={`Agregar unidades de ${modelo.nombre}`}
      onCerrar={onCerrar}
      ancho="amplio"
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : `Agregar ${cantidadValida ? n : ''} ${n === 1 ? 'unidad' : 'unidades'}`}
          </Boton>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <SelectorTalla valor={talla} onCambio={setTalla} autoFocus />
          <CampoTexto
            etiqueta="¿Cuántas unidades?"
            valor={cantidad}
            onCambio={setCantidad}
            error={cantidad !== '' && !cantidadValida ? 'Escriba un número del 1 al 50.' : null}
            entrada={{ inputMode: 'numeric' }}
          />
        </div>

        {cantidadValida && codigos.length > 0 && (
          <fieldset>
            <legend className="mb-2 font-semibold">Códigos (puede cambiarlos)</legend>
            <div className="grid grid-cols-4 gap-2">
              {codigos.slice(0, n).map((c, i) => (
                <input
                  key={i}
                  value={c}
                  aria-label={`Código de la unidad ${i + 1}`}
                  onChange={(e) => setCodigos(codigos.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}
                  className="rounded-lg border-2 border-slate-400 px-3 py-2 text-lg font-mono"
                />
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <EditorPiezas filas={piezas} onCambio={setPiezas} />
          {modelo.unidades.length > 0 && (
            <p className="mt-2 text-base text-slate-600">Piezas copiadas de otra unidad de este disfraz.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg font-semibold text-red-800">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  )
}
