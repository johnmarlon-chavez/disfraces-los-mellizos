import { useEffect, useState } from 'react'
import { SIGLA_DOCUMENTO, filtrarClientes, formatearTelefono, type ResumenCliente } from '../../../../shared/clientes'
import { llamar, mensajeDe } from '../../api'
import EtiquetaTipoCliente from '../clientes/EtiquetaTipoCliente'
import FormularioCliente from '../clientes/FormularioCliente'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'

interface Props {
  clienteId: number | null
  onElegir: (cliente: ResumenCliente | null) => void
}

function detalle(c: ResumenCliente): string {
  return c.tipo === 'persona'
    ? `${SIGLA_DOCUMENTO[c.tipoDocumento!]} ${c.numeroDocumento}`
    : `${c.distrito} · Responsable: ${c.responsable}`
}

/** Buscar un cliente o registrarlo sin salir del pedido. Muestra el aviso de antecedentes. */
export default function SelectorCliente({ clienteId, onElegir }: Props): React.JSX.Element {
  const [clientes, setClientes] = useState<ResumenCliente[]>([])
  const [texto, setTexto] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = async (): Promise<ResumenCliente[]> => {
    const lista = await llamar(window.api.clientes.listar())
    setClientes(lista)
    return lista
  }

  useEffect(() => {
    llamar(window.api.clientes.listar())
      .then(setClientes)
      .catch((e) => setError(mensajeDe(e)))
  }, [])

  const elegirPorId = async (id: number): Promise<void> => {
    setCreando(false)
    const lista = await cargar()
    const c = lista.find((x) => x.id === id) ?? null
    if (c && !c.activo) {
      setError(`${c.nombres} está desactivado. Reactívelo en Clientes para registrarle un pedido.`)
      return
    }
    setError(null)
    onElegir(c)
  }

  const elegido = clientes.find((c) => c.id === clienteId)

  if (elegido) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-lg border-2 border-blue-700 bg-blue-50 p-3">
          <EtiquetaTipoCliente tipo={elegido.tipo} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{elegido.nombres}</p>
            <p className="truncate text-slate-700">
              {detalle(elegido)} · {formatearTelefono(elegido.telefono)}
            </p>
          </div>
          <Boton variante="secundario" compacto onClick={() => onElegir(null)}>
            Cambiar
          </Boton>
        </div>
        {elegido.conAntecedentes && (
          <p role="alert" className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-lg font-semibold text-amber-900">
            ⚠ Este cliente tiene antecedentes: devoluciones tardías, cargos por daños o deudas. Revise su ficha antes de continuar.
          </p>
        )}
      </div>
    )
  }

  const resultados = texto.trim() ? filtrarClientes(clientes, { texto, tipo: '', incluirInactivos: false }).slice(0, 6) : []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-semibold">Cliente</span>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, DNI, colegio o responsable"
            className="w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-lg"
          />
        </label>
        <Boton variante="secundario" onClick={() => setCreando(true)}>
          + Nuevo cliente
        </Boton>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {error}
        </p>
      )}
      {texto.trim() && resultados.length === 0 && (
        <p className="text-slate-700">No se encontró ningún cliente. Use "+ Nuevo cliente" para registrarlo.</p>
      )}
      {resultados.length > 0 && (
        <ul aria-label="Clientes encontrados" className="flex flex-col gap-1">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  onElegir(c)
                }}
                className="flex w-full items-center gap-3 rounded-lg border-2 border-slate-200 bg-white p-2 text-left hover:border-blue-700"
              >
                <EtiquetaTipoCliente tipo={c.tipo} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">{c.nombres}</span>
                  <span className="block truncate text-base text-slate-700">{detalle(c)}</span>
                </span>
                {c.conAntecedentes && <span className="font-semibold text-amber-800">Con antecedentes</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {creando && (
        <Dialogo titulo="Nuevo cliente" onCerrar={() => setCreando(false)} ancho="amplio">
          <FormularioCliente
            elegirTipo
            textoGuardar="Guardar y usar en el pedido"
            onGuardado={(id) => void elegirPorId(id)}
            onUsarExistente={(id) => void elegirPorId(id)}
            onCancelar={() => setCreando(false)}
          />
        </Dialogo>
      )}
    </div>
  )
}
