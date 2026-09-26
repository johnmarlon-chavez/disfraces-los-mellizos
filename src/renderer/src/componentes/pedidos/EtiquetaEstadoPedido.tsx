import { NOMBRE_ESTADO_PEDIDO, type EstadoPedido } from '../../../../shared/pedidos'

const COLORES: Record<EstadoPedido, string> = {
  reservado: 'border-blue-700 bg-blue-50 text-blue-900',
  entregado: 'border-purple-700 bg-purple-50 text-purple-900',
  devuelto: 'border-green-700 bg-green-50 text-green-900',
  cancelado: 'border-slate-500 bg-slate-100 text-slate-700'
}

export default function EtiquetaEstadoPedido({ estado }: { estado: EstadoPedido }): React.JSX.Element {
  return (
    <span className={`inline-block rounded-full border-2 px-3 py-0.5 text-base font-semibold whitespace-nowrap ${COLORES[estado]}`}>
      {NOMBRE_ESTADO_PEDIDO[estado]}
    </span>
  )
}
