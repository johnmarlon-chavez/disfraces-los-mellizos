import type Database from 'better-sqlite3'
import { mismaTalla, normalizarTalla, ordenarTallas, type EstadoFisico, type Region } from '../../shared/disfraces'
import { formatearSoles, hoyEnLima } from '../../shared/formato'
import {
  EVENTOS_SUGERIDOS,
  diasDeAlquiler,
  precioParaPedido,
  reajustarPorDias,
  totalDelPedido,
  type BorradorPedido,
  type ConceptoPago,
  type ConflictoUnidad,
  type EstadoPedido,
  type EstadoPendiente,
  type FichaPedido,
  type MedioPago,
  type ModeloDisponible,
  type OpcionAdelantoAlCancelar,
  type PendienteAbierto,
  type Rango,
  type ResultadoAsignacion,
  type ResumenPedido,
  type TipoGarantia,
  type UnidadParaPedido
} from '../../shared/pedidos'
import { ErrorDeNegocio } from '../errores'
import {
  asignarPorCantidad,
  describirMotivo,
  motivoNoDisponible,
  unidadesLibres,
  type Ocupacion,
  type UnidadConOcupaciones
} from '../logica/disponibilidad'
import {
  validarAdelantoTotal,
  validarCantidad,
  validarEvento,
  validarFechaLimite,
  validarFechas,
  validarGarantia,
  validarGradoSeccion,
  validarMedio,
  validarMontoPago,
  validarPrecioCobrado,
  validarTallaPedido
} from '../logica/pedidos'
import type { Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'
import { obtenerFichaCliente } from './clientes'
import { obtenerConfiguracion } from './configuracion'

type Db = Database.Database

// ---------- Lectura de unidades con sus ocupaciones ----------

interface UnidadDePedido extends UnidadConOcupaciones {
  modeloNombre: string
  modeloActivo: boolean
  precioModelo: number
}

/** Unidades (con el modelo y todos sus alquileres reservados o entregados), filtradas por SQL opcional. */
function leerUnidades(db: Db, where: string, params: unknown[]): UnidadDePedido[] {
  const filas = db
    .prepare(
      `SELECT u.id, u.codigo, u.modelo_id, u.talla, u.estado_fisico,
              m.nombre AS modelo_nombre, m.activo AS modelo_activo, m.precio_alquiler
       FROM unidades u JOIN modelos m ON m.id = u.modelo_id
       WHERE ${where}`
    )
    .all(...params) as {
    id: number
    codigo: string
    modelo_id: number
    talla: string
    estado_fisico: EstadoFisico
    modelo_nombre: string
    modelo_activo: number
    precio_alquiler: number
  }[]
  if (filas.length === 0) return []

  const ocupaciones = db
    .prepare(
      `SELECT d.unidad_id, a.id AS alquiler_id, a.estado, a.fecha_salida, a.fecha_devolucion_pactada, c.nombres
       FROM detalle_alquiler d
       JOIN alquileres a ON a.id = d.alquiler_id
       JOIN clientes c ON c.id = a.cliente_id
       WHERE a.estado IN ('reservado', 'entregado')
         AND d.unidad_id IN (${filas.map(() => '?').join(',')})`
    )
    .all(...filas.map((f) => f.id)) as {
    unidad_id: number
    alquiler_id: number
    estado: Ocupacion['estado']
    fecha_salida: string
    fecha_devolucion_pactada: string
    nombres: string
  }[]

  const porUnidad = new Map<number, Ocupacion[]>()
  for (const o of ocupaciones) {
    const lista = porUnidad.get(o.unidad_id) ?? []
    lista.push({
      alquilerId: o.alquiler_id,
      clienteNombre: o.nombres,
      estado: o.estado,
      fechaSalida: o.fecha_salida,
      fechaDevolucionPactada: o.fecha_devolucion_pactada
    })
    porUnidad.set(o.unidad_id, lista)
  }

  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    modeloId: f.modelo_id,
    talla: f.talla,
    estadoFisico: f.estado_fisico,
    modeloNombre: f.modelo_nombre,
    modeloActivo: f.modelo_activo === 1,
    precioModelo: f.precio_alquiler,
    ocupaciones: porUnidad.get(f.id) ?? []
  }))
}

interface Contexto {
  margen: number
  precioPorDia: boolean
  hoy: string
}

function contexto(db: Db, hoy: string): Contexto {
  const c = obtenerConfiguracion(db)
  return { margen: c.diasMargenLavado, precioPorDia: c.precioPorDia, hoy }
}

function paraPedido(u: UnidadDePedido, rango: Rango, ctx: Contexto): UnidadParaPedido {
  return {
    unidadId: u.id,
    codigo: u.codigo,
    modeloId: u.modeloId,
    modeloNombre: u.modeloNombre,
    talla: u.talla,
    estadoFisico: u.estadoFisico,
    precioSugerido: precioParaPedido(u.precioModelo, rango.inicio, rango.fin, ctx.precioPorDia)
  }
}

function validarRango(rango: Rango): void {
  if (!rango.inicio || !rango.fin || rango.fin < rango.inicio) {
    throw new ErrorDeNegocio('Elija primero las fechas de salida y devolución.')
  }
}

// ---------- Para armar el pedido ----------

