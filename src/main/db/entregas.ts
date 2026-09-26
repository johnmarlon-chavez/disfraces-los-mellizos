import type Database from 'better-sqlite3'
import type {
  CargoPrevisto,
  DatosDevolucion,
  DatosEntrega,
  DatosLiquidacion,
  PrevisualizacionDevolucion,
  ResultadoDevolucion,
  ResultadoEntrega
} from '../../shared/entregas'
import type { EstadoFisico } from '../../shared/disfraces'
import { esFechaValida } from '../../shared/fechas'
import { formatearFecha, formatearSoles, hoyEnLima } from '../../shared/formato'
import type { MedioPago } from '../../shared/pedidos'
import { ErrorDeNegocio } from '../errores'
import { describirMotivo, motivoNoDisponible } from '../logica/disponibilidad'
import { calcularDeuda, planLiquidacion, repartirPagoDeDeuda } from '../logica/liquidacion'
import { calcularMora } from '../logica/mora'
import { validarMedio, validarMontoPago } from '../logica/pedidos'
import { exigirDuena, type AutorizacionDuena, type Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'
import { obtenerConfiguracion } from './configuracion'
import { estadoCuenta } from './cuentas'
import {
  adelantoNeto,
  contexto,
  filaAlquiler,
  leerUnidades,
  liberarDePendiente,
  totalGuardado,
  type FilaAlquiler
} from './pedidos'

type Db = Database.Database

interface FilaLinea {
  id: number
  unidad_id: number
  codigo: string
  estado_fisico: EstadoFisico
  observaciones_unidad: string
  fecha_entrega_real: string | null
  fecha_devolucion_real: string | null
  pendiente_id: number | null
}

function lineasDe(db: Db, alquilerId: number): FilaLinea[] {
  return db
    .prepare(
      `SELECT d.id, d.unidad_id, u.codigo, u.estado_fisico, u.observaciones AS observaciones_unidad,
              d.fecha_entrega_real, d.fecha_devolucion_real, d.pendiente_id
       FROM detalle_alquiler d JOIN unidades u ON u.id = d.unidad_id
       WHERE d.alquiler_id = ? ORDER BY u.codigo`
    )
    .all(alquilerId) as FilaLinea[]
}

function porConfeccionar(db: Db, alquilerId: number): number {
  return (
    db
      .prepare('SELECT COALESCE(SUM(cantidad - cantidad_asignada), 0) AS n FROM pendientes_confeccion WHERE alquiler_id = ?')
      .get(alquilerId) as { n: number }
  ).n
}

function pagar(
  db: Db,
  alquilerId: number,
  concepto: string,
  monto: number,
  medio: MedioPago,
  sesion: Sesion | null,
  desdeGarantia = false
): void {
  if (monto <= 0) return
  db.prepare(
    'INSERT INTO pagos (alquiler_id, monto, concepto, medio, usuario_id, desde_garantia) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(alquilerId, monto, concepto, medio, sesion?.usuarioId ?? null, desdeGarantia ? 1 : 0)
}

const CONCEPTO_PAGO = { saldo: 'saldo', danos: 'dano', mora: 'mora' } as const

function exigirEntregado(p: FilaAlquiler, accion: string): void {
  if (p.estado === 'entregado') return
  const motivo = { reservado: 'todavía no se entregó', devuelto: 'ya fue devuelto', cancelado: 'está cancelado' }[p.estado]
  throw new ErrorDeNegocio(`No se puede ${accion}: el pedido ${motivo}.`)
}

function validarDocumentoPrenda(documento: string): string {
  const limpio = documento.replace(/[\s.-]/g, '').toUpperCase()
  if (!/^[A-Z0-9]{6,12}$/.test(limpio)) {
    throw new ErrorDeNegocio('Escriba el número del documento que queda en prenda (por ejemplo, el DNI de 8 dígitos).')
  }
  return limpio
}

// ---------- Entrega ----------

/**
 * Entrega unidades del pedido. La primera entrega cobra el saldo y registra la garantía;
 * las siguientes (por ejemplo, las que se confeccionaron después) solo marcan las unidades.
 */
export function entregar(
  db: Db,
  id: number,
  datos: DatosEntrega,
  sesion: Sesion | null,
  autorizacion: AutorizacionDuena | null = null,
  hoy: string = hoyEnLima()
): ResultadoEntrega {
  return db.transaction((): ResultadoEntrega => {
    const p = filaAlquiler(db, id)
    if (p.estado !== 'reservado' && p.estado !== 'entregado') {
      throw new ErrorDeNegocio(
        `No se puede entregar: el pedido ${p.estado === 'devuelto' ? 'ya fue devuelto' : 'está cancelado'}.`
      )
    }
    const primera = p.estado === 'reservado'
    const lineas = lineasDe(db, id)
    const porId = new Map(lineas.map((l) => [l.id, l]))

    if (datos.detalleIds.length === 0) throw new ErrorDeNegocio('Elija los disfraces que se entregan.')
    if (new Set(datos.detalleIds).size !== datos.detalleIds.length) throw new ErrorDeNegocio('Hay disfraces repetidos en la lista.')
    const elegidas = datos.detalleIds.map((d) => {
      const l = porId.get(d)
      if (!l) throw new ErrorDeNegocio('Uno de los disfraces no pertenece a este pedido. Vuelva a abrirlo.')
      if (l.fecha_entrega_real) throw new ErrorDeNegocio(`${l.codigo} ya se entregó el ${formatearFecha(l.fecha_entrega_real)}.`)
      return l
    })

    const ctx = contexto(db, hoy)
    if (primera) {
      // Salida: desde la fecha pactada; antes, solo adelantándola (se verifica la disponibilidad).
      if (p.fecha_salida > hoy) {
        if (!datos.adelantarSalida) {
          throw new ErrorDeNegocio(
            `La salida de este pedido es el ${formatearFecha(p.fecha_salida)}. Para entregarlo hoy use "Entregar hoy (adelantar la salida)".`
          )
        }
        const unidades = leerUnidades(db, `u.id IN (${lineas.map(() => '?').join(',')})`, lineas.map((l) => l.unidad_id))
        const problemas = unidades
          .map((u) => ({ u, m: motivoNoDisponible(u, { inicio: hoy, fin: p.fecha_devolucion_pactada }, ctx.margen, hoy, id) }))
          .filter((x) => x.m)
          .map((x) => describirMotivo(x.u.codigo, x.m!, ctx.margen, hoy))
        if (problemas.length > 0) {
          throw new ErrorDeNegocio(`No se puede adelantar la salida a hoy:\n${problemas.slice(0, 3).join('\n')}`)
        }
        db.prepare('UPDATE alquileres SET fecha_salida = ? WHERE id = ?').run(hoy, id)
        registrarAuditoria(db, sesion, 'salida_adelantada', 'alquiler', id, { anterior: p.fecha_salida, nueva: hoy })
      }

      // Con unidades por confeccionar, solo la dueña autoriza entregar lo que hay.
      if (porConfeccionar(db, id) > 0) {
        exigirDuena(sesion, 'entregar un pedido con disfraces por confeccionar', autorizacion)
      }

      // Garantía
      if (!datos.garantia) throw new ErrorDeNegocio('Registre la garantía: efectivo o documento en prenda.')
      const g = datos.garantia
      let documento: string | null = null
      if (g.tipo === 'efectivo') {
        validarMontoPago(g.monto, 'de la garantía')
        validarMedio(g.medio)
      } else if (g.tipo === 'dni') {
        documento = validarDocumentoPrenda(g.documento)
      } else {
        throw new ErrorDeNegocio('Elija el tipo de garantía: efectivo o DNI en prenda.')
      }

      // Saldo: completo, salvo autorización de la dueña (queda como deuda del pedido).
      const saldo = totalGuardado(db, id) - adelantoNeto(db, id)
      for (const x of datos.pagos) {
        validarMontoPago(x.monto, 'del pago')
        validarMedio(x.medio)
      }
      const pagado = datos.pagos.reduce((s, x) => s + x.monto, 0)
      if (pagado > saldo) {
        throw new ErrorDeNegocio(`Se está cobrando ${formatearSoles(pagado)}, más que el saldo (${formatearSoles(saldo)}).`)
      }
      if (pagado < saldo) {
        if (!datos.saldoPendienteAutorizado) {
          throw new ErrorDeNegocio(
            `Falta cobrar ${formatearSoles(saldo - pagado)} del saldo. Solo con autorización de la dueña se entrega con saldo pendiente.`
          )
        }
        exigirDuena(sesion, 'entregar con saldo pendiente', autorizacion)
      }
      for (const x of datos.pagos) pagar(db, id, 'saldo', x.monto, x.medio, sesion)
      if (g.tipo === 'efectivo') pagar(db, id, 'garantia_recibida', g.monto, g.medio, sesion)

      db.prepare(
        `UPDATE alquileres SET estado = 'entregado', entregado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           garantia_tipo = ?, garantia_monto = ?, garantia_documento = ? WHERE id = ?`
      ).run(g.tipo, g.tipo === 'efectivo' ? g.monto : 0, documento, id)
    }

    // Unidades: presentes y en condiciones de salir
    const unidades = leerUnidades(db, `u.id IN (${elegidas.map(() => '?').join(',')})`, elegidas.map((l) => l.unidad_id))
    const unidadPorId = new Map(unidades.map((u) => [u.id, u]))
    const enLavanderia: string[] = []
    for (const l of elegidas) {
      const u = unidadPorId.get(l.unidad_id)!
      if (u.estadoFisico === 'reparacion' || u.estadoFisico === 'baja') {
        throw new ErrorDeNegocio(`${l.codigo} está ${u.estadoFisico === 'reparacion' ? 'en reparación' : 'dado de baja'}: no se puede entregar.`)
      }
      const fuera = u.ocupaciones.find((o) => o.estado === 'entregado' && o.alquilerId !== id)
      if (fuera) {
        throw new ErrorDeNegocio(
          `${l.codigo} todavía no vuelve del pedido N.° ${fuera.alquilerId} (${fuera.clienteNombre}). ` +
            (primera ? 'Cámbiela por otra libre antes de entregar.' : 'Entréguela cuando vuelva.')
        )
      }
      if (u.estadoFisico === 'lavanderia') enLavanderia.push(l.codigo)
    }
    if (enLavanderia.length > 0 && !datos.lavanderiaConfirmada) {
      throw new ErrorDeNegocio(`${enLavanderia.join(', ')} figura${enLavanderia.length === 1 ? '' : 'n'} en lavandería. Confirme que ya está limpio.`)
    }

    const marcar = db.prepare('UPDATE detalle_alquiler SET fecha_entrega_real = ?, entregado_por = ? WHERE id = ?')
    const aDisponible = db.prepare("UPDATE unidades SET estado_fisico = 'disponible' WHERE id = ? AND estado_fisico = 'lavanderia'")
    for (const l of elegidas) {
      marcar.run(hoy, sesion?.usuarioId ?? null, l.id)
      aDisponible.run(l.unidad_id)
    }

    const faltanEntregar = lineas.filter((l) => !l.fecha_entrega_real).length - elegidas.length + porConfeccionar(db, id)
    const codigos = elegidas.map((l) => l.codigo)
    registrarAuditoria(db, sesion, 'entrega', 'alquiler', id, {
      codigos,
      primera,
      faltan_entregar: faltanEntregar,
      lavanderia_confirmada: enLavanderia,
      pagos: primera ? datos.pagos : [],
      saldo_pendiente_autorizado: primera && datos.saldoPendienteAutorizado
    })
    return { entregadas: codigos, faltanEntregar }
  }).immediate()
}

// ---------- Devolución por unidad ----------

function aplicarDevolucion(
  db: Db,
  id: number,
  datos: DatosDevolucion,
  sesion: Sesion | null,
  hoy: string
): { cargos: CargoPrevisto[]; resultado: ResultadoDevolucion } {
  const p = filaAlquiler(db, id)
  exigirEntregado(p, 'registrar la devolución')
  if (!esFechaValida(datos.fecha)) throw new ErrorDeNegocio('Elija la fecha de devolución.')
  if (datos.fecha > hoy) throw new ErrorDeNegocio('La fecha de devolución no puede ser futura.')
  if (datos.unidades.length === 0) throw new ErrorDeNegocio('Elija los disfraces que se devuelven.')
  if (new Set(datos.unidades.map((u) => u.detalleId)).size !== datos.unidades.length) {
    throw new ErrorDeNegocio('Hay disfraces repetidos en la lista.')
  }

  const lineas = lineasDe(db, id)
  const porId = new Map(lineas.map((l) => [l.id, l]))
  const config = obtenerConfiguracion(db)
  const cargos: CargoPrevisto[] = []
  const nuevas: { unidadId: number; codigo: string; fechaDevolucion: string }[] = []

  const insertarCargo = db.prepare(
    `INSERT INTO cargos (alquiler_id, unidad_id, pieza_id, tipo, monto, monto_original, descripcion, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const cargo = (tipo: CargoPrevisto['tipo'], unidadId: number | null, codigo: string | null, piezaId: number | null, monto: number, descripcion: string): void => {
    insertarCargo.run(id, unidadId, piezaId, tipo, monto, monto, descripcion, sesion?.usuarioId ?? null)
    cargos.push({ tipo, codigo, monto, descripcion })
  }

  for (const d of datos.unidades) {
    const l = porId.get(d.detalleId)
    if (!l) throw new ErrorDeNegocio('Uno de los disfraces no pertenece a este pedido. Vuelva a abrirlo.')
    if (!l.fecha_entrega_real) throw new ErrorDeNegocio(`${l.codigo} todavía no se entregó.`)
    if (l.fecha_devolucion_real) throw new ErrorDeNegocio(`${l.codigo} ya se devolvió el ${formatearFecha(l.fecha_devolucion_real)}.`)
    if (datos.fecha < l.fecha_entrega_real) {
      throw new ErrorDeNegocio(`${l.codigo} se entregó el ${formatearFecha(l.fecha_entrega_real)}: la devolución no puede ser antes.`)
    }
    if (d.destino !== 'lavanderia' && d.destino !== 'reparacion') throw new ErrorDeNegocio('Elija si va a lavandería o a reparación.')

    // Piezas faltantes
    const faltantes: string[] = []
    for (const f of d.piezasFaltantes) {
      const pieza = db.prepare('SELECT id, nombre, costo_reposicion FROM piezas WHERE id = ? AND unidad_id = ? AND activo = 1').get(f.piezaId, l.unidad_id) as
        | { id: number; nombre: string; costo_reposicion: number }
        | undefined
      if (!pieza) throw new ErrorDeNegocio(`Una de las piezas marcadas no es de ${l.codigo}.`)
      if (!Number.isSafeInteger(f.monto) || f.monto < 0) throw new ErrorDeNegocio(`El monto de la pieza "${pieza.nombre}" no es válido.`)
      faltantes.push(pieza.nombre)
      if (f.monto > 0) cargo('pieza_faltante', l.unidad_id, l.codigo, pieza.id, f.monto, `${l.codigo}: falta ${pieza.nombre}`)
    }

    // Daño
    if (d.dano) {
      validarMontoPago(d.dano.monto, 'del daño')
      const descripcion = d.dano.descripcion.trim()
      if (!descripcion) throw new ErrorDeNegocio(`Describa el daño de ${l.codigo}.`)
      cargo('dano', l.unidad_id, l.codigo, null, d.dano.monto, `${l.codigo}: ${descripcion}`)
    }

    const estadoDevolucion =
      d.dano && faltantes.length > 0 ? 'con_danos_y_faltantes' : d.dano ? 'con_danos' : faltantes.length > 0 ? 'con_faltantes' : 'bien'
    db.prepare(
      'UPDATE detalle_alquiler SET fecha_devolucion_real = ?, recibido_por = ?, estado_devolucion = ?, observaciones = ? WHERE id = ?'
    ).run(datos.fecha, sesion?.usuarioId ?? null, estadoDevolucion, d.observaciones.trim().slice(0, 300), l.id)

    // La unidad pasa a lavandería o reparación; las piezas que faltan quedan anotadas en ella.
    const nota = faltantes.length > 0 ? `Falta: ${faltantes.join(', ')} (pedido N.° ${id}, ${formatearFecha(datos.fecha)})` : ''
    const observaciones = nota ? [l.observaciones_unidad, nota].filter(Boolean).join(' · ').slice(0, 500) : l.observaciones_unidad
    db.prepare('UPDATE unidades SET estado_fisico = ?, observaciones = ? WHERE id = ?').run(d.destino, observaciones, l.unidad_id)

    nuevas.push({ unidadId: l.unidad_id, codigo: l.codigo, fechaDevolucion: datos.fecha })
  }

  // Mora, según el modo configurado
  const devueltasAntes = lineas.filter((l) => l.fecha_devolucion_real).map((l) => ({ fechaDevolucion: l.fecha_devolucion_real! }))
  for (const m of calcularMora(config.modoMora, config.moraPorDia, p.fecha_devolucion_pactada, devueltasAntes, nuevas)) {
    const codigo = m.unidadId === null ? null : (nuevas.find((n) => n.unidadId === m.unidadId)?.codigo ?? null)
    cargo('mora', m.unidadId, codigo, null, m.monto, m.descripcion)
  }

  const faltanDevolver = lineas.filter((l) => l.fecha_entrega_real && !l.fecha_devolucion_real).length - datos.unidades.length
  const faltanEntregar = lineas.filter((l) => !l.fecha_entrega_real).length + porConfeccionar(db, id)
  registrarAuditoria(db, sesion, 'devolucion', 'alquiler', id, {
    fecha: datos.fecha,
    codigos: nuevas.map((n) => n.codigo),
    cargos,
    faltan_devolver: faltanDevolver
  })
  return {
    cargos,
    resultado: {
      devueltas: nuevas.map((n) => n.codigo),
      faltanDevolver,
      listoParaLiquidar: faltanDevolver === 0 && faltanEntregar === 0
    }
  }
}

export function devolver(
  db: Db,
  id: number,
  datos: DatosDevolucion,
  sesion: Sesion | null,
  hoy: string = hoyEnLima()
): ResultadoDevolucion {
  return db.transaction(() => aplicarDevolucion(db, id, datos, sesion, hoy).resultado).immediate()
}

class Previsualizado extends Error {
  constructor(readonly resultado: PrevisualizacionDevolucion) {
    super('previsualización')
  }
}

/**
 * Muestra exactamente lo que haría la devolución (cargos, mora y liquidación) sin guardar nada:
 * la aplica dentro de una transacción y la deshace.
 */
export function previsualizarDevolucion(
  db: Db,
  id: number,
  datos: DatosDevolucion,
  hoy: string = hoyEnLima()
): PrevisualizacionDevolucion {
  try {
    db.transaction(() => {
      const { cargos, resultado } = aplicarDevolucion(db, id, datos, null, hoy)
      throw new Previsualizado({
        cargos,
        completa: resultado.listoParaLiquidar,
        faltanDevolver: resultado.faltanDevolver,
        plan: resultado.listoParaLiquidar ? planLiquidacion(estadoCuenta(db, id)) : null
      })
    })()
  } catch (e) {
    if (e instanceof Previsualizado) return e.resultado
    throw e
  }
  throw new Error('La previsualización no devolvió resultado')
}

// ---------- Liquidación y deuda ----------

/**
 * Cierra el pedido cuando ya no queda nada por entregar ni por devolver: descuenta la deuda
 * de la garantía (saldo, daños, mora), devuelve lo que sobra y registra lo que el cliente paga.
 * Si queda deuda, el pedido se cierra igual ("Debe S/ X") y el DNI en prenda se retiene.
 */
export function liquidar(db: Db, id: number, datos: DatosLiquidacion, sesion: Sesion | null): void {
  validarMedio(datos.medioDevolucion)
  db.transaction(() => {
    const p = filaAlquiler(db, id)
    exigirEntregado(p, 'liquidar el pedido')
    const lineas = lineasDe(db, id)
    if (lineas.some((l) => !l.fecha_entrega_real) || porConfeccionar(db, id) > 0) {
      throw new ErrorDeNegocio('Todavía hay disfraces por entregar. Entréguelos o, si ya no se entregarán, cancele lo que falta.')
    }
    if (lineas.some((l) => !l.fecha_devolucion_real)) throw new ErrorDeNegocio('Todavía hay disfraces por devolver.')

    const plan = planLiquidacion(estadoCuenta(db, id))
    const medioGarantia =
      ((db.prepare("SELECT medio FROM pagos WHERE alquiler_id = ? AND concepto = 'garantia_recibida' ORDER BY id LIMIT 1").get(id) as
        | { medio: MedioPago }
        | undefined)?.medio) ?? 'efectivo'

    for (const k of ['saldo', 'danos', 'mora'] as const) {
      pagar(db, id, CONCEPTO_PAGO[k], plan.retener[k], medioGarantia, sesion, true)
    }
    pagar(db, id, 'garantia_devuelta', plan.devolverGarantia, datos.medioDevolucion, sesion)
    pagar(db, id, 'devolucion_adelanto', plan.aFavor, datos.medioDevolucion, sesion)

    let cobrado = 0
    for (const c of datos.cobros) {
      validarMontoPago(c.monto, 'cobrado')
      validarMedio(c.medio)
      const faltante = calcularDeuda(estadoCuenta(db, id))
      const reparto = repartirPagoDeDeuda(c.monto, faltante)
      for (const k of ['saldo', 'danos', 'mora'] as const) pagar(db, id, CONCEPTO_PAGO[k], reparto[k], c.medio, sesion)
      cobrado += c.monto
    }

    const deudaFinal = calcularDeuda(estadoCuenta(db, id)).total
    const garantiaCerrada = p.garantia_tipo === 'efectivo' || (p.garantia_tipo === 'dni' && deudaFinal === 0) || p.garantia_tipo === null
    const ultima = lineas.reduce((m, l) => (l.fecha_devolucion_real! > m ? l.fecha_devolucion_real! : m), lineas[0]?.fecha_devolucion_real ?? p.fecha_devolucion_pactada)
    db.prepare("UPDATE alquileres SET estado = 'devuelto', fecha_devolucion_real = ?, garantia_devuelta = ? WHERE id = ?").run(
      ultima,
      garantiaCerrada ? 1 : 0,
      id
    )
    registrarAuditoria(db, sesion, 'pedido_liquidado', 'alquiler', id, { plan, cobrado, deuda_final: deudaFinal })
  }).immediate()
}

/** Pago de lo que el cliente debe (saldo pendiente autorizado o deuda al cerrar), en orden saldo, daños, mora. */
export function registrarPagoDeuda(db: Db, id: number, monto: number, medio: MedioPago, sesion: Sesion | null): void {
  validarMedio(medio)
  db.transaction(() => {
    const p = filaAlquiler(db, id)
    if (p.estado !== 'entregado' && p.estado !== 'devuelto') throw new ErrorDeNegocio('Este pedido no tiene deuda que cobrar.')
    const deuda = calcularDeuda(estadoCuenta(db, id))
    if (deuda.total === 0) throw new ErrorDeNegocio('Este pedido no tiene deuda pendiente.')
    const reparto = repartirPagoDeDeuda(monto, deuda)
    for (const k of ['saldo', 'danos', 'mora'] as const) pagar(db, id, CONCEPTO_PAGO[k], reparto[k], medio, sesion)
    registrarAuditoria(db, sesion, 'pago_deuda', 'alquiler', id, { monto, medio, reparto })
  }).immediate()
}

/** El DNI en prenda se devuelve cuando el cliente ya no debe nada. */
export function devolverDocumento(db: Db, id: number, sesion: Sesion | null): void {
  db.transaction(() => {
    const p = filaAlquiler(db, id)
    if (p.garantia_tipo !== 'dni' || p.garantia_devuelta === 1) throw new ErrorDeNegocio('No hay documento en prenda por devolver.')
    if (p.estado !== 'devuelto') throw new ErrorDeNegocio('El documento se devuelve al cerrar el pedido.')
    const deuda = calcularDeuda(estadoCuenta(db, id)).total
    if (deuda > 0) throw new ErrorDeNegocio(`El cliente todavía debe ${formatearSoles(deuda)}: el documento se retiene hasta que pague.`)
    db.prepare('UPDATE alquileres SET garantia_devuelta = 1 WHERE id = ?').run(id)
    registrarAuditoria(db, sesion, 'documento_devuelto', 'alquiler', id, { documento: p.garantia_documento })
  })()
}

/** Solo la dueña rebaja o perdona la mora, con motivo obligatorio. */
export function rebajarMora(
  db: Db,
  cargoId: number,
  nuevoMonto: number,
  motivo: string,
  sesion: Sesion | null,
  autorizacion: AutorizacionDuena | null = null
): void {
  const razon = motivo.trim()
  if (razon.length < 5) throw new ErrorDeNegocio('Escriba el motivo de la rebaja (queda registrado).')
  if (!Number.isSafeInteger(nuevoMonto) || nuevoMonto < 0) throw new ErrorDeNegocio('El nuevo monto no es válido.')
  exigirDuena(sesion, 'rebajar o perdonar la mora', autorizacion)
  db.transaction(() => {
    const c = db.prepare('SELECT id, alquiler_id, tipo, monto, monto_original FROM cargos WHERE id = ?').get(cargoId) as
      | { id: number; alquiler_id: number; tipo: string; monto: number; monto_original: number }
      | undefined
    if (!c) throw new ErrorDeNegocio('No se encontró el cargo.')
    if (c.tipo !== 'mora') throw new ErrorDeNegocio('Solo se puede rebajar la mora.')
    if (nuevoMonto >= c.monto) throw new ErrorDeNegocio(`El nuevo monto debe ser menor que ${formatearSoles(c.monto)}.`)
    const cuenta = estadoCuenta(db, c.alquiler_id)
    if (cuenta.cargosMora - (c.monto - nuevoMonto) < cuenta.pagadoMora) {
      throw new ErrorDeNegocio(`Ya se cobraron ${formatearSoles(cuenta.pagadoMora)} de mora: no se puede rebajar por debajo de eso.`)
    }
    db.prepare('UPDATE cargos SET monto = ?, motivo_rebaja = ? WHERE id = ?').run(nuevoMonto, razon, cargoId)
    registrarAuditoria(db, sesion, nuevoMonto === 0 ? 'mora_perdonada' : 'mora_rebajada', 'cargo', cargoId, {
      alquiler_id: c.alquiler_id,
      anterior: c.monto,
      nuevo: nuevoMonto,
      motivo: razon
    })
  }).immediate()
}

/**
 * La dueña cierra lo que no se llegó a entregar (por ejemplo, la confección no estuvo a tiempo):
 * se quitan las unidades sin entregar y lo que faltaba confeccionar, con constancia en auditoría.
 * El total baja; si el cliente pagó de más, se le devuelve al liquidar.
 */
export function cancelarLoQueFalta(db: Db, id: number, sesion: Sesion | null, autorizacion: AutorizacionDuena | null = null): void {
  exigirDuena(sesion, 'cancelar los disfraces que no se entregaron', autorizacion)
  db.transaction(() => {
    const p = filaAlquiler(db, id)
    exigirEntregado(p, 'cancelar lo que falta')
    const sinEntregar = lineasDe(db, id).filter((l) => !l.fecha_entrega_real)
    for (const l of sinEntregar) {
      db.prepare('DELETE FROM detalle_alquiler WHERE id = ?').run(l.id)
      if (l.pendiente_id !== null) liberarDePendiente(db, l.pendiente_id)
      registrarAuditoria(db, sesion, 'unidad_quitada_del_pedido', 'alquiler', id, { codigo: l.codigo, unidad_id: l.unidad_id, motivo: 'no se entregó' })
    }
    const pendientes = db.prepare('SELECT * FROM pendientes_confeccion WHERE alquiler_id = ?').all(id) as {
      id: number
      cantidad: number
      cantidad_asignada: number
    }[]
    for (const x of pendientes) {
      if (x.cantidad_asignada === x.cantidad) continue
      if (x.cantidad_asignada === 0) {
        db.prepare('DELETE FROM pendientes_confeccion WHERE id = ?').run(x.id)
      } else {
        db.prepare("UPDATE pendientes_confeccion SET cantidad = cantidad_asignada, estado = 'listo' WHERE id = ?").run(x.id)
      }
      registrarAuditoria(db, sesion, 'pendiente_quitado_del_pedido', 'alquiler', id, { ...x, motivo: 'no se entregó' })
    }
    if (lineasDe(db, id).length === 0) {
      throw new ErrorDeNegocio('No se entregó ningún disfraz de este pedido: cancele el pedido en lugar de esto.')
    }
  }).immediate()
}

/** Pasa a "disponible" las unidades de este pedido que ya volvieron y siguen en lavandería. */
export function liberarUnidades(db: Db, id: number, sesion: Sesion | null): string[] {
  return db.transaction(() => {
    filaAlquiler(db, id)
    const filas = db
      .prepare(
        `SELECT u.id, u.codigo FROM detalle_alquiler d JOIN unidades u ON u.id = d.unidad_id
         WHERE d.alquiler_id = ? AND d.fecha_devolucion_real IS NOT NULL AND u.estado_fisico = 'lavanderia'
         ORDER BY u.codigo`
      )
      .all(id) as { id: number; codigo: string }[]
    const actualizar = db.prepare("UPDATE unidades SET estado_fisico = 'disponible' WHERE id = ?")
    for (const f of filas) actualizar.run(f.id)
    if (filas.length > 0) registrarAuditoria(db, sesion, 'unidades_liberadas', 'alquiler', id, { codigos: filas.map((f) => f.codigo) })
    return filas.map((f) => f.codigo)
  })()
}
