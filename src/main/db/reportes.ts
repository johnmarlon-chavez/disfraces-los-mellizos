import type Database from 'better-sqlite3'
import type { TipoCliente } from '../../shared/clientes'
import { mismaTalla, type Region } from '../../shared/disfraces'
import { diasEntre, sumarDias } from '../../shared/fechas'
import { hoyEnLima } from '../../shared/formato'
import type { ConceptoPago, EstadoPedido, EstadoPendiente, MedioPago } from '../../shared/pedidos'
import type {
  CalendarioOcupacion,
  DatosInicio,
  DeudaInicio,
  FilaAgrupada,
  FilaConfeccion,
  FilaMasAlquilado,
  GarantiaEnCustodia,
  MoraRebajada,
  PedidoConDescuento,
  PedidoFuera,
  PedidoInicio,
  Periodo,
  ReporteIngresos,
  ReporteMedios,
  UnidadInicio
} from '../../shared/reportes'
import { ErrorDeNegocio } from '../errores'
import { calcularDeuda } from '../logica/liquidacion'
import { calcularMora, diasDeRetraso } from '../logica/mora'
import { agruparIngresos, enCustodia, movimientosPorMedio, ocupacionPorDia, type PagoParaReporte } from '../logica/reportes'
import type { Sesion } from '../sesion'
import { obtenerConfiguracion } from './configuracion'
import { deudasPorCliente, estadoCuenta } from './cuentas'
import { leerUnidades } from './pedidos'

type Db = Database.Database

// ---------- Pagos ----------

interface FilaPago {
  alquiler_id: number
  fecha: string
  concepto: ConceptoPago
  monto: number
  medio: MedioPago
  desde_garantia: number
  estado: EstadoPedido
}

function leerPagos(db: Db, desde: string | null = null): (PagoParaReporte & { alquilerId: number })[] {
  // Margen de un día: los días se cuentan en hora de Lima y se guardan en UTC.
  const filas = db
    .prepare(
      `SELECT x.alquiler_id, x.fecha, x.concepto, x.monto, x.medio, x.desde_garantia, a.estado
       FROM pagos x JOIN alquileres a ON a.id = x.alquiler_id
       ${desde ? 'WHERE x.fecha >= ?' : ''} ORDER BY x.fecha, x.id`
    )
    .all(...(desde ? [sumarDias(desde, -1)] : [])) as FilaPago[]
  return filas.map((f) => ({
    alquilerId: f.alquiler_id,
    fecha: f.fecha,
    concepto: f.concepto,
    monto: f.monto,
    medio: f.medio,
    desdeGarantia: f.desde_garantia === 1,
    pedidoCancelado: f.estado === 'cancelado'
  }))
}

function validarPeriodo(p: Periodo): void {
  if (!p.desde || !p.hasta || p.hasta < p.desde) throw new ErrorDeNegocio('Elija un período válido.')
}

export function reporteIngresos(db: Db, periodo: Periodo): ReporteIngresos {
  validarPeriodo(periodo)
  const r = agruparIngresos(leerPagos(db, periodo.desde), periodo)
  const porCobrar = [...deudasPorCliente(db).values()].reduce((s, d) => s + d, 0)
  return { ...r, porCobrar }
}

function garantiasEnCustodia(db: Db): GarantiaEnCustodia[] {
  const porPedido = new Map<number, (PagoParaReporte & { alquilerId: number })[]>()
  for (const p of leerPagos(db)) porPedido.set(p.alquilerId, [...(porPedido.get(p.alquilerId) ?? []), p])
  const lista: GarantiaEnCustodia[] = []
  for (const [pedidoId, pagos] of porPedido) {
    const monto = enCustodia(pagos)
    if (monto <= 0) continue
    const f = db
      .prepare('SELECT a.estado, c.nombres FROM alquileres a JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ?')
      .get(pedidoId) as { estado: EstadoPedido; nombres: string }
    const medio = pagos.find((p) => p.concepto === 'garantia_recibida')?.medio ?? 'efectivo'
    lista.push({ pedidoId, clienteNombre: f.nombres, estado: f.estado, medio, monto })
  }
  return lista.sort((a, b) => a.pedidoId - b.pedidoId)
}

