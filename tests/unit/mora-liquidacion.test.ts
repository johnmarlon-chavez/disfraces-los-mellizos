import { describe, expect, it } from 'vitest'
import { calcularDeuda, planLiquidacion, repartirPagoDeDeuda, type EstadoCuenta } from '../../src/main/logica/liquidacion'
import { calcularMora, diasDeRetraso } from '../../src/main/logica/mora'
import { ErrorDeNegocio } from '../../src/main/errores'
import { exigirDuena, establecerVerificadorDuena } from '../../src/main/sesion'

const PACTADA = '2026-10-31'
const u = (unidadId: number, fecha: string) => ({ unidadId, codigo: `HUM-00${unidadId}`, fechaDevolucion: fecha })

describe('días de retraso', () => {
  it('a tiempo o antes: 0', () => {
    expect(diasDeRetraso(PACTADA, '2026-10-31')).toBe(0)
    expect(diasDeRetraso(PACTADA, '2026-10-29')).toBe(0)
  })
  it('tarde, cruzando mes y año', () => {
    expect(diasDeRetraso(PACTADA, '2026-11-03')).toBe(3)
    expect(diasDeRetraso('2026-12-30', '2027-01-02')).toBe(3)
  })
})

describe('mora por unidad', () => {
  it('cada unidad atrasada genera su cargo', () => {
    const cargos = calcularMora('por_unidad', 500, PACTADA, [], [u(1, '2026-11-02'), u(2, '2026-10-31'), u(3, '2026-11-02')])
    expect(cargos).toEqual([
      { unidadId: 1, dias: 2, monto: 1000, descripcion: 'HUM-001: 2 días de retraso' },
      { unidadId: 3, dias: 2, monto: 1000, descripcion: 'HUM-003: 2 días de retraso' }
    ])
  })

  it('en devoluciones parciales, cada grupo con sus días', () => {
    expect(calcularMora('por_unidad', 500, PACTADA, [], [u(1, '2026-10-31')])).toEqual([])
    expect(calcularMora('por_unidad', 500, PACTADA, [{ fechaDevolucion: '2026-10-31' }], [u(2, '2026-11-01')])).toEqual([
      { unidadId: 2, dias: 1, monto: 500, descripcion: 'HUM-002: 1 día de retraso' }
    ])
  })
})

describe('mora por pedido (incremental)', () => {
  const porPedido = (antes: string[], nuevas: string[]) =>
    calcularMora(
      'por_pedido',
      500,
      PACTADA,
      antes.map((f) => ({ fechaDevolucion: f })),
      nuevas.map((f, i) => u(i + 1, f))
    )

  it('todo en un solo grupo: mayor retraso × mora', () => {
    expect(porPedido([], ['2026-11-01', '2026-11-03', '2026-10-31'])).toEqual([
      { unidadId: null, dias: 3, monto: 1500, descripcion: 'Pedido: 3 días de retraso' }
    ])
  })

  it('grupos: a tiempo (0), luego 3 días (+3), luego 5 días (+2): total 5 días, nunca dos veces', () => {
    expect(porPedido([], ['2026-10-31'])).toEqual([])
    expect(porPedido(['2026-10-31'], ['2026-11-03'])[0]).toMatchObject({ dias: 3, monto: 1500 })
    expect(porPedido(['2026-10-31', '2026-11-03'], ['2026-11-05'])[0]).toMatchObject({
      dias: 2,
      monto: 1000,
      descripcion: 'Pedido: 5 días de retraso (ya se habían cobrado 3 días)'
    })
  })

  it('un grupo que vuelve con menos retraso que el máximo ya cobrado no genera cargo', () => {
    expect(porPedido(['2026-11-05'], ['2026-11-02'])).toEqual([])
  })

  it('suma de cargos por grupos = mayor retraso × mora (100 órdenes al azar)', () => {
    let semilla = 7
    const azar = (n: number) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), semilla % n)
    for (let caso = 0; caso < 100; caso++) {
      const fechas = Array.from({ length: 1 + azar(8) }, () => `2026-11-0${1 + azar(8)}`)
      let total = 0
      const antes: string[] = []
      for (const f of fechas) {
        total += porPedido(antes, [f]).reduce((s, c) => s + c.monto, 0)
        antes.push(f)
      }
      const maximo = Math.max(...fechas.map((f) => diasDeRetraso(PACTADA, f)))
      expect(total).toBe(maximo * 500)
    }
  })
})

describe('mora en cero', () => {
  it('si la mora por día es 0 no hay cargos', () => {
    expect(calcularMora('por_unidad', 0, PACTADA, [], [u(1, '2026-11-10')])).toEqual([])
    expect(calcularMora('por_pedido', 0, PACTADA, [], [u(1, '2026-11-10')])).toEqual([])
  })
})

function cuenta(
  parcial: Omit<Partial<EstadoCuenta>, 'garantia'> & { garantia?: Partial<EstadoCuenta['garantia']> } = {}
): EstadoCuenta {
  return {
    totalAlquiler: 10000,
    pagadoAlquiler: 10000,
    cargosDanos: 0,
    cargosMora: 0,
    pagadoDanos: 0,
    pagadoMora: 0,
    ...parcial,
    garantia: { tipo: 'efectivo', recibida: 5000, devuelta: 0, retenida: 0, cerrada: false, ...parcial.garantia }
  }
}

