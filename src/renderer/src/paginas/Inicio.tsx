import { formatearFecha, hoyEnLima } from '../../../shared/formato'

export default function Inicio(): React.JSX.Element {
  return (
    <section>
      <h1 className="mb-1 text-3xl font-bold">Inicio</h1>
      <p className="mb-6 text-lg text-slate-700">Hoy es {formatearFecha(hoyEnLima())}</p>
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-lg text-slate-700">
        Aquí se verán las entregas y devoluciones de hoy, las devoluciones vencidas y los disfraces en
        lavandería o reparación.
      </p>
    </section>
  )
}
