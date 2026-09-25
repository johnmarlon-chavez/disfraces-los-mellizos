import type Database from 'better-sqlite3'
import {
  DISTRITOS_TRUJILLO,
  SIGLA_DOCUMENTO,
  tieneAntecedentes,
  type AlquilerDeCliente,
  type ColegioParecido,
  type DatosCliente,
  type FichaCliente,
  type HistorialCliente,
  type ResumenCliente,
  type TipoCliente,
  type TipoDocumento
} from '../../shared/clientes'
import { normalizarTexto } from '../../shared/disfraces'
import { formatearFecha } from '../../shared/formato'
import { ErrorDeNegocio } from '../errores'
import {
  esMismoColegio,
  sonColegiosParecidos,
  validarCliente,
  validarDocumento,
  type ClienteValidado
} from '../logica/clientes'
import type { Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'

type Db = Database.Database

interface FilaCliente {
  id: number
  tipo: TipoCliente
  tipo_documento: TipoDocumento | null
  numero_documento: string | null
  nombres: string
  responsable: string
  dni_responsable: string | null
  distrito: string
  ruc: string | null
  telefono: string
  direccion: string
  observaciones: string
  activo: number
  alquileres_totales: number
  devoluciones_tardias: number
  cargos_por_danos: number
  monto_cargos_por_danos: number
}

// Historial calculado en la misma consulta. Una devolución es tardía si la fecha real
// es posterior a la pactada. (La fase 5 lo ajustará para devoluciones por unidad.)
const SQL_CLIENTES = `
  SELECT c.*,
    (SELECT COUNT(*) FROM alquileres a WHERE a.cliente_id = c.id AND a.estado <> 'cancelado') AS alquileres_totales,
    (SELECT COUNT(*) FROM alquileres a
      WHERE a.cliente_id = c.id AND a.fecha_devolucion_real IS NOT NULL
        AND a.fecha_devolucion_real > a.fecha_devolucion_pactada) AS devoluciones_tardias,
    (SELECT COUNT(*) FROM cargos g JOIN alquileres a ON a.id = g.alquiler_id
      WHERE a.cliente_id = c.id AND g.tipo IN ('dano', 'pieza_faltante')) AS cargos_por_danos,
    (SELECT COALESCE(SUM(g.monto), 0) FROM cargos g JOIN alquileres a ON a.id = g.alquiler_id
      WHERE a.cliente_id = c.id AND g.tipo IN ('dano', 'pieza_faltante')) AS monto_cargos_por_danos
  FROM clientes c`

function historialDe(f: FilaCliente): HistorialCliente {
  return {
    alquileresTotales: f.alquileres_totales,
    devolucionesTardias: f.devoluciones_tardias,
    cargosPorDanos: f.cargos_por_danos,
    montoCargosPorDanos: f.monto_cargos_por_danos
  }
}

function resumenDe(f: FilaCliente): ResumenCliente {
  return {
    id: f.id,
    tipo: f.tipo,
    tipoDocumento: f.tipo_documento,
    numeroDocumento: f.numero_documento,
    nombres: f.nombres,
    responsable: f.responsable,
    dniResponsable: f.dni_responsable,
    distrito: f.distrito,
    ruc: f.ruc,
    telefono: f.telefono,
    activo: f.activo === 1,
    conAntecedentes: tieneAntecedentes(historialDe(f))
  }
}

function filaCliente(db: Db, id: number): FilaCliente {
  const fila = db.prepare(`${SQL_CLIENTES} WHERE c.id = ?`).get(id) as FilaCliente | undefined
  if (!fila) throw new ErrorDeNegocio('No se encontró el cliente. Puede que la lista esté desactualizada.')
  return fila
}

// ---------- Lectura ----------

export function listarClientes(db: Db): ResumenCliente[] {
  return (db.prepare(`${SQL_CLIENTES} ORDER BY c.nombres`).all() as FilaCliente[]).map(resumenDe)
}

export function obtenerFichaCliente(db: Db, id: number): FichaCliente {
  const f = filaCliente(db, id)
  const alquileres = db
    .prepare(
      `SELECT a.id, a.fecha_salida, a.fecha_devolucion_pactada, a.fecha_devolucion_real, a.estado,
              (SELECT COUNT(*) FROM detalle_alquiler d WHERE d.alquiler_id = a.id) AS unidades
       FROM alquileres a WHERE a.cliente_id = ? ORDER BY a.fecha_salida DESC, a.id DESC`
    )
    .all(id) as {
    id: number
    fecha_salida: string
    fecha_devolucion_pactada: string
    fecha_devolucion_real: string | null
    estado: AlquilerDeCliente['estado']
    unidades: number
  }[]

  return {
    ...resumenDe(f),
    direccion: f.direccion,
    observaciones: f.observaciones,
    historial: historialDe(f),
    alquileres: alquileres.map((a) => ({
      id: a.id,
      fechaSalida: a.fecha_salida,
      fechaDevolucionPactada: a.fecha_devolucion_pactada,
      fechaDevolucionReal: a.fecha_devolucion_real,
      estado: a.estado,
      unidades: a.unidades
    }))
  }
}

/** Distritos de Trujillo más los ya usados en colegios, sin repetir. */
export function listarDistritos(db: Db): string[] {
  const usados = (
    db.prepare("SELECT DISTINCT distrito FROM clientes WHERE distrito <> ''").all() as { distrito: string }[]
  ).map((f) => f.distrito)
  const todos = new Map<string, string>()
  for (const d of [...DISTRITOS_TRUJILLO, ...usados]) {
    const clave = normalizarTexto(d)
    if (!todos.has(clave)) todos.set(clave, d)
  }
  return [...todos.values()].sort((a, b) => a.localeCompare(b, 'es'))
}

/** Cliente con ese documento (para avisar antes de guardar). */
export function buscarPorDocumento(
  db: Db,
  tipo: TipoDocumento,
  numero: string
): { id: number; nombres: string } | null {
  let limpio: string
  try {
    limpio = validarDocumento(tipo, numero)
  } catch {
    return null
  }
  return (
    (db
      .prepare('SELECT id, nombres FROM clientes WHERE tipo_documento = ? AND numero_documento = ?')
      .get(tipo, limpio) as { id: number; nombres: string } | undefined) ?? null
  )
}

/** Colegios con nombre parecido (en cualquier distrito). `mismo` = mismo nombre y mismo distrito. */
export function buscarColegiosParecidos(
  db: Db,
  nombre: string,
  distrito: string,
  excluirId: number | null
): ColegioParecido[] {
  if (!nombre.trim()) return []
  const colegios = db
    .prepare("SELECT id, nombres, distrito, activo FROM clientes WHERE tipo = 'colegio' AND id IS NOT ?")
    .all(excluirId) as { id: number; nombres: string; distrito: string; activo: number }[]
  return colegios
    .filter((c) => sonColegiosParecidos(nombre, c.nombres))
    .map((c) => ({
      id: c.id,
      nombres: c.nombres,
      distrito: c.distrito,
      activo: c.activo === 1,
      mismo: esMismoColegio({ nombres: nombre, distrito }, c)
    }))
    .sort((a, b) => Number(b.mismo) - Number(a.mismo) || a.nombres.localeCompare(b.nombres, 'es'))
}

// ---------- Escritura ----------

function evitarDuplicados(db: Db, c: ClienteValidado, excluirId: number | null): void {
  if (c.tipo === 'persona') {
    const otro = db
      .prepare('SELECT nombres FROM clientes WHERE tipo_documento = ? AND numero_documento = ? AND id IS NOT ?')
      .get(c.tipoDocumento, c.numeroDocumento, excluirId) as { nombres: string } | undefined
    if (otro) {
      throw new ErrorDeNegocio(
        `Ya existe un cliente con ${SIGLA_DOCUMENTO[c.tipoDocumento!]} ${c.numeroDocumento}: ${otro.nombres}.`
      )
    }
    return
  }
  const mismo = buscarColegiosParecidos(db, c.nombres, c.distrito, excluirId).find((p) => p.mismo)
  if (mismo) throw new ErrorDeNegocio(`Ya existe «${mismo.nombres}» en ${mismo.distrito}. Use ese colegio.`)
}

const COLUMNAS = `tipo, tipo_documento, numero_documento, nombres, responsable, dni_responsable,
  distrito, ruc, telefono, direccion, observaciones`

function valores(c: ClienteValidado): unknown[] {
  return [
    c.tipo,
    c.tipoDocumento,
    c.numeroDocumento,
    c.nombres,
    c.responsable,
    c.dniResponsable,
    c.distrito,
    c.ruc,
    c.telefono,
    c.direccion,
    c.observaciones
  ]
}

export function crearCliente(db: Db, datos: DatosCliente, sesion: Sesion | null): number {
  const c = validarCliente(datos)
  return db.transaction(() => {
    evitarDuplicados(db, c, null)
    const id = Number(
      db.prepare(`INSERT INTO clientes (${COLUMNAS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...valores(c))
        .lastInsertRowid
    )
    registrarAuditoria(db, sesion, 'cliente_creado', 'cliente', id, { ...c })
    return id
  })()
}

/** Edita los datos del cliente. El tipo (persona o colegio) no se cambia. */
export function actualizarCliente(db: Db, id: number, datos: DatosCliente, sesion: Sesion | null): void {
  const c = validarCliente(datos)
  db.transaction(() => {
    const anterior = filaCliente(db, id)
    if (anterior.tipo !== c.tipo) {
      throw new ErrorDeNegocio('No se puede cambiar un cliente de persona a colegio (ni al revés). Registre uno nuevo.')
    }
    evitarDuplicados(db, c, id)
    db.prepare(
      `UPDATE clientes SET tipo_documento = ?, numero_documento = ?, nombres = ?, responsable = ?,
         dni_responsable = ?, distrito = ?, ruc = ?, telefono = ?, direccion = ?, observaciones = ?
       WHERE id = ?`
    ).run(...valores(c).slice(1), id)
    registrarAuditoria(db, sesion, 'cliente_editado', 'cliente', id, {
      antes: resumenDe(anterior),
      despues: { ...c }
    })
  })()
}

export function desactivarCliente(db: Db, id: number, sesion: Sesion | null): void {
  db.transaction(() => {
    const c = filaCliente(db, id)
    if (c.activo === 0) throw new ErrorDeNegocio(`${c.nombres} ya está desactivado.`)
    const pendiente = db
      .prepare(
        `SELECT estado, fecha_salida, fecha_devolucion_pactada FROM alquileres
         WHERE cliente_id = ? AND estado IN ('reservado', 'entregado')
         ORDER BY estado = 'entregado' DESC, fecha_salida LIMIT 1`
      )
      .get(id) as { estado: string; fecha_salida: string; fecha_devolucion_pactada: string } | undefined
    if (pendiente) {
      const detalle =
        pendiente.estado === 'entregado'
          ? `tiene disfraces alquilados que deben volver el ${formatearFecha(pendiente.fecha_devolucion_pactada)}`
          : `tiene una reserva con salida el ${formatearFecha(pendiente.fecha_salida)}`
      throw new ErrorDeNegocio(`${c.nombres} ${detalle}. No se puede desactivar.`)
    }
    db.prepare('UPDATE clientes SET activo = 0 WHERE id = ?').run(id)
    registrarAuditoria(db, sesion, 'cliente_desactivado', 'cliente', id, {})
  })()
}

export function reactivarCliente(db: Db, id: number, sesion: Sesion | null): void {
  db.transaction(() => {
    const c = filaCliente(db, id)
    if (c.activo === 1) throw new ErrorDeNegocio(`${c.nombres} ya está activo.`)
    db.prepare('UPDATE clientes SET activo = 1 WHERE id = ?').run(id)
    registrarAuditoria(db, sesion, 'cliente_reactivado', 'cliente', id, {})
  })()
}
