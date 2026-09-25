import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { filtrarModelos, ordenarTallas, urlFoto, type FiltroModelos, type ResumenModelo } from '../../../shared/disfraces'
import { formatearSoles } from '../../../shared/formato'
import { llamar, mensajeDe } from '../api'
import { filtroInicial, recordarFiltro } from './busquedaDisfraces'
import { clasesBoton } from '../componentes/ui/Boton'
import { CampoTexto, Selector } from '../componentes/ui/Campos'

/** Cada navegación a la lista (por ejemplo, clic en el menú) la monta de nuevo, con sus filtros iniciales. */
export default function Disfraces(): React.JSX.Element {
  return <ListaDisfraces key={useLocation().key} />
}

function ListaDisfraces(): React.JSX.Element {
  const [modelos, setModelos] = useState<ResumenModelo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const estadoNavegacion = useLocation().state
  const [filtro, setFiltro] = useState<FiltroModelos>(() => filtroInicial(estadoNavegacion))
  const cambiar = <K extends keyof FiltroModelos>(clave: K, valor: FiltroModelos[K]): void => {
    const nuevo = { ...filtro, [clave]: valor }
    setFiltro(nuevo)
    recordarFiltro(nuevo)
  }

  useEffect(() => {
    llamar(window.api.modelos.listar())
      .then(setModelos)
      .catch((e) => setError(mensajeDe(e)))
  }, [])

  const { tallas, categorias } = useMemo(() => {
    const todos = modelos ?? []
    return {
      tallas: ordenarTallas(todos.flatMap((m) => m.unidades.filter((u) => u.estadoFisico !== 'baja').map((u) => u.talla))),
      categorias: [...new Set(todos.map((m) => m.categoria))].sort((a, b) => a.localeCompare(b, 'es'))
    }
  }, [modelos])

  const resultados = modelos ? filtrarModelos(modelos, filtro) : []

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Disfraces</h1>
        <Link to="/disfraces/nuevo" className={clasesBoton('primario')}>
          + Nuevo disfraz
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-[1fr_11rem_14rem] items-end gap-4 rounded-lg bg-white p-4 shadow">
        <CampoTexto
          etiqueta="Buscar"
          valor={filtro.texto}
          onCambio={(v) => cambiar('texto', v)}
          entrada={{ autoFocus: true, placeholder: 'Nombre, categoría o código (ej. ARA-002)', type: 'search' }}
        />
        <Selector
          etiqueta="Talla"
          valor={filtro.talla}
          onCambio={(v) => cambiar('talla', v)}
          opciones={[{ valor: '', texto: 'Todas' }, ...tallas.map((t) => ({ valor: t, texto: t }))]}
        />
        <Selector
          etiqueta="Categoría"
          valor={filtro.categoria}
          onCambio={(v) => cambiar('categoria', v)}
          opciones={[{ valor: '', texto: 'Todas' }, ...categorias.map((c) => ({ valor: c, texto: c }))]}
        />
        <label className="col-span-3 flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            checked={filtro.incluirBaja}
            onChange={(e) => cambiar('incluirBaja', e.target.checked)}
            className="size-5"
          />
          Mostrar disfraces dados de baja
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {error}
        </p>
      )}
      {!modelos && !error && <p className="text-lg">Cargando…</p>}

      {modelos && resultados.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-lg shadow">
          {modelos.length === 0
            ? 'Todavía no hay disfraces. Use el botón "+ Nuevo disfraz" para agregar el primero.'
            : filtro.talla
              ? `No hay disfraces en talla ${filtro.talla} con esa búsqueda.`
              : 'No se encontraron disfraces con esa búsqueda.'}
        </p>
      )}

      {resultados.length > 0 && (
        <ul aria-label="Lista de disfraces" className="flex flex-col gap-2">
          {resultados.map(({ modelo, total, disponibles }) => (
            <li key={modelo.id}>
              <Link
                to={`/disfraces/${modelo.id}`}
                className={`flex items-center gap-4 rounded-lg border-2 bg-white p-3 shadow-sm hover:border-blue-700 ${
                  modelo.activo ? 'border-transparent' : 'border-dashed border-slate-400 opacity-70'
                }`}
              >
                <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {modelo.foto && <img src={urlFoto(modelo.foto)} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold">
                    {modelo.nombre}
                    {!modelo.activo && <span className="ml-2 text-base font-semibold text-slate-600">(dado de baja)</span>}
                  </p>
                  <p className="text-slate-700">{modelo.categoria}</p>
                </div>
                <p className="w-32 text-right text-xl font-semibold">{formatearSoles(modelo.precioAlquiler)}</p>
                <p className={`w-56 text-right text-lg font-semibold ${disponibles === 0 ? 'text-red-700' : 'text-green-800'}`}>
                  {filtro.talla ? `Talla ${filtro.talla}: ` : ''}
                  {total === 0 ? 'Sin unidades' : `${disponibles} de ${total} ${disponibles === 1 ? 'disponible' : 'disponibles'}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
