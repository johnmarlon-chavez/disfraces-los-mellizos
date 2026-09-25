import type { TipoCliente } from '../../../../shared/clientes'

export default function EtiquetaTipoCliente({ tipo }: { tipo: TipoCliente }): React.JSX.Element {
  return (
    <span
      className={`inline-block w-24 shrink-0 rounded-full border-2 px-3 py-0.5 text-center text-base font-semibold ${
        tipo === 'colegio' ? 'border-indigo-700 bg-indigo-50 text-indigo-900' : 'border-slate-500 bg-slate-50 text-slate-800'
      }`}
    >
      {tipo === 'colegio' ? 'Colegio' : 'Persona'}
    </span>
  )
}
