import { NOMBRE_REGION, REGIONES, type Region } from '../../../../shared/disfraces'
import { Selector } from '../ui/Campos'

interface Props {
  valor: Region | null
  onCambio: (region: Region | null) => void
}

export default function SelectorRegion({ valor, onCambio }: Props): React.JSX.Element {
  return (
    <Selector
      etiqueta="Región"
      valor={valor ?? ''}
      onCambio={(v) => onCambio(v === '' ? null : (v as Region))}
      opciones={[{ valor: '', texto: 'No aplica' }, ...REGIONES.map((r) => ({ valor: r, texto: NOMBRE_REGION[r] }))]}
    />
  )
}
