import type Database from 'better-sqlite3'
import type { TipoGarantia } from '../../shared/pedidos'
import { calcularDeuda, type EstadoCuenta } from '../logica/liquidacion'

type Db = Database.Database

// Totales por pedido en una sola consulta. El total del alquiler incluye las unidades
// asignadas y las que faltan confeccionar (a su precio acordado).
const SQL_CUENTAS = `
  SELECT a.id, a.cliente_id, a.estado, a.garantia_tipo, a.garantia_devuelta,
    (SELECT COALESCE(SUM(d.precio_cobrado), 0) FROM detalle_alquiler d WHERE d.alquiler_id = a.id)
      + (SELECT COALESCE(SUM((p.cantidad - p.cantidad_asignada) * p.precio_cobrado), 0)
           FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS total,
    (SELECT COALESCE(SUM(CASE WHEN g.tipo IN ('dano', 'pieza_faltante') THEN g.monto ELSE 0 END), 0)
       FROM cargos g WHERE g.alquiler_id = a.id) AS cargos_danos,
    (SELECT COALESCE(SUM(CASE WHEN g.tipo = 'mora' THEN g.monto ELSE 0 END), 0)
       FROM cargos g WHERE g.alquiler_id = a.id) AS cargos_mora,
    (SELECT COALESCE(SUM(CASE x.concepto WHEN 'adelanto' THEN x.monto WHEN 'saldo' THEN x.monto
                                         WHEN 'devolucion_adelanto' THEN -x.monto ELSE 0 END), 0)
       FROM pagos x WHERE x.alquiler_id = a.id) AS pagado_alquiler,
    (SELECT COALESCE(SUM(CASE WHEN x.concepto = 'dano' THEN x.monto ELSE 0 END), 0)
       FROM pagos x WHERE x.alquiler_id = a.id) AS pagado_danos,
    (SELECT COALESCE(SUM(CASE WHEN x.concepto = 'mora' THEN x.monto ELSE 0 END), 0)
       FROM pagos x WHERE x.alquiler_id = a.id) AS pagado_mora,
    (SELECT COALESCE(SUM(CASE WHEN x.concepto = 'garantia_recibida' THEN x.monto ELSE 0 END), 0)
       FROM pagos x WHERE x.alquiler_id = a.id) AS garantia_recibida,
    (SELECT COALESCE(SUM(CASE WHEN x.concepto = 'garantia_devuelta' THEN x.monto ELSE 0 END), 0)
       FROM pagos x WHERE x.alquiler_id = a.id) AS garantia_devuelta_monto,
    (SELECT COALESCE(SUM(CASE WHEN x.desde_garantia = 1 THEN x.monto ELSE 0 END), 0)
       FROM pagos x WHERE x.alquiler_id = a.id) AS garantia_retenida
  FROM alquileres a`

interface FilaCuenta {
  id: number
  cliente_id: number
  estado: string
  garantia_tipo: TipoGarantia | null
  garantia_devuelta: number
  total: number
  cargos_danos: number
  cargos_mora: number
  pagado_alquiler: number
  pagado_danos: number
  pagado_mora: number
  garantia_recibida: number
  garantia_devuelta_monto: number
  garantia_retenida: number
}

function aEstadoCuenta(f: FilaCuenta): EstadoCuenta {
  return {
    totalAlquiler: f.total,
    pagadoAlquiler: f.pagado_alquiler,
    cargosDanos: f.cargos_danos,
    cargosMora: f.cargos_mora,
    pagadoDanos: f.pagado_danos,
    pagadoMora: f.pagado_mora,
    garantia: {
      tipo: f.garantia_tipo,
      recibida: f.garantia_recibida,
      devuelta: f.garantia_devuelta_monto,
      retenida: f.garantia_retenida,
      cerrada: f.garantia_devuelta === 1
    }
  }
}

export function estadoCuenta(db: Db, alquilerId: number): EstadoCuenta {
  const f = db.prepare(`${SQL_CUENTAS} WHERE a.id = ?`).get(alquilerId) as FilaCuenta | undefined
  if (!f) throw new Error(`No existe el alquiler ${alquilerId}`)
  return aEstadoCuenta(f)
}

/** Deuda que quedó en pedidos ya devueltos (cerrados con "Debe S/ X"), por cliente. */
export function deudasPorCliente(db: Db, clienteId: number | null = null): Map<number, number> {
  const filas = db
    .prepare(`${SQL_CUENTAS} WHERE a.estado = 'devuelto' ${clienteId === null ? '' : 'AND a.cliente_id = ?'}`)
    .all(...(clienteId === null ? [] : [clienteId])) as FilaCuenta[]
  const deudas = new Map<number, number>()
  for (const f of filas) {
    const d = calcularDeuda(aEstadoCuenta(f)).total
    if (d > 0) deudas.set(f.cliente_id, (deudas.get(f.cliente_id) ?? 0) + d)
  }
  return deudas
}