export function reporteMedios(db: Db, periodo: Periodo): ReporteMedios {
  validarPeriodo(periodo)
  const custodia = garantiasEnCustodia(db)
  return {
    medios: movimientosPorMedio(leerPagos(db, periodo.desde), periodo),
    custodia,
    totalCustodia: custodia.reduce((s, g) => s + g.monto, 0)
  }
}

// ---------- Inicio ----------

interface FilaPedidoActivo {
  id: number
  estado: 'reservado' | 'entregado'
  fecha_salida: string
  fecha_devolucion_pactada: string
  evento: string
  nombres: string
  tipo: TipoCliente
  telefono: string
  unidades: number
  sin_entregar: number
  por_confeccionar: number
  fuera: number
}

function pedidosActivos(db: Db): FilaPedidoActivo[] {
  return db
    .prepare(
      `SELECT a.id, a.estado, a.fecha_salida, a.fecha_devolucion_pactada, a.evento, c.nombres, c.tipo, c.telefono,
         (SELECT COUNT(*) FROM detalle_alquiler d WHERE d.alquiler_id = a.id) AS unidades,
         (SELECT COUNT(*) FROM detalle_alquiler d WHERE d.alquiler_id = a.id AND d.fecha_entrega_real IS NULL) AS sin_entregar,
         (SELECT COALESCE(SUM(p.cantidad - p.cantidad_asignada), 0) FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS por_confeccionar,
         (SELECT COUNT(*) FROM detalle_alquiler d WHERE d.alquiler_id = a.id
            AND d.fecha_entrega_real IS NOT NULL AND d.fecha_devolucion_real IS NULL) AS fuera
       FROM alquileres a JOIN clientes c ON c.id = a.cliente_id
       WHERE a.estado IN ('reservado', 'entregado')
       ORDER BY a.fecha_salida, a.id`
    )
    .all() as FilaPedidoActivo[]
}

function moraEstimada(db: Db, pedidoId: number, pactada: string, hoy: string): number {
  const config = obtenerConfiguracion(db)
  const lineas = db
    .prepare(
      `SELECT d.unidad_id, u.codigo, d.fecha_entrega_real, d.fecha_devolucion_real
       FROM detalle_alquiler d JOIN unidades u ON u.id = d.unidad_id WHERE d.alquiler_id = ?`
    )
    .all(pedidoId) as { unidad_id: number; codigo: string; fecha_entrega_real: string | null; fecha_devolucion_real: string | null }[]
  const antes = lineas.filter((l) => l.fecha_devolucion_real).map((l) => ({ fechaDevolucion: l.fecha_devolucion_real! }))
  const fuera = lineas
    .filter((l) => l.fecha_entrega_real && !l.fecha_devolucion_real)
    .map((l) => ({ unidadId: l.unidad_id, codigo: l.codigo, fechaDevolucion: hoy }))
  return calcularMora(config.modoMora, config.moraPorDia, pactada, antes, fuera).reduce((s, c) => s + c.monto, 0)
}

function aPedidoInicio(db: Db, f: FilaPedidoActivo, hoy: string, conMora: boolean): PedidoInicio {
  const diasRetraso = f.estado === 'entregado' && f.fuera > 0 ? diasDeRetraso(f.fecha_devolucion_pactada, hoy) : 0
  return {
    pedidoId: f.id,
    clienteNombre: f.nombres,
    clienteTipo: f.tipo,
    telefono: f.telefono,
    evento: f.evento,
    fechaSalida: f.fecha_salida,
    fechaDevolucionPactada: f.fecha_devolucion_pactada,
    unidades: f.unidades + f.por_confeccionar,
    faltanEntregar: f.sin_entregar + f.por_confeccionar,
    faltanDevolver: f.fuera,
    diasRetraso,
    moraEstimada: conMora && diasRetraso > 0 ? moraEstimada(db, f.id, f.fecha_devolucion_pactada, hoy) : 0
  }
}