/** Modelos activos con sus tallas y cuántas unidades hay libres en las fechas del pedido. */
export function catalogoParaPedido(
  db: Db,
  rango: Rango,
  excluirAlquilerId: number | null,
  hoy: string = hoyEnLima()
): ModeloDisponible[] {
  validarRango(rango)
  const ctx = contexto(db, hoy)
  const modelos = db
    .prepare('SELECT id, nombre, categoria, region, prefijo, precio_alquiler FROM modelos WHERE activo = 1 ORDER BY nombre')
    .all() as { id: number; nombre: string; categoria: string; region: Region | null; prefijo: string; precio_alquiler: number }[]
  const unidades = leerUnidades(db, "m.activo = 1 AND u.estado_fisico <> 'baja'", [])

  return modelos.map((m) => {
    const propias = unidades.filter((u) => u.modeloId === m.id)
    return {
      id: m.id,
      nombre: m.nombre,
      categoria: m.categoria,
      region: m.region,
      prefijo: m.prefijo,
      precioSugerido: precioParaPedido(m.precio_alquiler, rango.inicio, rango.fin, ctx.precioPorDia),
      tallas: ordenarTallas(propias.map((u) => u.talla)).map((talla) => ({
        talla,
        total: propias.filter((u) => mismaTalla(u.talla, talla)).length,
        libres: unidadesLibres(propias, talla, rango, ctx.margen, ctx.hoy, excluirAlquilerId).length
      }))
    }
  })
}

/** Unidades libres de un modelo y talla en las fechas, sin las que ya están en el carrito. */
export function unidadesLibresParaPedido(
  db: Db,
  modeloId: number,
  talla: string,
  rango: Rango,
  excluirAlquilerId: number | null,
  yaEnCarrito: number[],
  hoy: string = hoyEnLima()
): UnidadParaPedido[] {
  validarRango(rango)
  const ctx = contexto(db, hoy)
  const unidades = leerUnidades(db, 'u.modelo_id = ? AND m.activo = 1', [modeloId])
  const carrito = new Set(yaEnCarrito)
  return unidadesLibres(unidades, talla, rango, ctx.margen, ctx.hoy, excluirAlquilerId)
    .filter((u) => !carrito.has(u.id))
    .map((u) => paraPedido(u, rango, ctx))
}

/** Asignación automática por cantidad: las libres en orden de preferencia y cuántas faltan. */
export function asignarUnidades(
  db: Db,
  pedido: { modeloId: number; talla: string; cantidad: number; rango: Rango; excluirAlquilerId: number | null; yaEnCarrito: number[] },
  hoy: string = hoyEnLima()
): ResultadoAsignacion {
  validarCantidad(pedido.cantidad)
  validarRango(pedido.rango)
  const ctx = contexto(db, hoy)
  const unidades = leerUnidades(db, 'u.modelo_id = ? AND m.activo = 1', [pedido.modeloId])
  const libres = unidadesLibres(unidades, pedido.talla, pedido.rango, ctx.margen, ctx.hoy, pedido.excluirAlquilerId)
  const r = asignarPorCantidad(libres, pedido.cantidad, new Set(pedido.yaEnCarrito))
  return {
    asignadas: r.asignadas.map((u) => paraPedido(u, pedido.rango, ctx)),
    libres: libres.filter((u) => !pedido.yaEnCarrito.includes(u.id)).length,
    faltan: r.faltan
  }
}

/** Unidades del carrito que ya no están libres en estas fechas (por ejemplo, al cambiar las fechas). */
export function verificarUnidades(
  db: Db,
  unidadIds: number[],
  rango: Rango,
  excluirAlquilerId: number | null,
  hoy: string = hoyEnLima()
): ConflictoUnidad[] {
  if (unidadIds.length === 0) return []
  validarRango(rango)
  const ctx = contexto(db, hoy)
  const unidades = leerUnidades(db, `u.id IN (${unidadIds.map(() => '?').join(',')})`, unidadIds)
  const conflictos: ConflictoUnidad[] = []
  for (const u of unidades) {
    const motivo = motivoNoDisponible(u, rango, ctx.margen, ctx.hoy, excluirAlquilerId)
    if (motivo) conflictos.push({ unidadId: u.id, codigo: u.codigo, mensaje: describirMotivo(u.codigo, motivo, ctx.margen, ctx.hoy) })
  }
  return conflictos
}

export function eventosSugeridos(db: Db): string[] {
  const usados = (
    db.prepare("SELECT DISTINCT evento FROM alquileres WHERE evento <> '' ORDER BY evento").all() as { evento: string }[]
  ).map((f) => f.evento)
  const otros = usados.filter((e) => !EVENTOS_SUGERIDOS.some((s) => s.toLowerCase() === e.toLowerCase()))
  // "Otro" siempre al final
  return [...EVENTOS_SUGERIDOS.filter((e) => e !== 'Otro'), ...otros, 'Otro']
}

// ---------- Guardar (crear o editar) ----------

interface FilaAlquiler {
  id: number
  cliente_id: number
  fecha_reserva: string
  fecha_salida: string
  fecha_devolucion_pactada: string
  estado: EstadoPedido
  evento: string
  grado_seccion: string
  observaciones: string
  garantia_tipo: TipoGarantia | null
  garantia_monto: number
}

interface FilaDetalle {
  id: number
  unidad_id: number
  codigo: string
  precio_original: number
  precio_cobrado: number
  pendiente_id: number | null
}

