import { Link, useNavigate } from 'react-router'
import FormularioCliente from '../componentes/clientes/FormularioCliente'
import { useAvisos } from '../componentes/ui/Avisos'

export default function NuevoCliente(): React.JSX.Element {
  const navegar = useNavigate()
  const avisos = useAvisos()

  return (
    <section className="max-w-4xl">
      <Link to="/clientes" className="text-lg font-semibold text-blue-800 hover:underline">
        ← Volver a Clientes
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold">Nuevo cliente</h1>
      <div className="rounded-lg bg-white p-6 shadow">
        <FormularioCliente
          elegirTipo
          textoGuardar="Guardar cliente"
          onGuardado={(id) => {
            avisos.exito('Cliente registrado.')
            navegar(`/clientes/${id}`, { replace: true })
          }}
          onUsarExistente={(id) => navegar(`/clientes/${id}`)}
          onCancelar={() => navegar('/clientes')}
        />
      </div>
    </section>
  )
}