export function deudas(db: Db): DeudaInicio[] {
  const filas = db
    .prepare(
      `SELECT a.id, a.cliente_id, a.garantia_tipo, a.garantia_devuelta, a.garantia_documento, c.nombres, c.telefono
       FROM alquileres a JOIN clientes c ON c.id = a.cliente_id WHERE a.estado = 'devuelto' ORDER BY a.id`
    )
    .all() as {
    id: number
    cliente_id: number
    garantia_tipo: string | null
    garantia_devuelta: number
    garantia_documento: string | null
    nombres: string
    telefono: string
  }[]
  const porCliente = new Map<number, DeudaInicio>()
  for (const f of filas) {
    const d = calcularDeuda(estadoCuenta(db, f.id)).total
    if (d <= 0) continue
    const item = porCliente.get(f.cliente_id) ?? {
      clienteId: f.cliente_id,
      clienteNombre: f.nombres,
      telefono: f.telefono,
      monto: 0,
      pedidos: [],
      documentoRetenido: null
    }
    item.monto += d
    item.pedidos.push(f.id)
    if (f.garantia_tipo === 'dni' && f.garantia_devuelta === 0) item.documentoRetenido = f.garantia_documento
    porCliente.set(f.cliente_id, item)
  }
  return [...porCliente.values()].sort((a, b) => b.monto - a.monto)
}

function unidadesEn(db: Db, estado: 'lavanderia' | 'reparacion'): UnidadInicio[] {
  return (
    db
      .prepare(
        `SELECT u.id, u.codigo, m.nombre AS modelo, u.talla, u.estado_fisico, u.observaciones
         FROM unidades u JOIN modelos m ON m.id = u.modelo_id
         WHERE u.estado_fisico = ? ORDER BY m.nombre, u.codigo`
      )
      .all(estado) as { id: number; codigo: string; modelo: string; talla: string; estado_fisico: 'lavanderia' | 'reparacion'; observaciones: string }[]
  ).map((f) => ({ id: f.id, codigo: f.codigo, modeloNombre: f.modelo, talla: f.talla, estadoFisico: f.estado_fisico, observaciones: f.observaciones }))
}

