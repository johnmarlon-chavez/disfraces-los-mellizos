import { describe, expect, it } from 'vitest'
import {
  asignarPorCantidad,
  describirMotivo,
  finDeOcupacion,
  motivoNoDisponible,
  ocupacionChoca,
  unidadesLibres,
  type Ocupacion,
  type UnidadConOcupaciones
} from '../../src/main/logica/disponibilidad'
import { diasEntre, esFechaValida, sumarDias } from '../../src/shared/fechas'
import type { EstadoFisico } from '../../src/shared/disfraces'

const HOY = '2026-10-15'

function oc(salida: string, pactada: string, estado: Ocupacion['estado'] = 'reservado', alquilerId = 1): Ocupacion {
  return { alquilerId, clienteNombre: 'I.E. Los Girasoles', estado, fechaSalida: salida, fechaDevolucionPactada: pactada }
}

function unidad(
  id: number,
  codigo: string,
  talla: string,
  ocupaciones: Ocupacion[] = [],
  estadoFisico: EstadoFisico = 'disponible'
): UnidadConOcupaciones {
  return { id, codigo, modeloId: 1, talla, estadoFisico, ocupaciones }
}

const libre = (ocupaciones: Ocupacion[], inicio: string, fin: string, margen = 1, hoy = HOY, excluir: number | null = null) =>
  motivoNoDisponible({ estadoFisico: 'disponible', ocupaciones }, { inicio, fin }, margen, hoy, excluir) === null

describe('fechas', () => {
  it('suma días cruzando meses, años y bisiestos', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29') // 2028 es bisiesto
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('cuenta días entre fechas', () => {
    expect(diasEntre('2026-10-28', '2026-10-31')).toBe(3)
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3)
    expect(diasEntre('2026-10-28', '2026-10-28')).toBe(0)
  })

  it('reconoce fechas imposibles', () => {
    expect(esFechaValida('2026-02-29')).toBe(false)
    expect(esFechaValida('2028-02-29')).toBe(true)
    expect(esFechaValida('2026-13-01')).toBe(false)
    expect(esFechaValida('28/10/2026')).toBe(false)
  })
})

describe('regla de disponibilidad: solapamiento de fechas', () => {
  // Alquiler existente: sale el 28/10, vuelve el 31/10. Con 1 día de lavado ocupa hasta el 01/11.
  const existente = [oc('2026-10-28', '2026-10-31')]

  it.each([
    ['idéntico', '2026-10-28', '2026-10-31'],
    ['el nuevo contiene al existente', '2026-10-20', '2026-11-10'],
    ['el existente contiene al nuevo', '2026-10-29', '2026-10-30'],
    ['cruza por la izquierda', '2026-10-25', '2026-10-28'],
    ['cruza por la derecha', '2026-10-31', '2026-11-05'],
    ['empieza el día del lavado', '2026-11-01', '2026-11-03'],
    ['un solo día dentro', '2026-10-30', '2026-10-30'],
    ['termina el día de la salida', '2026-10-20', '2026-10-28']
  ])('choca: %s', (_caso, inicio, fin) => {
    expect(libre(existente, inicio, fin)).toBe(false)
  })

  it.each([
    ['termina el día antes de la salida', '2026-10-20', '2026-10-27'],
    ['empieza el día después del lavado', '2026-11-02', '2026-11-05'],
    ['mucho después', '2026-12-01', '2026-12-05']
  ])('no choca: %s', (_caso, inicio, fin) => {
    expect(libre(existente, inicio, fin)).toBe(true)
  })
})