describe('liquidación de la garantía', () => {
  it('sin deuda: se devuelve toda la garantía', () => {
    const p = planLiquidacion(cuenta())
    expect(p.devolverGarantia).toBe(5000)
    expect(p.faltaCobrar.total).toBe(0)
  })

  it('garantía mayor que la deuda: se descuenta y se devuelve el resto', () => {
    const p = planLiquidacion(cuenta({ cargosDanos: 1200, cargosMora: 1000 }))
    expect(p.retener).toEqual({ saldo: 0, danos: 1200, mora: 1000, total: 2200 })
    expect(p.devolverGarantia).toBe(2800)
    expect(p.faltaCobrar.total).toBe(0)
  })

  it('garantía igual a la deuda: no se devuelve nada ni falta cobrar', () => {
    const p = planLiquidacion(cuenta({ cargosDanos: 5000 }))
    expect(p.devolverGarantia).toBe(0)
    expect(p.faltaCobrar.total).toBe(0)
  })

  it('cargos mayores que la garantía: se retiene todo y falta cobrar la diferencia', () => {
    const p = planLiquidacion(cuenta({ cargosDanos: 4000, cargosMora: 3000 }))
    expect(p.retener).toEqual({ saldo: 0, danos: 4000, mora: 1000, total: 5000 })
    expect(p.devolverGarantia).toBe(0)
    expect(p.faltaCobrar).toEqual({ saldo: 0, danos: 0, mora: 2000, total: 2000 })
  })

  it('orden de cobertura: saldo, luego daños y faltantes, luego mora', () => {
    const p = planLiquidacion(cuenta({ pagadoAlquiler: 8000, cargosDanos: 2000, cargosMora: 2000 }))
    expect(p.retener).toEqual({ saldo: 2000, danos: 2000, mora: 1000, total: 5000 })
    expect(p.faltaCobrar).toEqual({ saldo: 0, danos: 0, mora: 1000, total: 1000 })
  })

  it('lo ya pagado de un concepto no se vuelve a cobrar', () => {
    const p = planLiquidacion(cuenta({ cargosMora: 1500, pagadoMora: 1000 }))
    expect(p.retener.mora).toBe(500)
  })

  it('pagó de más por el alquiler (unidades que no se entregaron): queda a favor', () => {
    const d = calcularDeuda(cuenta({ totalAlquiler: 9000, pagadoAlquiler: 10000 }))
    expect(d.aFavor).toBe(1000)
    expect(d.saldo).toBe(0)
  })

  it('DNI en prenda sin deuda: devolverlo', () => {
    const p = planLiquidacion(cuenta({ garantia: { tipo: 'dni', recibida: 0 } }))
    expect(p.dni).toBe('devolver')
    expect(p.garantiaDisponible).toBe(0)
  })

  it('DNI en prenda con deuda: retenerlo hasta que pague', () => {
    const p = planLiquidacion(cuenta({ cargosDanos: 3000, garantia: { tipo: 'dni', recibida: 0 } }))
    expect(p.dni).toBe('retener')
    expect(p.faltaCobrar.total).toBe(3000)
  })

  it('la garantía ya liquidada no se vuelve a usar', () => {
    const p = planLiquidacion(cuenta({ cargosDanos: 1000, garantia: { recibida: 5000, retenida: 1000, devuelta: 4000, cerrada: true } }))
    expect(p.garantiaDisponible).toBe(0)
  })

  it('prueba aleatoria: devuelto + retenido = garantía, nada negativo, deuda = retenido + falta cobrar', () => {
    let semilla = 99
    const azar = (n: number) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), semilla % n)
    for (let i = 0; i < 1000; i++) {
      const c = cuenta({
        totalAlquiler: azar(50000),
        pagadoAlquiler: azar(50000),
        cargosDanos: azar(20000),
        cargosMora: azar(10000),
        pagadoDanos: azar(5000),
        pagadoMora: azar(5000),
        garantia: { tipo: azar(3) === 0 ? 'dni' : 'efectivo', recibida: azar(30000) }
      })
      const p = planLiquidacion(c)
      expect(p.devolverGarantia + p.retener.total).toBe(p.garantiaDisponible)
      for (const v of [p.devolverGarantia, p.retener.saldo, p.retener.danos, p.retener.mora, p.faltaCobrar.saldo, p.faltaCobrar.danos, p.faltaCobrar.mora]) {
        expect(v).toBeGreaterThanOrEqual(0)
      }
      expect(p.retener.total + p.faltaCobrar.total).toBe(p.deuda.total)
      if (p.faltaCobrar.total > 0) expect(p.devolverGarantia).toBe(0)
    }
  })
})

describe('pago de deuda', () => {
  const deuda = { saldo: 1000, danos: 2000, mora: 500, total: 3500 }
  it('se reparte en orden saldo, daños, mora', () => {
    expect(repartirPagoDeDeuda(2500, deuda)).toEqual({ saldo: 1000, danos: 1500, mora: 0, total: 2500 })
  })
  it('no se cobra más de lo que se debe', () => {
    expect(() => repartirPagoDeDeuda(3600, deuda)).toThrow('El cliente debe S/ 35.00: no se puede cobrar S/ 36.00.')
    expect(() => repartirPagoDeDeuda(0, deuda)).toThrow(ErrorDeNegocio)
  })
})

describe('autorización de la dueña con su contraseña (preparado para la fase 7)', () => {
  const empleado = { usuarioId: 2, rol: 'empleado' as const }
  it('con la contraseña correcta, la sesión de Trabajadores puede hacer la acción', () => {
    establecerVerificadorDuena((c) => c === 'clave-duena')
    try {
      expect(() => exigirDuena(empleado, 'rebajar la mora', { contrasena: 'clave-duena' })).not.toThrow()
      expect(() => exigirDuena(empleado, 'rebajar la mora', { contrasena: 'otra' })).toThrow('La contraseña de la dueña no es correcta.')
      expect(() => exigirDuena(empleado, 'rebajar la mora', null)).toThrow(/Pídale que ingrese su contraseña/)
    } finally {
      establecerVerificadorDuena(null)
    }
  })
})
