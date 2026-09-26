import { useState } from 'react'
import type { Periodo } from '../../../shared/reportes'
import { ReporteDescuentos, ReporteDeudas, ReporteIngresos, ReporteMedios } from '../componentes/reportes/ReportesDinero'
import {
  ReporteAgrupados,
  ReporteCalendario,
  ReporteConfeccion,
  ReporteFuera,
  ReporteMasAlquilados
} from '../componentes/reportes/ReportesOperacion'
import SelectorPeriodo, { periodoDe } from '../componentes/reportes/SelectorPeriodo'

type Pestana = 'ingresos' | 'caja' | 'fuera' | 'mas' | 'colegios' | 'confeccion' | 'calendario' | 'descuentos' | 'deudas'

const PESTANAS: { id: Pestana; texto: string; conPeriodo: boolean }[] = [
  { id: 'ingresos', texto: 'Ingresos', conPeriodo: true },
  { id: 'caja', texto: 'Caja y garantías', conPeriodo: true },
  { id: 'fuera', texto: 'Fuera y vencidos', conPeriodo: false },
  { id: 'mas', texto: 'Más alquilados', conPeriodo: true },
  { id: 'colegios', texto: 'Colegios y eventos', conPeriodo: true },
  { id: 'confeccion', texto: 'Confección', conPeriodo: false },
  { id: 'calendario', texto: 'Ocupación', conPeriodo: false },
  { id: 'descuentos', texto: 'Descuentos', conPeriodo: true },
  { id: 'deudas', texto: 'Deudas', conPeriodo: false }
]

export default function Reportes(): React.JSX.Element {
  const [pestana, setPestana] = useState<Pestana>('ingresos')
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('mes'))
  const actual = PESTANAS.find((p) => p.id === pestana)!

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Reportes</h1>
      <div role="tablist" aria-label="Reportes" className="flex flex-wrap gap-2">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={`rounded-lg border-2 px-3 py-1.5 text-lg font-semibold ${
              pestana === p.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:border-slate-500'
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {actual.conPeriodo && <SelectorPeriodo periodo={periodo} onCambio={setPeriodo} />}
      <div role="tabpanel" aria-label={actual.texto}>
        {pestana === 'ingresos' && <ReporteIngresos periodo={periodo} />}
        {pestana === 'caja' && <ReporteMedios periodo={periodo} />}
        {pestana === 'fuera' && <ReporteFuera />}
        {pestana === 'mas' && <ReporteMasAlquilados periodo={periodo} />}
        {pestana === 'colegios' && <ReporteAgrupados periodo={periodo} />}
        {pestana === 'confeccion' && <ReporteConfeccion />}
        {pestana === 'calendario' && <ReporteCalendario />}
        {pestana === 'descuentos' && <ReporteDescuentos periodo={periodo} />}
        {pestana === 'deudas' && <ReporteDeudas />}
      </div>
    </section>
  )
}