describe('regla de disponibilidad: margen de lavado', () => {
  const existente = [oc('2026-10-28', '2026-10-31')]

  it('margen 0: el mismo día de la devolución todavía choca (el traje aún no volvió)', () => {
    expect(libre(existente, '2026-10-31', '2026-11-02', 0)).toBe(false)
    expect(libre(existente, '2026-11-01', '2026-11-02', 0)).toBe(true)
  })

  it('margen 1: libre desde el segundo día después de la devolución', () => {
    expect(libre(existente, '2026-11-01', '2026-11-02', 1)).toBe(false)
    expect(libre(existente, '2026-11-02', '2026-11-03', 1)).toBe(true)
  })

  it('margen 2: separación exacta de margen + 1 días', () => {
    expect(libre(existente, '2026-11-02', '2026-11-03', 2)).toBe(false)
    expect(libre(existente, '2026-11-03', '2026-11-04', 2)).toBe(true)
  })

  it('el margen solo se cuenta después de la devolución, no antes de la salida', () => {
    // Un pedido nuevo que vuelve el 27/10 no choca con uno que sale el 28/10, aunque haya margen.
    expect(libre(existente, '2026-10-25', '2026-10-27', 3)).toBe(true)
  })

  it('el margen cruza fin de año', () => {
    const fin = [oc('2026-12-28', '2026-12-31')]
    expect(libre(fin, '2027-01-01', '2027-01-02', 1)).toBe(false)
    expect(libre(fin, '2027-01-02', '2027-01-03', 1)).toBe(true)
  })

  it('el margen cruza un 29 de febrero', () => {
    const feb = [oc('2028-02-25', '2028-02-28')]
    expect(libre(feb, '2028-02-29', '2028-03-01', 1)).toBe(false)
    expect(libre(feb, '2028-03-01', '2028-03-02', 1)).toBe(true)
  })
})

describe('regla de disponibilidad: pedidos de un solo día', () => {
  it('sale y vuelve el mismo día', () => {
    const existente = [oc('2026-10-28', '2026-10-28')]
    expect(libre(existente, '2026-10-28', '2026-10-28', 0)).toBe(false)
    expect(libre(existente, '2026-10-29', '2026-10-29', 0)).toBe(true)
    expect(libre(existente, '2026-10-29', '2026-10-29', 1)).toBe(false)
    expect(libre(existente, '2026-10-27', '2026-10-27', 1)).toBe(true)
  })
})

describe('regla de disponibilidad: estado del alquiler', () => {
  it('reservado y entregado bloquean', () => {
    expect(libre([oc('2026-10-28', '2026-10-31', 'reservado')], '2026-10-29', '2026-10-30')).toBe(false)
    expect(libre([oc('2026-10-14', '2026-10-20', 'entregado')], '2026-10-18', '2026-10-19')).toBe(false)
  })

  it('entregado a tiempo: se cuenta la fecha pactada', () => {
    const o = oc('2026-10-10', '2026-10-20', 'entregado')
    expect(finDeOcupacion(o, 1, HOY)).toBe('2026-10-21')
    expect(libre([o], '2026-10-22', '2026-10-25')).toBe(true)
  })

  it('entregado y vencido (no ha vuelto): ocupado hasta hoy + margen', () => {
    const vencido = oc('2026-10-05', '2026-10-10', 'entregado')
    expect(finDeOcupacion(vencido, 1, HOY)).toBe('2026-10-16')
    // Con la fórmula sin corregir, desde el 12/10 parecería libre: sería un error grave.
    expect(libre([vencido], '2026-10-15', '2026-10-15')).toBe(false)
    expect(libre([vencido], '2026-10-16', '2026-10-18')).toBe(false)
    expect(libre([vencido], '2026-10-17', '2026-10-18')).toBe(true)
  })

  it('entregado que vence justo hoy: se cuenta hoy', () => {
    const hoyVence = oc('2026-10-10', HOY, 'entregado')
    expect(finDeOcupacion(hoyVence, 0, HOY)).toBe(HOY)
    expect(libre([hoyVence], '2026-10-16', '2026-10-17', 0)).toBe(true)
  })

  it('una reserva vencida (nunca la recogieron) sigue bloqueando hasta su fecha pactada', () => {
    const noRecogida = oc('2026-10-01', '2026-10-20', 'reservado')
    expect(finDeOcupacion(noRecogida, 1, HOY)).toBe('2026-10-21')
  })
})

describe('regla de disponibilidad: estado físico', () => {
  const rango = { inicio: '2027-03-01', fin: '2027-03-05' }

  it('reparación y baja bloquean sin importar las fechas', () => {
    expect(motivoNoDisponible({ estadoFisico: 'reparacion', ocupaciones: [] }, rango, 1, HOY)).toEqual({
      tipo: 'estado',
      estado: 'reparacion'
    })
    expect(motivoNoDisponible({ estadoFisico: 'baja', ocupaciones: [] }, rango, 1, HOY)).toEqual({
      tipo: 'estado',
      estado: 'baja'
    })
  })

  it('lavandería no bloquea', () => {
    expect(motivoNoDisponible({ estadoFisico: 'lavanderia', ocupaciones: [] }, rango, 1, HOY)).toBeNull()
  })
})

