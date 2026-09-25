import { NOMBRE_ESTADO, type UnidadResumen } from '../../../../shared/disfraces'

const COLORES = {
  disponible: 'bg-green-100 text-green-900 border-green-700',
  lavanderia: 'bg-sky-100 text-sky-900 border-sky-700',
  reparacion: 'bg-amber-100 text-amber-900 border-amber-700',
  baja: 'bg-slate-200 text-slate-700 border-slate-500',
  alquilada: 'bg-purple-100 text-purple-900 border-purple-700'
}

export default function EtiquetaEstado({ unidad }: { unidad: Pick<UnidadResumen, 'estadoFisico' | 'alquilada'> }): React.JSX.Element {
  const clave = unidad.alquilada ? 'alquilada' : unidad.estadoFisico
  const texto = unidad.alquilada ? 'Alquilado' : NOMBRE_ESTADO[unidad.estadoFisico]
  return (
    <span className={`inline-block rounded-full border-2 px-3 py-0.5 text-base font-semibold whitespace-nowrap ${COLORES[clave]}`}>
      {texto}
    </span>
  )
}
