import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { normalizarTexto } from '../../../shared/disfraces'
import { formatearFecha, formatearSoles } from '../../../shared/formato'
import type { ResumenPedido } from '../../../shared/pedidos'
import { llamar, mensajeDe } from '../api'
import EtiquetaTipoCliente from '../componentes/clientes/EtiquetaTipoCliente'
import EtiquetaEstadoPedido from '../componentes/pedidos/EtiquetaEstadoPedido'
import { clasesBoton } from '../componentes/ui/Boton'
import { CampoTexto, Selector } from '../componentes/ui/Campos'
import { memoriaPedidos, type FiltroPedidos } from '../memoriaFiltros'

function filtrar(pedidos: ResumenPedido[], f: FiltroPedidos): ResumenPedido[] {
  const palabras = normalizarTexto(f.texto).split(/\s+/).filter(Boolean)
  return pedidos.filter((p) => {
    if (f.estado === 'activos' && p.estado !== 'reservado' && p.estado !== 'entregado') return false
    if ((f.estado === 'reservado' || f.estado === 'entregado') && p.estado !== f.estado) return false
    if (palabras.length === 0) return true
    const texto = normalizarTexto([p.clienteNombre, p.evento, p.gradoSeccion, String(p.id), ...p.codigos].join(' '))
    return palabras.every((x) => texto.includes(x))
  })
}

export default function Alquileres(): React.JSX.Element {
  return <ListaPedidos key={useLocation().key} />
}

function ListaPedidos(): React.JSX.Element {
  const [pedidos, setPedidos] = useState<ResumenPedido[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const estadoNavegacion = useLocation().state
  const [filtro, setFiltro] = useState<FiltroPedidos>(() => memoriaPedidos.inicial(estadoNavegacion))
  const cambiar = <K extends keyof FiltroPedidos>(clave: K, valor: FiltroPedidos[K]): void => {
    const nuevo = { ...filtro, [clave]: valor }
    setFiltro(nuevo)
    memoriaPedidos.recordar(nuevo)
  }

  useEffect(() => {
    llamar(window.api.pedidos.listar())
      .then(setPedidos)
      .catch((e) => setError(mensajeDe(e)))
  }, [])

  const resultados = pedidos ? filtrar(pedidos, filtro) : []

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Alquileres</h1>
        <Link to="/alquileres/nuevo" className={clasesBoton('primario')}>
          + Nuevo pedido
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_14rem] items-end gap-4 rounded-lg bg-white p-4 shadow">
        <CampoTexto
          etiqueta="Buscar"
          valor={filtro.texto}
          onCambio={(v) => cambiar('texto', v)}
          entrada={{ autoFocus: true, placeholder: 'Cliente, evento, N.° de pedido o código', type: 'search' }}
        />
        <Selector
          etiqueta="Mostrar"
          valor={filtro.estado}
          onCambio={(v) => cambiar('estado', v as FiltroPedidos['estado'])}
          opciones={[
            { valor: 'activos', texto: 'Reservados y entregados' },
            { valor: 'reservado', texto: 'Solo reservados' },
            { valor: 'entregado', texto: 'Solo entregados' },
            { valor: 'todos', texto: 'Todos' }
          ]}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {error}
        </p>
      )}
      {!pedidos && !error && <p className="text-lg">Cargando…</p>}
      {pedidos && resultados.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-lg shadow">
          {pedidos.length === 0 ? 'Todavía no hay pedidos. Use "+ Nuevo pedido" para registrar el primero.' : 'No se encontraron pedidos.'}
        </p>
      )}

      {resultados.length > 0 && (
        <ul aria-label="Lista de pedidos" className="flex flex-col gap-2">
          {resultados.map((p) => (
            <li key={p.id}>
              <Link
                to={`/alquileres/${p.id}`}
                className="flex items-center gap-4 rounded-lg border-2 border-transparent bg-white p-4 shadow-sm hover:border-blue-700"
              >
                <EtiquetaTipoCliente tipo={p.clienteTipo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold">
                    {p.clienteNombre} <span className="font-normal text-slate-600">· N.° {p.id}</span>
                  </p>
                  <p className="truncate text-slate-700">
                    {p.evento}
                    {p.gradoSeccion && ` · ${p.gradoSeccion}`} · {formatearFecha(p.fechaSalida)} al {formatearFecha(p.fechaDevolucionPactada)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lg font-semibold">
                    {p.unidades} {p.unidades === 1 ? 'disfraz' : 'disfraces'} · {formatearSoles(p.total)}
                  </span>
                  {p.estado === 'entregado' && p.fuera > 0 && (
                    <span className="text-base font-semibold text-purple-900">
                      Faltan {p.fuera} de {p.unidades} por devolver
                    </span>
                  )}
                  {p.debe > 0 && (
                    <span className="rounded-full border-2 border-red-700 bg-red-50 px-3 text-base font-semibold text-red-800">
                      Debe {formatearSoles(p.debe)}
                    </span>
                  )}
                  {p.porConfeccionar > 0 && (
                    <span className="rounded-full border-2 border-amber-600 bg-amber-50 px-3 text-base font-semibold text-amber-900">
                      {p.porConfeccionar} por confeccionar
                    </span>
                  )}
                </div>
                <EtiquetaEstadoPedido estado={p.estado} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
