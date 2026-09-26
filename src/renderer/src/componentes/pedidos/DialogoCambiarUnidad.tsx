import { useEffect, useState } from 'react'
import type { Rango, UnidadParaPedido } from '../../../../shared/pedidos'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'
import type { LineaCarrito } from './modeloCarrito'

interface Props {
  linea: LineaCarrito
  rango: Rango
  excluirAlquilerId: number | null
  yaEnCarrito: number[]
  onElegir: (unidad: UnidadParaPedido) => void
  onCerrar: () => void
}

/** Cambiar a mano una unidad asignada por otra libre del mismo modelo y talla. */
export default function DialogoCambiarUnidad(p: Props): React.JSX.Element {
  const [libres, setLibres] = useState<UnidadParaPedido[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { linea, rango, excluirAlquilerId } = p
  // El carrito se toma una sola vez, al abrir el diálogo.
  const [yaEnCarrito] = useState(p.yaEnCarrito)

  useEffect(() => {
    llamar(window.api.pedidos.unidadesLibres(linea.modeloId, linea.talla, rango, excluirAlquilerId, yaEnCarrito))
      .then(setLibres)
      .catch((e) => setError(mensajeDe(e)))
  }, [linea.modeloId, linea.talla, rango, excluirAlquilerId, yaEnCarrito])

  return (
    <Dialogo titulo={`Cambiar ${linea.codigo}`} onCerrar={p.onCerrar}>
      <p className="mb-3 text-lg">
        Unidades libres de {linea.modeloNombre} talla {linea.talla} en estas fechas:
      </p>
      {error && <p className="font-semibold text-red-700">{error}</p>}
      {libres && libres.length === 0 && <p className="text-lg text-slate-700">No hay otras unidades libres.</p>}
      {libres && libres.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {libres.map((u) => (
            <li key={u.unidadId}>
              <Boton variante="secundario" className="w-full font-mono" onClick={() => p.onElegir(u)}>
                {u.codigo}
                {u.estadoFisico === 'lavanderia' && <span className="font-sans text-sm"> (lavandería)</span>}
              </Boton>
            </li>
          ))}
        </ul>
      )}
    </Dialogo>
  )
}