interface FilaPendiente {
  id: number
  alquiler_id: number
  modelo_id: number
  talla: string
  cantidad: number
  cantidad_asignada: number
  precio_original: number
  precio_cobrado: number
  fecha_limite: string
  estado: EstadoPendiente
  observaciones: string
}

function filaAlquiler(db: Db, id: number): FilaAlquiler {
  const fila = db.prepare('SELECT * FROM alquileres WHERE id = ?').get(id) as FilaAlquiler | undefined
  if (!fila) throw new ErrorDeNegocio('No se encontró el pedido. Puede que la lista esté desactualizada.')
  return fila
}

function exigirReservado(p: FilaAlquiler, accion: string): void {
  if (p.estado === 'reservado') return
  const motivo = {
    entregado: 'ya fue entregado',
    devuelto: 'ya fue devuelto',
    cancelado: 'está cancelado'
  }[p.estado]
  throw new ErrorDeNegocio(`No se puede ${accion}: el pedido ${motivo}.`)
}

function detallesDe(db: Db, alquilerId: number): FilaDetalle[] {
  return db
    .prepare(
      `SELECT d.id, d.unidad_id, u.codigo, d.precio_original, d.precio_cobrado, d.pendiente_id
       FROM detalle_alquiler d JOIN unidades u ON u.id = d.unidad_id WHERE d.alquiler_id = ?`
    )
    .all(alquilerId) as FilaDetalle[]
}

function pendientesDe(db: Db, alquilerId: number): FilaPendiente[] {
  return db.prepare('SELECT * FROM pendientes_confeccion WHERE alquiler_id = ? ORDER BY id').all(alquilerId) as FilaPendiente[]
}

function adelantoNeto(db: Db, alquilerId: number): number {
  const f = db
    .prepare(
      `SELECT COALESCE(SUM(CASE concepto WHEN 'adelanto' THEN monto WHEN 'devolucion_adelanto' THEN -monto ELSE 0 END), 0) AS neto
       FROM pagos WHERE alquiler_id = ?`
    )
    .get(alquilerId) as { neto: number }
  return f.neto
}

function totalGuardado(db: Db, alquilerId: number): number {
  return totalDelPedido(
    detallesDe(db, alquilerId).map((d) => ({ precioCobrado: d.precio_cobrado })),
    pendientesDe(db, alquilerId).map((p) => ({
      cantidad: p.cantidad,
      cantidadAsignada: p.cantidad_asignada,
      precioCobrado: p.precio_cobrado
    }))
  )
}

/** Deshace la asignación de una unidad a su pendiente (al quitarla del pedido). */
function liberarDePendiente(db: Db, pendienteId: number): void {
  db.prepare(
    `UPDATE pendientes_confeccion
     SET cantidad_asignada = cantidad_asignada - 1,
         estado = CASE estado WHEN 'listo' THEN 'en_confeccion' ELSE estado END
     WHERE id = ?`
  ).run(pendienteId)
}