describe('regla de disponibilidad: editar un pedido', () => {
  it('las unidades del pedido que se edita no chocan consigo mismas', () => {
    const propia = [oc('2026-10-28', '2026-10-31', 'reservado', 7)]
    expect(libre(propia, '2026-10-29', '2026-11-02', 1, HOY, 7)).toBe(true)
    expect(libre(propia, '2026-10-29', '2026-11-02', 1, HOY, 8)).toBe(false)
  })

  it('pero sí chocan con otros pedidos', () => {
    const ocupaciones = [oc('2026-10-28', '2026-10-31', 'reservado', 7), oc('2026-11-05', '2026-11-07', 'reservado', 9)]
    expect(libre(ocupaciones, '2026-10-29', '2026-11-05', 1, HOY, 7)).toBe(false)
  })
})

describe('mensajes para la usuaria', () => {
  it('reservado, con días de lavado', () => {
    const motivo = motivoNoDisponible({ estadoFisico: 'disponible', ocupaciones: [oc('2026-10-28', '2026-10-31')] }, { inicio: '2026-10-30', fin: '2026-11-01' }, 1, HOY)!
    expect(describirMotivo('HUM-003', motivo, 1, HOY)).toBe(
      'HUM-003 está reservado del 28/10 al 31/10 para I.E. Los Girasoles (más 1 día de lavado).'
    )
    expect(describirMotivo('HUM-003', motivo, 0, HOY)).toBe('HUM-003 está reservado del 28/10 al 31/10 para I.E. Los Girasoles.')
  })

  it('alquilado y vencido', () => {
    const motivo = motivoNoDisponible({ estadoFisico: 'disponible', ocupaciones: [oc('2026-10-05', '2026-10-10', 'entregado')] }, { inicio: HOY, fin: HOY }, 1, HOY)!
    expect(describirMotivo('HUM-003', motivo, 1, HOY)).toBe(
      'HUM-003 está alquilado a I.E. Los Girasoles: debía volver el 10/10 y todavía no vuelve.'
    )
  })

  it('prioriza el alquiler entregado sobre las reservas', () => {
    const motivo = motivoNoDisponible(
      {
        estadoFisico: 'disponible',
        ocupaciones: [oc('2026-10-16', '2026-10-17', 'reservado', 2), oc('2026-10-10', '2026-10-20', 'entregado', 3)]
      },
      { inicio: '2026-10-16', fin: '2026-10-17' },
      1,
      HOY
    )
    expect(motivo).toMatchObject({ tipo: 'ocupada', ocupacion: { alquilerId: 3 } })
  })

  it('reparación y baja', () => {
    expect(describirMotivo('ARA-001', { tipo: 'estado', estado: 'reparacion' }, 1, HOY)).toBe('ARA-001 está en reparación.')
    expect(describirMotivo('ARA-001', { tipo: 'estado', estado: 'baja' }, 1, HOY)).toBe('ARA-001 está dado de baja.')
  })
})