/** Datos de Inicio. El dinero (ingresos de hoy y garantías en custodia) solo para la dueña. */
export function datosInicio(db: Db, sesion: Sesion | null, hoy: string = hoyEnLima()): DatosInicio {
  const activos = pedidosActivos(db)
  const en7 = sumarDias(hoy, 7)
  const pedido = (f: FilaPedidoActivo, conMora = false): PedidoInicio => aPedidoInicio(db, f, hoy, conMora)

  const pendientes = (
    db
      .prepare(
        `SELECT p.id, p.alquiler_id, c.nombres, m.nombre AS modelo, p.talla, p.cantidad - p.cantidad_asignada AS faltan,
                p.fecha_limite, p.estado
         FROM pendientes_confeccion p
         JOIN alquileres a ON a.id = p.alquiler_id JOIN clientes c ON c.id = a.cliente_id
         JOIN modelos m ON m.id = p.modelo_id
         WHERE p.estado <> 'listo' AND a.estado IN ('reservado', 'entregado')
         ORDER BY p.fecha_limite, p.id`
      )
      .all() as { id: number; alquiler_id: number; nombres: string; modelo: string; talla: string; faltan: number; fecha_limite: string; estado: EstadoPendiente }[]
  ).map((f) => ({
    id: f.id,
    pedidoId: f.alquiler_id,
    clienteNombre: f.nombres,
    modeloNombre: f.modelo,
    talla: f.talla,
    faltan: f.faltan,
    fechaLimite: f.fecha_limite,
    estado: f.estado,
    vencido: f.fecha_limite < hoy,
    vencePronto: f.fecha_limite >= hoy && f.fecha_limite <= en7
  }))

  const esDuena = !sesion || sesion.rol === 'admin'
  return {
    hoy,
    vencidas: activos
      .filter((f) => f.estado === 'entregado' && f.fuera > 0 && f.fecha_devolucion_pactada < hoy)
      .map((f) => pedido(f, true))
      .sort((a, b) => b.diasRetraso - a.diasRetraso),
    noRecogidas: activos.filter((f) => f.estado === 'reservado' && f.fecha_salida < hoy).map((f) => pedido(f)),
    entregasHoy: activos
      .filter((f) => (f.estado === 'reservado' && f.fecha_salida === hoy) || (f.estado === 'entregado' && f.sin_entregar > 0))
      .map((f) => pedido(f)),
    devolucionesHoy: activos
      .filter((f) => f.estado === 'entregado' && f.fuera > 0 && f.fecha_devolucion_pactada === hoy)
      .map((f) => pedido(f)),
    pendientes,
    enLavanderia: unidadesEn(db, 'lavanderia'),
    enReparacion: unidadesEn(db, 'reparacion'),
    proximasEntregas: activos
      .filter((f) => f.estado === 'reservado' && f.fecha_salida > hoy && f.fecha_salida <= en7)
      .map((f) => pedido(f)),
    deudas: deudas(db),
    dinero: esDuena
      ? {
          ingresosHoy: agruparIngresos(leerPagos(db, hoy), { desde: hoy, hasta: hoy }).totales.total,
          custodia: garantiasEnCustodia(db).reduce((s, g) => s + g.monto, 0)
        }
      : null
  }
}

// ---------- Reportes ----------

/** Disfraces que salieron y no han vuelto, por pedido. */
export function disfracesFuera(db: Db, hoy: string = hoyEnLima()): PedidoFuera[] {
  const filas = db
    .prepare(
      `SELECT a.id, c.nombres, c.telefono, a.fecha_devolucion_pactada, u.codigo
       FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id
       JOIN clientes c ON c.id = a.cliente_id JOIN unidades u ON u.id = d.unidad_id
       WHERE a.estado = 'entregado' AND d.fecha_entrega_real IS NOT NULL AND d.fecha_devolucion_real IS NULL
       ORDER BY a.fecha_devolucion_pactada, a.id, u.codigo`
    )
    .all() as { id: number; nombres: string; telefono: string; fecha_devolucion_pactada: string; codigo: string }[]
  const por = new Map<number, PedidoFuera>()
  for (const f of filas) {
    const p = por.get(f.id) ?? {
      pedidoId: f.id,
      clienteNombre: f.nombres,
      telefono: f.telefono,
      fechaDevolucionPactada: f.fecha_devolucion_pactada,
      diasRetraso: diasDeRetraso(f.fecha_devolucion_pactada, hoy),
      codigos: []
    }
    p.codigos.push(f.codigo)
    por.set(f.id, p)
  }
  return [...por.values()]
}

export function vencidosYNoRecogidos(db: Db, hoy: string = hoyEnLima()): { vencidas: PedidoInicio[]; noRecogidas: PedidoInicio[] } {
  const d = datosInicio(db, null, hoy)
  return { vencidas: d.vencidas, noRecogidas: d.noRecogidas }
}

