import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  SIGLA_DOCUMENTO,
  filtrarClientes,
  formatearTelefono,
  type FiltroClientes,
  type ResumenCliente
} from '../../../shared/clientes'
import { llamar, mensajeDe } from '../api'
import EtiquetaTipoCliente from '../componentes/clientes/EtiquetaTipoCliente'
import { clasesBoton } from '../componentes/ui/Boton'
import { CampoTexto, Selector } from '../componentes/ui/Campos'
import { memoriaClientes } from '../memoriaFiltros'

/** Cada navegación a la lista (por ejemplo, clic en el menú) la monta de nuevo, con sus filtros iniciales. */
export default function Clientes(): React.JSX.Element {
  return <ListaClientes key={useLocation().key} />
}

function ListaClientes(): React.JSX.Element {
  const [clientes, setClientes] = useState<ResumenCliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const estadoNavegacion = useLocation().state
  const [filtro, setFiltro] = useState<FiltroClientes>(() => memoriaClientes.inicial(estadoNavegacion))
  const cambiar = <K extends keyof FiltroClientes>(clave: K, valor: FiltroClientes[K]): void => {
    const nuevo = { ...filtro, [clave]: valor }
    setFiltro(nuevo)
    memoriaClientes.recordar(nuevo)
  }

  useEffect(() => {
    llamar(window.api.clientes.listar())
      .then(setClientes)
      .catch((e) => setError(mensajeDe(e)))
  }, [])

  const resultados = clientes ? filtrarClientes(clientes, filtro) : []

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Clientes</h1>
        <Link to="/clientes/nuevo" className={clasesBoton('primario')}>
          + Nuevo cliente
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-[1fr_13rem] items-end gap-4 rounded-lg bg-white p-4 shadow">
        <CampoTexto
          etiqueta="Buscar"
          valor={filtro.texto}
          onCambio={(v) => cambiar('texto', v)}
          entrada={{ autoFocus: true, placeholder: 'Nombre, DNI, responsable, distrito o teléfono', type: 'search' }}
        />
        <Selector
          etiqueta="Tipo"
          valor={filtro.tipo}
          onCambio={(v) => cambiar('tipo', v as FiltroClientes['tipo'])}
          opciones={[
            { valor: '', texto: 'Todos' },
            { valor: 'persona', texto: 'Personas' },
            { valor: 'colegio', texto: 'Colegios' }
          ]}
        />
        <label className="col-span-2 flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            checked={filtro.incluirInactivos}
            onChange={(e) => cambiar('incluirInactivos', e.target.checked)}
            className="size-5"
          />
          Mostrar clientes desactivados
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {error}
        </p>
      )}
      {!clientes && !error && <p className="text-lg">Cargando…</p>}

      {clientes && resultados.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-lg shadow">
          {clientes.length === 0
            ? 'Todavía no hay clientes. Use el botón "+ Nuevo cliente" para registrar el primero.'
            : 'No se encontraron clientes con esa búsqueda.'}
        </p>
      )}

      {resultados.length > 0 && (
        <ul aria-label="Lista de clientes" className="flex flex-col gap-2">
          {resultados.map((c) => (
            <li key={c.id}>
              <Link
                to={`/clientes/${c.id}`}
                className={`flex items-center gap-4 rounded-lg border-2 bg-white p-4 shadow-sm hover:border-blue-700 ${
                  c.activo ? 'border-transparent' : 'border-dashed border-slate-400 opacity-70'
                }`}
              >
                <EtiquetaTipoCliente tipo={c.tipo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold">
                    {c.nombres}
                    {!c.activo && <span className="ml-2 text-base font-semibold text-slate-600">(desactivado)</span>}
                  </p>
                  <p className="truncate text-slate-700">
                    {c.tipo === 'persona'
                      ? `${SIGLA_DOCUMENTO[c.tipoDocumento!]} ${c.numeroDocumento}`
                      : `${c.distrito} · Responsable: ${c.responsable}`}
                  </p>
                </div>
                {c.conAntecedentes && (
                  <span className="rounded-full border-2 border-amber-600 bg-amber-50 px-3 py-0.5 text-base font-semibold whitespace-nowrap text-amber-900">
                    Con antecedentes
                  </span>
                )}
                <p className="w-36 text-right text-lg font-semibold">{formatearTelefono(c.telefono)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