describe('prueba aleatoria contra una versión día por día', () => {
  // Versión lenta y obvia: marca cada día ocupado y compara con los días pedidos.
  function chocaDiaPorDia(o: Ocupacion, inicio: string, fin: string, margen: number, hoy: string): boolean {
    const vuelve = o.estado === 'entregado' && o.fechaDevolucionPactada < hoy ? hoy : o.fechaDevolucionPactada
    const ocupados = new Set<string>()
    for (let d = o.fechaSalida; d <= sumarDias(vuelve, margen); d = sumarDias(d, 1)) ocupados.add(d)
    for (let d = inicio; d <= fin; d = sumarDias(d, 1)) if (ocupados.has(d)) return true
    return false
  }

  // Generador pseudoaleatorio con semilla fija: la prueba siempre es la misma.
  let semilla = 20261015
  const azar = (n: number): number => {
    semilla = (semilla * 1103515245 + 12345) % 2 ** 31
    return semilla % n
  }
  const BASE = '2026-12-15' // cruza fin de año

  it('coinciden en 3000 casos (fechas, márgenes, estados y "hoy" al azar)', () => {
    for (let i = 0; i < 3000; i++) {
      const salida = sumarDias(BASE, azar(40))
      const o = oc(salida, sumarDias(salida, azar(6)), azar(2) === 0 ? 'reservado' : 'entregado')
      const inicio = sumarDias(BASE, azar(40))
      const fin = sumarDias(inicio, azar(6))
      const margen = azar(4)
      const hoy = sumarDias(BASE, azar(50))
      const esperado = chocaDiaPorDia(o, inicio, fin, margen, hoy)
      expect(ocupacionChoca(o, { inicio, fin }, margen, hoy), JSON.stringify({ o, inicio, fin, margen, hoy })).toBe(esperado)
    }
  })
})

describe('unidadesLibres y asignación por cantidad', () => {
  const rango = { inicio: '2026-10-28', fin: '2026-10-31' }
  const UNIDADES = [
    unidad(1, 'HUM-003', '10'),
    unidad(2, 'HUM-001', '10', [], 'lavanderia'),
    unidad(3, 'HUM-002', '10', [oc('2026-10-29', '2026-10-30')]), // ocupada
    unidad(4, 'HUM-004', '10', [], 'reparacion'),
    unidad(5, 'HUM-005', '10', [], 'baja'),
    unidad(6, 'HUM-006', ' 10 '),
    unidad(7, 'HUM-007', '12'),
    unidad(8, 'HUM-008', '10', [oc('2026-11-10', '2026-11-12')]) // ocupada en otras fechas: libre
  ]

  it('solo las de esa talla y libres: primero disponibles por código, luego las de lavandería', () => {
    expect(unidadesLibres(UNIDADES, '10', rango, 1, HOY).map((u) => u.codigo)).toEqual([
      'HUM-003',
      'HUM-006',
      'HUM-008',
      'HUM-001'
    ])
  })

  it('la talla no distingue mayúsculas ni espacios', () => {
    const letras = [unidad(1, 'X-001', 'm'), unidad(2, 'X-002', ' M ')]
    expect(unidadesLibres(letras, 'M', rango, 1, HOY)).toHaveLength(2)
  })

  it('alcanzan: asigna exactamente la cantidad pedida, en orden de preferencia', () => {
    const libres = unidadesLibres(UNIDADES, '10', rango, 1, HOY)
    const r = asignarPorCantidad(libres, 2)
    expect(r.asignadas.map((u) => u.codigo)).toEqual(['HUM-003', 'HUM-006'])
    expect(r.faltan).toBe(0)
  })

  it('justo alcanzan', () => {
    const r = asignarPorCantidad(unidadesLibres(UNIDADES, '10', rango, 1, HOY), 4)
    expect(r.asignadas).toHaveLength(4)
    expect(r.faltan).toBe(0)
  })

  it('no alcanzan: asigna todas las libres e indica cuántas faltan', () => {
    const r = asignarPorCantidad(unidadesLibres(UNIDADES, '10', rango, 1, HOY), 7)
    expect(r.asignadas).toHaveLength(4)
    expect(r.faltan).toBe(3)
  })

  it('ninguna libre', () => {
    const r = asignarPorCantidad(unidadesLibres(UNIDADES, '16', rango, 1, HOY), 3)
    expect(r).toEqual({ asignadas: [], faltan: 3 })
  })

  it('salta las que ya están en el carrito', () => {
    const libres = unidadesLibres(UNIDADES, '10', rango, 1, HOY)
    const r = asignarPorCantidad(libres, 2, new Set([1, 6]))
    expect(r.asignadas.map((u) => u.codigo)).toEqual(['HUM-008', 'HUM-001'])
  })

  it('cantidad cero o negativa no asigna nada', () => {
    expect(asignarPorCantidad(UNIDADES, 0)).toEqual({ asignadas: [], faltan: 0 })
    expect(asignarPorCantidad(UNIDADES, -3)).toEqual({ asignadas: [], faltan: 0 })
  })
})