/** Ranking por modelo en el período (por fecha de salida). Los pedidos cancelados no cuentan. */
export function masAlquilados(db: Db, periodo: Periodo, region: Region | '' = '', evento = ''): FilaMasAlquilado[] {
  validarPeriodo(periodo)
  return (
    db
      .prepare(
        `SELECT m.id, m.nombre, m.region, COUNT(*) AS veces, COUNT(DISTINCT a.id) AS pedidos, SUM(d.precio_cobrado) AS ingreso
         FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id
         JOIN unidades u ON u.id = d.unidad_id JOIN modelos m ON m.id = u.modelo_id
         WHERE a.estado <> 'cancelado' AND a.fecha_salida BETWEEN ? AND ?
           AND (? = '' OR m.region = ?) AND (? = '' OR a.evento = ?)
         GROUP BY m.id ORDER BY veces DESC, ingreso DESC, m.nombre`
      )
      .all(periodo.desde, periodo.hasta, region, region, evento, evento) as {
      id: number
      nombre: string
      region: Region | null
      veces: number
      pedidos: number
      ingreso: number
    }[]
  ).map((f) => ({ modeloId: f.id, modeloNombre: f.nombre, region: f.region, veces: f.veces, pedidos: f.pedidos, ingreso: f.ingreso }))
}

/** Pedidos, disfraces (asignados + por confeccionar) y total, por colegio o por evento. */
export function alquileresAgrupados(db: Db, periodo: Periodo, por: 'colegio' | 'evento'): FilaAgrupada[] {
  validarPeriodo(periodo)
  const filas = db
    .prepare(
      `SELECT a.id, a.cliente_id, c.nombres, c.tipo, a.evento,
         (SELECT COUNT(*) FROM detalle_alquiler d WHERE d.alquiler_id = a.id)
           + (SELECT COALESCE(SUM(p.cantidad - p.cantidad_asignada), 0) FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS disfraces,
         (SELECT COALESCE(SUM(d.precio_cobrado), 0) FROM detalle_alquiler d WHERE d.alquiler_id = a.id)
           + (SELECT COALESCE(SUM((p.cantidad - p.cantidad_asignada) * p.precio_cobrado), 0) FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS total
       FROM alquileres a JOIN clientes c ON c.id = a.cliente_id
       WHERE a.estado <> 'cancelado' AND a.fecha_salida BETWEEN ? AND ?`
    )
    .all(periodo.desde, periodo.hasta) as { id: number; cliente_id: number; nombres: string; tipo: TipoCliente; evento: string; disfraces: number; total: number }[]
  const grupos = new Map<string, FilaAgrupada>()
  for (const f of filas) {
    if (por === 'colegio' && f.tipo !== 'colegio') continue
    const clave = por === 'colegio' ? f.nombres : f.evento || 'Sin evento'
    const g = grupos.get(clave) ?? { clave, clienteId: por === 'colegio' ? f.cliente_id : undefined, pedidos: 0, disfraces: 0, total: 0 }
    g.pedidos++
    g.disfraces += f.disfraces
    g.total += f.total
    grupos.set(clave, g)
  }
  return [...grupos.values()].sort((a, b) => b.disfraces - a.disfraces || a.clave.localeCompare(b.clave, 'es'))
}

/** Qué hay que confeccionar, sumado por modelo y talla, con el detalle por pedido. */
export function confeccion(db: Db): FilaConfeccion[] {
  const d = datosInicio(db, null)
  const filas = db
    .prepare('SELECT p.id, p.modelo_id FROM pendientes_confeccion p')
    .all() as { id: number; modelo_id: number }[]
  const modeloDe = new Map(filas.map((f) => [f.id, f.modelo_id]))
  const res: FilaConfeccion[] = []
  for (const p of d.pendientes) {
    const modeloId = modeloDe.get(p.id)!
    let g = res.find((x) => x.modeloId === modeloId && mismaTalla(x.talla, p.talla))
    if (!g) {
      g = { modeloId, modeloNombre: p.modeloNombre, talla: p.talla, faltan: 0, fechaLimiteMasCercana: p.fechaLimite, detalle: [] }
      res.push(g)
    }
    g.faltan += p.faltan
    if (p.fechaLimite < g.fechaLimiteMasCercana) g.fechaLimiteMasCercana = p.fechaLimite
    g.detalle.push({ pedidoId: p.pedidoId, clienteNombre: p.clienteNombre, faltan: p.faltan, fechaLimite: p.fechaLimite, estado: p.estado })
  }
  return res.sort((a, b) => a.fechaLimiteMasCercana.localeCompare(b.fechaLimiteMasCercana))
}