function guardarBorrador(db: Db, id: number | null, b: BorradorPedido, sesion: Sesion | null, hoy: string): number {
  const anterior = id === null ? null : filaAlquiler(db, id)
  if (anterior) exigirReservado(anterior, 'editar el pedido')

  validarFechas(b.fechaSalida, b.fechaDevolucionPactada, hoy, anterior?.fecha_salida ?? null)
  const rango: Rango = { inicio: b.fechaSalida, fin: b.fechaDevolucionPactada }
  const evento = validarEvento(b.evento)
  const gradoSeccion = validarGradoSeccion(b.gradoSeccion)
  const observaciones = b.observaciones.trim()
  if (observaciones.length > 500) throw new ErrorDeNegocio('Las observaciones son demasiado largas (máximo 500 letras).')
  const garantia = validarGarantia(b.garantiaTipo, b.garantiaMonto)
  const ctx = contexto(db, hoy)

  // Cliente
  const cliente = db.prepare('SELECT id, nombres, activo FROM clientes WHERE id = ?').get(b.clienteId) as
    | { id: number; nombres: string; activo: number }
    | undefined
  if (!cliente) throw new ErrorDeNegocio('Elija el cliente del pedido.')
  if (cliente.activo === 0 && cliente.id !== anterior?.cliente_id) {
    throw new ErrorDeNegocio(`${cliente.nombres} está desactivado. Reactívelo en Clientes para registrarle un pedido.`)
  }

  if (b.lineas.length === 0 && b.pendientes.length === 0) {
    throw new ErrorDeNegocio('Agregue al menos un disfraz al pedido.')
  }

  // Unidades: repetidas, existentes, activas y libres en las fechas
  const ids = b.lineas.map((l) => l.unidadId)
  const unidades = ids.length > 0 ? leerUnidades(db, `u.id IN (${ids.map(() => '?').join(',')})`, ids) : []
  const porId = new Map(unidades.map((u) => [u.id, u]))
  const vistos = new Set<number>()
  const detallesAntes = anterior ? detallesDe(db, anterior.id) : []
  const antesPorUnidad = new Map(detallesAntes.map((d) => [d.unidad_id, d]))
  const problemas: string[] = []

  for (const l of b.lineas) {
    const u = porId.get(l.unidadId)
    if (!u) throw new ErrorDeNegocio('Uno de los disfraces del pedido ya no existe. Vuelva a abrir el pedido.')
    if (vistos.has(u.id)) throw new ErrorDeNegocio(`${u.codigo} está dos veces en el pedido.`)
    vistos.add(u.id)
    validarPrecioCobrado(l.precioCobrado, u.codigo)
    if (!antesPorUnidad.has(u.id) && !u.modeloActivo) {
      problemas.push(`${u.codigo}: "${u.modeloNombre}" está dado de baja.`)
      continue
    }
    const motivo = motivoNoDisponible(u, rango, ctx.margen, ctx.hoy, anterior?.id ?? null)
    if (motivo) problemas.push(describirMotivo(u.codigo, motivo, ctx.margen, ctx.hoy))
  }
  if (problemas.length > 0) {
    const extra = problemas.length > 3 ? `\n(y ${problemas.length - 3} más)` : ''
    throw new ErrorDeNegocio(`${problemas.slice(0, 3).join('\n')}${extra}\nQuítelos del pedido o cambie las fechas.`)
  }

  // Pendientes de confección
  const pendientesAntes = anterior ? pendientesDe(db, anterior.id) : []
  const pendientesAntesPorId = new Map(pendientesAntes.map((p) => [p.id, p]))
  const pendientes = b.pendientes.map((p) => {
    const existente = p.id !== undefined ? pendientesAntesPorId.get(p.id) : undefined
    if (p.id !== undefined && !existente) {
      throw new ErrorDeNegocio('Uno de los pendientes de confección ya no existe. Vuelva a abrir el pedido.')
    }
    const modelo = db.prepare('SELECT id, nombre, activo, precio_alquiler FROM modelos WHERE id = ?').get(p.modeloId) as
      | { id: number; nombre: string; activo: number; precio_alquiler: number }
      | undefined
    if (!modelo) throw new ErrorDeNegocio('Uno de los disfraces por confeccionar ya no existe.')
    if (!existente && modelo.activo === 0) throw new ErrorDeNegocio(`"${modelo.nombre}" está dado de baja.`)
    const talla = existente ? existente.talla : validarTallaPedido(p.talla)
    const cantidad = validarCantidad(p.cantidad)
    if (existente && cantidad < existente.cantidad_asignada) {
      throw new ErrorDeNegocio(
        `Ya se asignaron ${existente.cantidad_asignada} unidades de ${modelo.nombre} talla ${talla}: la cantidad no puede ser menor.`
      )
    }
    if (!existente || existente.fecha_limite !== p.fechaLimite) {
      validarFechaLimite(p.fechaLimite, b.fechaSalida, hoy)
    } else if (p.fechaLimite > b.fechaSalida) {
      // Fecha límite que no cambió pero la salida se adelantó.
      throw new ErrorDeNegocio(
        `La fecha límite de confección de ${modelo.nombre} talla ${talla} quedó después de la nueva salida. Cámbiela.`
      )
    }
    validarPrecioCobrado(p.precioCobrado, `${modelo.nombre} talla ${talla}`)
    const observacionesP = p.observaciones.trim().slice(0, 300)
    return { existente, modelo, talla, cantidad, fechaLimite: p.fechaLimite, precioCobrado: p.precioCobrado, observaciones: observacionesP }
  })

  // Adelanto (solo al crear). Al editar, se compara el adelanto ya pagado con el total final más abajo.
  let adelanto: { monto: number; medio: MedioPago } | null = null
  if (!anterior && b.adelanto) {
    adelanto = { monto: validarMontoPago(b.adelanto.monto, 'del adelanto'), medio: validarMedio(b.adelanto.medio) }
    const total = totalDelPedido(
      b.lineas,
      pendientes.map((p) => ({ cantidad: p.cantidad, precioCobrado: p.precioCobrado }))
    )
    validarAdelantoTotal(adelanto.monto, total)
  }

  // ----- Guardar -----
  let pedidoId: number
  if (anterior) {
    pedidoId = anterior.id
    db.prepare(
      `UPDATE alquileres SET cliente_id = ?, fecha_salida = ?, fecha_devolucion_pactada = ?, evento = ?,
         grado_seccion = ?, observaciones = ?, garantia_tipo = ?, garantia_monto = ? WHERE id = ?`
    ).run(b.clienteId, b.fechaSalida, b.fechaDevolucionPactada, evento, gradoSeccion, observaciones, garantia.tipo, garantia.monto, pedidoId)
  } else {
    pedidoId = Number(
      db
        .prepare(
          `INSERT INTO alquileres (cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada, estado, evento,
             grado_seccion, observaciones, garantia_tipo, garantia_monto, usuario_id)
           VALUES (?, ?, ?, ?, 'reservado', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          b.clienteId,
          hoy,
          b.fechaSalida,
          b.fechaDevolucionPactada,
          evento,
          gradoSeccion,
          observaciones,
          garantia.tipo,
          garantia.monto,
          sesion?.usuarioId ?? null
        ).lastInsertRowid
    )
  }

  // Líneas: quitar (con constancia en auditoría), actualizar precios, agregar
  const diasAntes = anterior ? diasDeAlquiler(anterior.fecha_salida, anterior.fecha_devolucion_pactada) : 0
  const diasAhora = diasDeAlquiler(b.fechaSalida, b.fechaDevolucionPactada)
  for (const d of detallesAntes) {
    if (vistos.has(d.unidad_id)) continue
    db.prepare('DELETE FROM detalle_alquiler WHERE id = ?').run(d.id)
    if (d.pendiente_id !== null) liberarDePendiente(db, d.pendiente_id)
    registrarAuditoria(db, sesion, 'unidad_quitada_del_pedido', 'alquiler', pedidoId, {
      codigo: d.codigo,
      unidad_id: d.unidad_id,
      precio_original: d.precio_original,
      precio_cobrado: d.precio_cobrado,
      pendiente_id: d.pendiente_id
    })
  }
  const actualizarLinea = db.prepare('UPDATE detalle_alquiler SET precio_original = ?, precio_cobrado = ? WHERE id = ?')
  const insertarLinea = db.prepare(
    'INSERT INTO detalle_alquiler (alquiler_id, unidad_id, precio_original, precio_cobrado) VALUES (?, ?, ?, ?)'
  )
  for (const l of b.lineas) {
    const antes = antesPorUnidad.get(l.unidadId)
    if (antes) {
      const original = ctx.precioPorDia ? reajustarPorDias(antes.precio_original, diasAntes, diasAhora) : antes.precio_original
      actualizarLinea.run(original, l.precioCobrado, antes.id)
    } else {
      const u = porId.get(l.unidadId)!
      insertarLinea.run(pedidoId, u.id, precioParaPedido(u.precioModelo, rango.inicio, rango.fin, ctx.precioPorDia), l.precioCobrado)
    }
  }

  // Pendientes: quitar (solo si no tienen unidades asignadas), actualizar, agregar
  const enviados = new Set(pendientes.filter((p) => p.existente).map((p) => p.existente!.id))
  for (const p of pendientesAntes) {
    if (enviados.has(p.id)) continue
    const asignadas = (db.prepare('SELECT cantidad_asignada AS n FROM pendientes_confeccion WHERE id = ?').get(p.id) as { n: number }).n
    if (asignadas > 0) {
      throw new ErrorDeNegocio(
        `Ya se asignaron ${asignadas} unidades a un pendiente de confección. Quite primero esas unidades del pedido.`
      )
    }
    db.prepare('DELETE FROM pendientes_confeccion WHERE id = ?').run(p.id)
    registrarAuditoria(db, sesion, 'pendiente_quitado_del_pedido', 'alquiler', pedidoId, { ...p })
  }
  for (const p of pendientes) {
    if (p.existente) {
      const asignadas = (db.prepare('SELECT cantidad_asignada AS n FROM pendientes_confeccion WHERE id = ?').get(p.existente.id) as { n: number }).n
      if (p.cantidad < asignadas) {
        throw new ErrorDeNegocio(`Ya se asignaron ${asignadas} unidades de ${p.modelo.nombre} talla ${p.talla}: la cantidad no puede ser menor.`)
      }
      const original = ctx.precioPorDia
        ? reajustarPorDias(p.existente.precio_original, diasAntes, diasAhora)
        : p.existente.precio_original
      const estado: EstadoPendiente =
        p.cantidad === asignadas ? 'listo' : p.existente.estado === 'listo' ? 'en_confeccion' : p.existente.estado
      db.prepare(
        `UPDATE pendientes_confeccion SET cantidad = ?, fecha_limite = ?, precio_original = ?, precio_cobrado = ?,
           observaciones = ?, estado = ? WHERE id = ?`
      ).run(p.cantidad, p.fechaLimite, original, p.precioCobrado, p.observaciones, estado, p.existente.id)
    } else {
      db.prepare(
        `INSERT INTO pendientes_confeccion (alquiler_id, modelo_id, talla, cantidad, precio_original, precio_cobrado,
           fecha_limite, observaciones, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        pedidoId,
        p.modelo.id,
        p.talla,
        p.cantidad,
        precioParaPedido(p.modelo.precio_alquiler, rango.inicio, rango.fin, ctx.precioPorDia),
        p.precioCobrado,
        p.fechaLimite,
        p.observaciones,
        sesion?.usuarioId ?? null
      )
    }
  }

  if (adelanto) {
    db.prepare("INSERT INTO pagos (alquiler_id, monto, concepto, medio, usuario_id) VALUES (?, ?, 'adelanto', ?, ?)").run(
      pedidoId,
      adelanto.monto,
      adelanto.medio,
      sesion?.usuarioId ?? null
    )
  }

  // Si al editar el total bajó de lo ya pagado, se deshace todo (la transacción se revierte).
  const totalFinal = totalGuardado(db, pedidoId)
  if (anterior) validarAdelantoTotal(adelantoNeto(db, pedidoId), totalFinal)

  registrarAuditoria(db, sesion, anterior ? 'pedido_editado' : 'pedido_creado', 'alquiler', pedidoId, {
    cliente_id: b.clienteId,
    fecha_salida: b.fechaSalida,
    fecha_devolucion_pactada: b.fechaDevolucionPactada,
    evento,
    unidades: b.lineas.length,
    pendientes: pendientes.map((p) => ({ modelo_id: p.modelo.id, talla: p.talla, cantidad: p.cantidad })),
    total: totalFinal,
    adelanto: adelanto?.monto ?? 0
  })
  return pedidoId
}

/** Crea una reserva. Todo se valida de nuevo aquí, justo antes de guardar. */
export function crearPedido(db: Db, borrador: BorradorPedido, sesion: Sesion | null, hoy: string = hoyEnLima()): number {
  return db.transaction(() => guardarBorrador(db, null, borrador, sesion, hoy)).immediate()
}

/** Edita una reserva (solo si está reservada). */
export function actualizarPedido(
  db: Db,
  id: number,
  borrador: BorradorPedido,
  sesion: Sesion | null,
  hoy: string = hoyEnLima()
): void {
  db.transaction(() => guardarBorrador(db, id, borrador, sesion, hoy)).immediate()
}

// ---------- Pagos y cancelación ----------

export function registrarAdelanto(db: Db, id: number, monto: number, medio: MedioPago, sesion: Sesion | null): void {
  validarMontoPago(monto, 'del adelanto')
  validarMedio(medio)
  db.transaction(() => {
    const p = filaAlquiler(db, id)
    exigirReservado(p, 'registrar un adelanto')
    const total = totalGuardado(db, id)
    const neto = adelantoNeto(db, id)
    if (neto + monto > total) {
      throw new ErrorDeNegocio(
        `Con este adelanto se pagaría ${formatearSoles(neto + monto)}, más que el total del pedido (${formatearSoles(total)}). ` +
          `El saldo pendiente es ${formatearSoles(total - neto)}.`
      )
    }
    db.prepare("INSERT INTO pagos (alquiler_id, monto, concepto, medio, usuario_id) VALUES (?, ?, 'adelanto', ?, ?)").run(
      id,
      monto,
      medio,
      sesion?.usuarioId ?? null
    )
    registrarAuditoria(db, sesion, 'adelanto_registrado', 'alquiler', id, { monto, medio })
  }).immediate()
}

/**
 * Cancela una reserva y libera sus unidades. Con el adelanto se puede: devolverlo todo,
 * devolver una parte o retenerlo (lo retenido cuenta como ingreso en los reportes).
 */
export function cancelarPedido(db: Db, id: number, opcion: OpcionAdelantoAlCancelar, sesion: Sesion | null): void {
  db.transaction(() => {
    const p = filaAlquiler(db, id)
    if (p.estado === 'entregado') {
      throw new ErrorDeNegocio('Este pedido ya se entregó: no se puede cancelar. Registre la devolución de los disfraces.')
    }
    exigirReservado(p, 'cancelar el pedido')
    const neto = adelantoNeto(db, id)
    let devuelto = 0
    let medio: MedioPago | null = null
    if (neto > 0) {
      if (opcion.tipo === 'devolver_todo') {
        devuelto = neto
        medio = validarMedio(opcion.medio)
      } else if (opcion.tipo === 'devolver_parte') {
        devuelto = validarMontoPago(opcion.monto, 'a devolver')
        medio = validarMedio(opcion.medio)
        if (devuelto > neto) {
          throw new ErrorDeNegocio(`No se puede devolver ${formatearSoles(devuelto)}: el adelanto pagado es ${formatearSoles(neto)}.`)
        }
      }
    }
    if (devuelto > 0) {
      db.prepare(
        "INSERT INTO pagos (alquiler_id, monto, concepto, medio, usuario_id) VALUES (?, ?, 'devolucion_adelanto', ?, ?)"
      ).run(id, devuelto, medio, sesion?.usuarioId ?? null)
    }
    db.prepare("UPDATE alquileres SET estado = 'cancelado' WHERE id = ?").run(id)
    registrarAuditoria(db, sesion, 'pedido_cancelado', 'alquiler', id, {
      adelanto_pagado: neto,
      devuelto,
      retenido: neto - devuelto,
      medio
    })
  }).immediate()
}

// ---------- Pendientes de confección ----------

function filaPendiente(db: Db, id: number): FilaPendiente {
  const fila = db.prepare('SELECT * FROM pendientes_confeccion WHERE id = ?').get(id) as FilaPendiente | undefined
  if (!fila) throw new ErrorDeNegocio('No se encontró el pendiente de confección.')
  return fila
}

/** Marcar "por confeccionar" o "en confección". "Listo" se marca solo al asignar la última unidad. */
export function cambiarEstadoPendiente(
  db: Db,
  id: number,
  estado: 'pendiente' | 'en_confeccion',
  sesion: Sesion | null
): void {
  if (estado !== 'pendiente' && estado !== 'en_confeccion') {
    throw new ErrorDeNegocio('Un pendiente queda listo solo cuando se le asignan todas sus unidades.')
  }
  db.transaction(() => {
    const p = filaPendiente(db, id)
    exigirReservado(filaAlquiler(db, p.alquiler_id), 'cambiar el pendiente')
    if (p.estado === 'listo') throw new ErrorDeNegocio('Este pendiente ya está listo: todas sus unidades fueron asignadas.')
    db.prepare('UPDATE pendientes_confeccion SET estado = ? WHERE id = ?').run(estado, id)
    registrarAuditoria(db, sesion, 'pendiente_estado_cambiado', 'pendiente', id, { anterior: p.estado, nuevo: estado })
  })()
}

/**
 * Asigna unidades a un pendiente de confección. Con `unidadIds` null elige solas las libres
 * (modelo y talla del pendiente, libres en las fechas del pedido). Devuelve los códigos asignados.
 */
export function asignarAPendiente(
  db: Db,
  pendienteId: number,
  unidadIds: number[] | null,
  sesion: Sesion | null,
  hoy: string = hoyEnLima()
): string[] {
  return db.transaction(() => {
    const pend = filaPendiente(db, pendienteId)
    const pedido = filaAlquiler(db, pend.alquiler_id)
    exigirReservado(pedido, 'asignar unidades')
    const faltan = pend.cantidad - pend.cantidad_asignada
    if (faltan <= 0) throw new ErrorDeNegocio('Este pendiente ya tiene todas sus unidades asignadas.')

    const ctx = contexto(db, hoy)
    const rango: Rango = { inicio: pedido.fecha_salida, fin: pedido.fecha_devolucion_pactada }
    const enPedido = new Set(detallesDe(db, pedido.id).map((d) => d.unidad_id))
    const modelo = db.prepare('SELECT nombre FROM modelos WHERE id = ?').get(pend.modelo_id) as { nombre: string }
    const descripcion = `${modelo.nombre} talla ${pend.talla}`

    let elegidas: UnidadDePedido[]
    if (unidadIds === null) {
      const unidades = leerUnidades(db, 'u.modelo_id = ?', [pend.modelo_id])
      const libres = unidadesLibres(unidades, pend.talla, rango, ctx.margen, ctx.hoy, pedido.id).filter((u) => !enPedido.has(u.id))
      elegidas = libres.slice(0, faltan)
      if (elegidas.length === 0) {
        throw new ErrorDeNegocio(
          `No hay unidades libres de ${descripcion} para las fechas de este pedido. Agregue las nuevas unidades en Disfraces y vuelva a intentarlo.`
        )
      }
    } else {
      if (unidadIds.length === 0) throw new ErrorDeNegocio('Elija las unidades a asignar.')
      if (new Set(unidadIds).size !== unidadIds.length) throw new ErrorDeNegocio('Hay unidades repetidas en la lista.')
      if (unidadIds.length > faltan) {
        throw new ErrorDeNegocio(`A este pendiente solo le ${faltan === 1 ? 'falta 1 unidad' : `faltan ${faltan} unidades`}.`)
      }
      elegidas = leerUnidades(db, `u.id IN (${unidadIds.map(() => '?').join(',')})`, unidadIds)
      if (elegidas.length !== unidadIds.length) throw new ErrorDeNegocio('Una de las unidades ya no existe.')
      for (const u of elegidas) {
        if (u.modeloId !== pend.modelo_id || !mismaTalla(u.talla, pend.talla)) {
          throw new ErrorDeNegocio(`${u.codigo} no es ${descripcion}.`)
        }
        if (enPedido.has(u.id)) throw new ErrorDeNegocio(`${u.codigo} ya está en este pedido.`)
        const motivo = motivoNoDisponible(u, rango, ctx.margen, ctx.hoy, pedido.id)
        if (motivo) throw new ErrorDeNegocio(describirMotivo(u.codigo, motivo, ctx.margen, ctx.hoy))
      }
    }

    const insertar = db.prepare(
      'INSERT INTO detalle_alquiler (alquiler_id, unidad_id, precio_original, precio_cobrado, pendiente_id) VALUES (?, ?, ?, ?, ?)'
    )
    for (const u of elegidas) insertar.run(pedido.id, u.id, pend.precio_original, pend.precio_cobrado, pend.id)
    const asignada = pend.cantidad_asignada + elegidas.length
    db.prepare('UPDATE pendientes_confeccion SET cantidad_asignada = ?, estado = ? WHERE id = ?').run(
      asignada,
      asignada === pend.cantidad ? 'listo' : pend.estado === 'listo' ? 'en_confeccion' : pend.estado,
      pend.id
    )
    const codigos = elegidas.map((u) => u.codigo)
    registrarAuditoria(db, sesion, 'pendiente_asignado', 'pendiente', pend.id, { alquiler_id: pedido.id, codigos })
    return codigos
  }).immediate()
}

/** Pendientes sin terminar de un modelo y talla (para ofrecer asignar unidades nuevas desde Disfraces). */
export function pendientesAbiertos(db: Db, modeloId: number, talla: string): PendienteAbierto[] {
  const filas = db
    .prepare(
      `SELECT p.id, p.alquiler_id, p.talla, p.cantidad, p.cantidad_asignada, p.fecha_limite,
              a.evento, a.fecha_salida, c.nombres
       FROM pendientes_confeccion p
       JOIN alquileres a ON a.id = p.alquiler_id
       JOIN clientes c ON c.id = a.cliente_id
       WHERE p.modelo_id = ? AND p.estado <> 'listo' AND a.estado = 'reservado'
       ORDER BY p.fecha_limite, p.id`
    )
    .all(modeloId) as {
    id: number
    alquiler_id: number
    talla: string
    cantidad: number
    cantidad_asignada: number
    fecha_limite: string
    evento: string
    fecha_salida: string
    nombres: string
  }[]
  return filas
    .filter((f) => mismaTalla(f.talla, talla))
    .map((f) => ({
      id: f.id,
      pedidoId: f.alquiler_id,
      clienteNombre: f.nombres,
      evento: f.evento,
      fechaSalida: f.fecha_salida,
      fechaLimite: f.fecha_limite,
      faltan: f.cantidad - f.cantidad_asignada
    }))
}

// ---------- Lectura de pedidos ----------

export function obtenerPedido(db: Db, id: number): FichaPedido {
  const p = filaAlquiler(db, id)
  const cliente = obtenerFichaCliente(db, p.cliente_id)
  const lineas = db
    .prepare(
      `SELECT d.id, d.unidad_id, u.codigo, u.modelo_id, m.nombre AS modelo_nombre, u.talla, u.estado_fisico,
              d.precio_original, d.precio_cobrado, d.pendiente_id
       FROM detalle_alquiler d JOIN unidades u ON u.id = d.unidad_id JOIN modelos m ON m.id = u.modelo_id
       WHERE d.alquiler_id = ?`
    )
    .all(id) as {
    id: number
    unidad_id: number
    codigo: string
    modelo_id: number
    modelo_nombre: string
    talla: string
    estado_fisico: EstadoFisico
    precio_original: number
    precio_cobrado: number
    pendiente_id: number | null
  }[]
  const pendientes = db
    .prepare(
      `SELECT p.*, m.nombre AS modelo_nombre FROM pendientes_confeccion p JOIN modelos m ON m.id = p.modelo_id
       WHERE p.alquiler_id = ? ORDER BY p.fecha_limite, p.id`
    )
    .all(id) as (FilaPendiente & { modelo_nombre: string })[]
  const pagos = db
    .prepare('SELECT id, fecha, monto, concepto, medio FROM pagos WHERE alquiler_id = ? ORDER BY fecha, id')
    .all(id) as { id: number; fecha: string; monto: number; concepto: ConceptoPago; medio: MedioPago }[]

  const total = totalGuardado(db, id)
  const neto = adelantoNeto(db, id)
  return {
    id: p.id,
    cliente: {
      id: cliente.id,
      nombres: cliente.nombres,
      tipo: cliente.tipo,
      telefono: cliente.telefono,
      responsable: cliente.responsable,
      dniResponsable: cliente.dniResponsable,
      conAntecedentes: cliente.conAntecedentes
    },
    fechaReserva: p.fecha_reserva,
    fechaSalida: p.fecha_salida,
    fechaDevolucionPactada: p.fecha_devolucion_pactada,
    estado: p.estado,
    evento: p.evento,
    gradoSeccion: p.grado_seccion,
    observaciones: p.observaciones,
    garantiaTipo: p.garantia_tipo,
    garantiaMonto: p.garantia_monto,
    lineas: lineas
      .map((l) => ({
        detalleId: l.id,
        unidadId: l.unidad_id,
        codigo: l.codigo,
        modeloId: l.modelo_id,
        modeloNombre: l.modelo_nombre,
        talla: normalizarTalla(l.talla),
        estadoFisico: l.estado_fisico,
        precioOriginal: l.precio_original,
        precioCobrado: l.precio_cobrado,
        pendienteId: l.pendiente_id
      }))
      .sort((a, b) => a.modeloNombre.localeCompare(b.modeloNombre, 'es') || a.codigo.localeCompare(b.codigo, 'es')),
    pendientes: pendientes.map((x) => ({
      id: x.id,
      modeloId: x.modelo_id,
      modeloNombre: x.modelo_nombre,
      talla: x.talla,
      cantidad: x.cantidad,
      cantidadAsignada: x.cantidad_asignada,
      fechaLimite: x.fecha_limite,
      estado: x.estado,
      precioOriginal: x.precio_original,
      precioCobrado: x.precio_cobrado,
      observaciones: x.observaciones
    })),
    pagos,
    totales: { total, adelantoNeto: neto, saldo: total - neto }
  }
}

export function listarPedidos(db: Db): ResumenPedido[] {
  const filas = db
    .prepare(
      `SELECT a.id, a.cliente_id, c.nombres, c.tipo, a.evento, a.grado_seccion, a.fecha_salida,
              a.fecha_devolucion_pactada, a.estado,
              (SELECT COUNT(*) FROM detalle_alquiler d WHERE d.alquiler_id = a.id) AS unidades,
              (SELECT COALESCE(SUM(d.precio_cobrado), 0) FROM detalle_alquiler d WHERE d.alquiler_id = a.id) AS total_lineas,
              (SELECT COALESCE(SUM(p.cantidad - p.cantidad_asignada), 0) FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS por_confeccionar,
              (SELECT COALESCE(SUM((p.cantidad - p.cantidad_asignada) * p.precio_cobrado), 0)
                 FROM pendientes_confeccion p WHERE p.alquiler_id = a.id) AS total_pendientes,
              (SELECT GROUP_CONCAT(u.codigo, ' ') FROM detalle_alquiler d JOIN unidades u ON u.id = d.unidad_id
                 WHERE d.alquiler_id = a.id) AS codigos
       FROM alquileres a JOIN clientes c ON c.id = a.cliente_id
       ORDER BY a.fecha_salida DESC, a.id DESC`
    )
    .all() as {
    id: number
    cliente_id: number
    nombres: string
    tipo: ResumenPedido['clienteTipo']
    evento: string
    grado_seccion: string
    fecha_salida: string
    fecha_devolucion_pactada: string
    estado: EstadoPedido
    unidades: number
    total_lineas: number
    por_confeccionar: number
    total_pendientes: number
    codigos: string | null
  }[]
  return filas.map((f) => ({
    id: f.id,
    clienteId: f.cliente_id,
    clienteNombre: f.nombres,
    clienteTipo: f.tipo,
    evento: f.evento,
    gradoSeccion: f.grado_seccion,
    fechaSalida: f.fecha_salida,
    fechaDevolucionPactada: f.fecha_devolucion_pactada,
    estado: f.estado,
    unidades: f.unidades,
    porConfeccionar: f.estado === 'cancelado' ? 0 : f.por_confeccionar,
    total: f.total_lineas + f.total_pendientes,
    codigos: f.codigos ? f.codigos.split(' ') : []
  }))
}
