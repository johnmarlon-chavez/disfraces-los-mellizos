import { diasEntre, sumarDias } from '../../../../shared/fechas'
import { hoyEnLima } from '../../../../shared/formato'
import type { Periodo } from '../../../../shared/reportes'

type Atajo = 'hoy' | 'semana' | 'mes' | 'mesAnterior'

export function periodoDe(atajo: Atajo, hoy: string = hoyEnLima()): Periodo {
  const inicioMes = `${hoy.slice(0, 7)}-01`
  switch (atajo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'semana': {
      // Semana de lunes a domingo
      const diaSemana = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7
      return { desde: sumarDias(hoy, -diaSemana), hasta: hoy }
    }
    case 'mes':
      return { desde: inicioMes, hasta: hoy }
    case 'mesAnterior': {
      const fin = sumarDias(inicioMes, -1)
      return { desde: `${fin.slice(0, 7)}-01`, hasta: fin }
    }
  }
}

const ATAJOS: [Atajo, string][] = [
  ['hoy', 'Hoy'],
  ['semana', 'Esta semana'],
  ['mes', 'Este mes'],
  ['mesAnterior', 'Mes anterior']
]

export default function SelectorPeriodo({ periodo, onCambio }: { periodo: Periodo; onCambio: (p: Periodo) => void }): React.JSX.Element {
  const actual = ATAJOS.find(([a]) => {
    const p = periodoDe(a)
    return p.desde === periodo.desde && p.hasta === periodo.hasta
  })?.[0]
  return (
    <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-2">
      {ATAJOS.map(([a, texto]) => (
        <button
          key={a}
          type="button"
          aria-pressed={actual === a}
          onClick={() => onCambio(periodoDe(a))}
          className={`rounded-lg border-2 px-3 py-1 text-lg ${actual === a ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-400 bg-white'}`}
        >
          {texto}
        </button>
      ))}
      <label className="flex items-center gap-1 text-lg">
        Del
        <input
          type="date"
          aria-label="Desde"
          value={periodo.desde}
          onChange={(e) => e.target.value && onCambio({ desde: e.target.value, hasta: periodo.hasta < e.target.value ? e.target.value : periodo.hasta })}
          className="rounded-lg border-2 border-slate-400 px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-1 text-lg">
        al
        <input
          type="date"
          aria-label="Hasta"
          value={periodo.hasta}
          min={periodo.desde}
          onChange={(e) => e.target.value && onCambio({ ...periodo, hasta: e.target.value })}
          className="rounded-lg border-2 border-slate-400 px-2 py-1"
        />
      </label>
      <span className="text-base text-slate-600">({diasEntre(periodo.desde, periodo.hasta) + 1} días)</span>
    </div>
  )
}