/** Libres por día y talla de un modelo en un mes ("aaaa-mm"). */
export function calendarioOcupacion(db: Db, modeloId: number, mes: string, hoy: string = hoyEnLima()): CalendarioOcupacion {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErrorDeNegocio('Elija el mes.')
  const modelo = db.prepare('SELECT nombre FROM modelos WHERE id = ?').get(modeloId) as { nombre: string } | undefined
  if (!modelo) throw new ErrorDeNegocio('Elija el disfraz.')
  const inicio = `${mes}-01`
  const [a, m] = mes.split('-').map(Number)
  const fin = sumarDias(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1)
  const dias = Array.from({ length: diasEntre(inicio, fin) + 1 }, (_, i) => sumarDias(inicio, i))
  const margen = obtenerConfiguracion(db).diasMargenLavado
  return { modeloNombre: modelo.nombre, dias, tallas: ocupacionPorDia(leerUnidades(db, 'u.modelo_id = ?', [modeloId]), dias, margen, hoy) }
}

/** Pedidos con descuento en el período y moras rebajadas o perdonadas. */
export function descuentos(db: Db, periodo: Periodo): { pedidos: PedidoConDescuento[]; moras: MoraRebajada[] } {
  validarPeriodo(periodo)
  const pedidos = (
    db
      .prepare(
        `SELECT a.id, c.nombres, a.fecha_salida,
           (SELECT COALESCE(SUM(d.precio_original), 0) FROM detalle_alquiler d WHERE d.alquiler_id = a.id)
             + (SELECT COALESCE(SUM((p.cantidad - p.cantidad_asignada) * p.precio_original), 0) FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS original,
           (SELECT COALESCE(SUM(d.precio_cobrado), 0) FROM detalle_alquiler d WHERE d.alquiler_id = a.id)
             + (SELECT COALESCE(SUM((p.cantidad - p.cantidad_asignada) * p.precio_cobrado), 0) FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS cobrado
         FROM alquileres a JOIN clientes c ON c.id = a.cliente_id
         WHERE a.estado <> 'cancelado' AND a.fecha_salida BETWEEN ? AND ?
         ORDER BY a.fecha_salida, a.id`
      )
      .all(periodo.desde, periodo.hasta) as { id: number; nombres: string; fecha_salida: string; original: number; cobrado: number }[]
  )
    .filter((f) => f.cobrado < f.original)
    .map((f) => ({ pedidoId: f.id, clienteNombre: f.nombres, fechaSalida: f.fecha_salida, original: f.original, cobrado: f.cobrado, descuento: f.original - f.cobrado }))
  const moras = (
    db
      .prepare(
        `SELECT g.alquiler_id, c.nombres, g.descripcion, g.monto_original, g.monto, g.motivo_rebaja
         FROM cargos g JOIN alquileres a ON a.id = g.alquiler_id JOIN clientes c ON c.id = a.cliente_id
         WHERE g.tipo = 'mora' AND g.monto < g.monto_original AND a.fecha_salida BETWEEN ? AND ?
         ORDER BY g.id`
      )
      .all(periodo.desde, periodo.hasta) as { alquiler_id: number; nombres: string; descripcion: string; monto_original: number; monto: number; motivo_rebaja: string }[]
  ).map((f) => ({ pedidoId: f.alquiler_id, clienteNombre: f.nombres, descripcion: f.descripcion, original: f.monto_original, cobrado: f.monto, motivo: f.motivo_rebaja }))
  return { pedidos, moras }
}
