import type { ButtonHTMLAttributes } from 'react'

export type Variante = 'primario' | 'secundario' | 'peligro' | 'exito'

const ESTILOS: Record<Variante, string> = {
  primario: 'bg-blue-700 text-white hover:bg-blue-800',
  secundario: 'border-2 border-slate-400 bg-white text-slate-900 hover:bg-slate-100',
  peligro: 'bg-red-700 text-white hover:bg-red-800',
  exito: 'bg-green-700 text-white hover:bg-green-800'
}

export function clasesBoton(variante: Variante = 'primario', compacto = false): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap
    disabled:cursor-not-allowed disabled:opacity-50 ${compacto ? 'px-3 py-2 text-base' : 'px-5 py-3 text-lg'}
    ${ESTILOS[variante]}`
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  compacto?: boolean
}

export default function Boton({ variante, compacto, className = '', type = 'button', ...resto }: Props): React.JSX.Element {
  return <button type={type} className={`${clasesBoton(variante, compacto)} ${className}`} {...resto} />
}
