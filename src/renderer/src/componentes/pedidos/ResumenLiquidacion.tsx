import { formatearSoles } from '../../../../shared/formato'
import type { PlanLiquidacion } from '../../../../shared/liquidacion'

/** Cuadro claro del cierre: deuda, lo que cubre la garantía y el resultado final en grande. */
export default function ResumenLiquidacion({ plan, documento }: { plan: PlanLiquidacion; documento: string | null }): React.JSX.Element {
  const filas: [string, number][] = [
    ['Saldo del alquiler', plan.deuda.saldo],
    ['Daños y piezas faltantes', plan.deuda.danos],
    ['Mora', plan.deuda.mora]
  ]
  return (
    <div className="flex flex-col gap-3 text-lg">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {filas.map(([t, v]) => (
          <div key={t} className="contents">
            <dt>{t}</dt>
            <dd className="text-right">{formatearSoles(v)}</dd>
          </div>
        ))}
        <dt className="border-t border-slate-300 pt-1 font-bold">Total que debe</dt>
        <dd className="border-t border-slate-300 pt-1 text-right font-bold">{formatearSoles(plan.deuda.total)}</dd>
        {plan.garantiaDisponible > 0 && (
          <>
            <dt>Garantía en dinero</dt>
            <dd className="text-right">{formatearSoles(plan.garantiaDisponible)}</dd>
            <dt>Se descuenta de la garantía</dt>
            <dd className="text-right">− {formatearSoles(plan.retener.total)}</dd>
          </>
        )}
      </dl>

      {plan.devolverGarantia > 0 && (
        <p className="rounded-lg border-2 border-green-700 bg-green-50 p-3 text-2xl font-bold text-green-900">
          Se le devuelve {formatearSoles(plan.devolverGarantia)} de la garantía
        </p>
      )}
      {plan.aFavor > 0 && (
        <p className="rounded-lg border-2 border-green-700 bg-green-50 p-3 text-xl font-bold text-green-900">
          Pagó {formatearSoles(plan.aFavor)} de más por el alquiler: se le devuelve
        </p>
      )}
      {plan.faltaCobrar.total > 0 && (
        <p className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-2xl font-bold text-red-800">
          Falta cobrar {formatearSoles(plan.faltaCobrar.total)}
        </p>
      )}
      {plan.faltaCobrar.total === 0 && plan.devolverGarantia === 0 && plan.aFavor === 0 && plan.dni === null && (
        <p className="rounded-lg border-2 border-slate-400 bg-slate-50 p-3 text-xl font-bold">No se devuelve ni se cobra nada.</p>
      )}
      {plan.dni === 'devolver' && (
        <p className="rounded-lg border-2 border-green-700 bg-green-50 p-3 text-xl font-bold text-green-900">
          Devolver el documento en prenda{documento ? ` (${documento})` : ''}
        </p>
      )}
      {plan.dni === 'retener' && (
        <p className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-xl font-bold text-amber-900">
          Retener el documento{documento ? ` (${documento})` : ''} hasta que pague
        </p>
      )}
    </div>
  )
}
