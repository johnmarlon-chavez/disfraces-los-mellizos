import type Database from 'better-sqlite3'
import type {
  DatosModelo,
  DatosUnidad,
  EstadoFisico,
  FichaModelo,
  Region,
  NuevasUnidades,
  NuevoModelo,
  PiezaDatos,
  ResumenModelo,
  Unidad
} from '../../shared/disfraces'
import { ordenarUnidades } from '../../shared/disfraces'
import { formatearFecha } from '../../shared/formato'
import { ErrorDeNegocio } from '../errores'
import {
  cambioChocaConReserva,
  cambioRequiereDuena,
  generarPrefijo,
  siguientesCodigos,
  validarCambioEstado,
  validarCategoria,
  validarCodigosNuevos,
  validarDescripcion,
  validarNombreModelo,
  validarPiezas,
  validarPrecio,
  validarPrefijo,
  validarRegion,
  validarTalla
} from '../logica/disfraces'
import { exigirDuena, type Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'

type Db = Database.Database

interface FilaModelo {
  id: number
  nombre: string
  categoria: string
  region: Region | null
  descripcion: string
  precio_alquiler: number
  foto: string | null
  activo: number
  prefijo: string
}

interface FilaUnidad {
  id: number
  modelo_id: number
  codigo: string
  talla: string
  estado_fisico: EstadoFisico
  observaciones: string
  alquilada: number
}

// Una unidad está "alquilada" si está en un alquiler entregado (fuera de la tienda).
const SQL_UNIDADES = `
  SELECT u.id, u.modelo_id, u.codigo, u.talla, u.estado_fisico, u.observaciones,
         EXISTS (SELECT 1 FROM detalle_alquiler d JOIN alquileres a ON a.id = d.alquiler_id
                 WHERE d.unidad_id = u.id AND a.estado = 'entregado') AS alquilada
  FROM unidades u`

function filaModelo(db: Db, id: number): FilaModelo {
  const fila = db.prepare('SELECT * FROM modelos WHERE id = ?').get(id) as FilaModelo | undefined
  if (!fila) throw new ErrorDeNegocio('No se encontró el disfraz. Puede que la lista esté desactualizada.')
  return fila
}

function filaUnidad(db: Db, id: number): FilaUnidad {
  const fila = db.prepare(`${SQL_UNIDADES} WHERE u.id = ?`).get(id) as FilaUnidad | undefined
  if (!fila) throw new ErrorDeNegocio('No se encontró la unidad. Puede que la lista esté desactualizada.')
  return fila
}

function evitarNombreRepetido(db: Db, nombre: string, excluirId: number | null): void {
  const otro = db
    .prepare('SELECT id FROM modelos WHERE nombre = ? COLLATE NOCASE AND activo = 1 AND id IS NOT ?')
    .get(nombre, excluirId)
  if (otro) throw new ErrorDeNegocio(`Ya existe un disfraz llamado "${nombre}".`)
}

interface AlquilerPendiente {
  codigo: string
  estado: 'reservado' | 'entregado'
  fecha_salida: string
  fecha_devolucion_pactada: string
}

/** Primer alquiler reservado o entregado de las unidades indicadas. */
function alquilerPendiente(db: Db, unidadIds: number[]): AlquilerPendiente | undefined {
  if (unidadIds.length === 0) return undefined
  return db
    .prepare(
      `SELECT u.codigo, a.estado, a.fecha_salida, a.fecha_devolucion_pactada
       FROM detalle_alquiler d
       JOIN alquileres a ON a.id = d.alquiler_id
       JOIN unidades u ON u.id = d.unidad_id
       WHERE d.unidad_id IN (${unidadIds.map(() => '?').join(',')})
         AND a.estado IN ('reservado', 'entregado')
       ORDER BY a.estado = 'entregado' DESC, a.fecha_salida
       LIMIT 1`
    )
    .get(...unidadIds) as AlquilerPendiente | undefined
}

// ---------- Lectura ----------

export function listarModelos(db: Db): ResumenModelo[] {
  const modelos = db.prepare('SELECT * FROM modelos ORDER BY nombre').all() as FilaModelo[]
  const unidades = db.prepare(`${SQL_UNIDADES} ORDER BY u.codigo`).all() as FilaUnidad[]
  const porModelo = new Map<number, FilaUnidad[]>()
  for (const u of unidades) porModelo.set(u.modelo_id, [...(porModelo.get(u.modelo_id) ?? []), u])

  return modelos.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    categoria: m.categoria,
    region: m.region,
    precioAlquiler: m.precio_alquiler,
    foto: m.foto,
    activo: m.activo === 1,
    unidades: ordenarUnidades(porModelo.get(m.id) ?? []).map((u) => ({
      codigo: u.codigo,
      talla: u.talla,
      estadoFisico: u.estado_fisico,
      alquilada: u.alquilada === 1
    }))
  }))
}

export function obtenerFicha(db: Db, id: number): FichaModelo {
  const m = filaModelo(db, id)
  const unidades = db.prepare(`${SQL_UNIDADES} WHERE u.modelo_id = ? ORDER BY u.codigo`).all(id) as FilaUnidad[]
  const piezas = db
    .prepare(
      `SELECT p.id, p.unidad_id, p.nombre, p.costo_reposicion FROM piezas p
       JOIN unidades u ON u.id = p.unidad_id
       WHERE u.modelo_id = ? AND p.activo = 1 ORDER BY p.id`
    )
    .all(id) as { id: number; unidad_id: number; nombre: string; costo_reposicion: number }[]

  return {
    id: m.id,
    nombre: m.nombre,
    categoria: m.categoria,
    region: m.region,
    descripcion: m.descripcion,
    precioAlquiler: m.precio_alquiler,
    foto: m.foto,
    activo: m.activo === 1,
    prefijo: m.prefijo,
    unidades: ordenarUnidades(unidades).map(
      (u): Unidad => ({
        id: u.id,
        codigo: u.codigo,
        talla: u.talla,
        estadoFisico: u.estado_fisico,
        observaciones: u.observaciones,
        alquilada: u.alquilada === 1,
        piezas: piezas
          .filter((p) => p.unidad_id === u.id)
          .map((p) => ({ id: p.id, nombre: p.nombre, costoReposicion: p.costo_reposicion }))
      })
    )
  }
}

export function listarCategorias(db: Db): string[] {
  return (
    db.prepare('SELECT DISTINCT categoria FROM modelos ORDER BY categoria COLLATE NOCASE').all() as {
      categoria: string
    }[]
  ).map((f) => f.categoria)
}

/** Piezas de la unidad más reciente del modelo que no está de baja, para copiarlas a unidades nuevas. */
export function piezasSugeridas(db: Db, modeloId: number): PiezaDatos[] {
  const unidad = db
    .prepare("SELECT id FROM unidades WHERE modelo_id = ? AND estado_fisico <> 'baja' ORDER BY id DESC LIMIT 1")
    .get(modeloId) as { id: number } | undefined
  if (!unidad) return []
  return (
    db
      .prepare('SELECT nombre, costo_reposicion FROM piezas WHERE unidad_id = ? AND activo = 1 ORDER BY id')
      .all(unidad.id) as { nombre: string; costo_reposicion: number }[]
  ).map((p) => ({ nombre: p.nombre, costoReposicion: p.costo_reposicion }))
}

function prefijosUsados(db: Db, excluirId: number | null = null): string[] {
  return (
    db.prepare('SELECT prefijo FROM modelos WHERE id IS NOT ?').all(excluirId) as { prefijo: string }[]
  ).map((f) => f.prefijo)
}

/** Prefijo sugerido para un disfraz nuevo a partir de su nombre (la usuaria puede cambiarlo). */
export function sugerirPrefijo(db: Db, nombre: string): string {
  return generarPrefijo(nombre, prefijosUsados(db))
}

function evitarPrefijoRepetido(db: Db, prefijo: string, excluirId: number | null): void {
  const otro = db
    .prepare('SELECT nombre FROM modelos WHERE prefijo = ? COLLATE NOCASE AND id IS NOT ?')
    .get(prefijo, excluirId) as { nombre: string } | undefined
  if (otro) throw new ErrorDeNegocio(`El prefijo ${prefijo} ya lo usa «${otro.nombre}». Elija otro.`)
}

export function sugerirCodigos(db: Db, modeloId: number, cantidad: number): string[] {
  const { prefijo } = filaModelo(db, modeloId)
  const n = Math.max(0, Math.min(50, Math.floor(cantidad)))
  const existentes = (
    db.prepare('SELECT codigo FROM unidades WHERE codigo LIKE ?').all(`${prefijo}-%`) as { codigo: string }[]
  ).map((f) => f.codigo)
  return siguientesCodigos(prefijo, existentes, n)
}

// ---------- Modelos ----------

export function crearModelo(db: Db, datos: NuevoModelo, sesion: Sesion | null): number {
  const nombre = validarNombreModelo(datos.nombre)
  const categoria = validarCategoria(datos.categoria)
  const descripcion = validarDescripcion(datos.descripcion)
  const precio = validarPrecio(datos.precioAlquiler)
  const region = validarRegion(datos.region)
  const prefijoElegido = datos.prefijo?.trim() ? validarPrefijo(datos.prefijo) : null

  return db.transaction(() => {
    evitarNombreRepetido(db, nombre, null)
    if (prefijoElegido) evitarPrefijoRepetido(db, prefijoElegido, null)
    const prefijo = prefijoElegido ?? generarPrefijo(nombre, prefijosUsados(db))
    const id = Number(
      db
        .prepare(
          'INSERT INTO modelos (nombre, categoria, region, descripcion, precio_alquiler, prefijo) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(nombre, categoria, region, descripcion, precio, prefijo).lastInsertRowid
    )
    registrarAuditoria(db, sesion, 'modelo_creado', 'modelo', id, { nombre, precio, prefijo, region })
    return id
  })()
}

export function actualizarModelo(db: Db, id: number, datos: DatosModelo, sesion: Sesion | null): void {
  const nombre = validarNombreModelo(datos.nombre)
  const categoria = validarCategoria(datos.categoria)
  const descripcion = validarDescripcion(datos.descripcion)
  const region = validarRegion(datos.region)

  db.transaction(() => {
    const anterior = filaModelo(db, id)
    evitarNombreRepetido(db, nombre, id)
    db.prepare('UPDATE modelos SET nombre = ?, categoria = ?, region = ?, descripcion = ? WHERE id = ?').run(
      nombre,
      categoria,
      region,
      descripcion,
      id
    )
    registrarAuditoria(db, sesion, 'modelo_editado', 'modelo', id, {
      antes: {
        nombre: anterior.nombre,
        categoria: anterior.categoria,
        region: anterior.region,
        descripcion: anterior.descripcion
      },
      despues: { nombre, categoria, region, descripcion }
    })
  })()
}

/** El prefijo solo se puede cambiar mientras el disfraz no tenga unidades (después ya hay códigos con él). */
export function cambiarPrefijo(db: Db, id: number, prefijo: string, sesion: Sesion | null): void {
  const nuevo = validarPrefijo(prefijo)
  db.transaction(() => {
    const m = filaModelo(db, id)
    if (m.prefijo === nuevo) return
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM unidades WHERE modelo_id = ?').get(id) as {
      total: number
    }
    if (total > 0) {
      throw new ErrorDeNegocio(
        `No se puede cambiar el prefijo: "${m.nombre}" ya tiene unidades con códigos ${m.prefijo}-###.`
      )
    }
    evitarPrefijoRepetido(db, nuevo, id)
    db.prepare('UPDATE modelos SET prefijo = ? WHERE id = ?').run(nuevo, id)
    registrarAuditoria(db, sesion, 'prefijo_cambiado', 'modelo', id, { anterior: m.prefijo, nuevo })
  })()
}

/** Cambia el precio general. Los pedidos ya hechos conservan su precio (se copia al pedido). */
export function cambiarPrecio(db: Db, id: number, precio: number, sesion: Sesion | null): void {
  validarPrecio(precio)
  db.transaction(() => {
    const anterior = filaModelo(db, id)
    if (anterior.precio_alquiler === precio) return
    db.prepare('UPDATE modelos SET precio_alquiler = ? WHERE id = ?').run(precio, id)
    registrarAuditoria(db, sesion, 'precio_cambiado', 'modelo', id, {
      anterior: anterior.precio_alquiler,
      nuevo: precio
    })
  })()
}

export function darDeBajaModelo(db: Db, id: number, sesion: Sesion | null): void {
  exigirDuena(sesion, 'dar de baja un disfraz')
  db.transaction(() => {
    const m = filaModelo(db, id)
    if (m.activo === 0) throw new ErrorDeNegocio(`"${m.nombre}" ya está dado de baja.`)
    const ids = (db.prepare('SELECT id FROM unidades WHERE modelo_id = ?').all(id) as { id: number }[]).map(
      (f) => f.id
    )
    const pendiente = alquilerPendiente(db, ids)
    if (pendiente) {
      throw new ErrorDeNegocio(
        `"${m.nombre}" tiene alquileres pendientes (${pendiente.codigo}, salida ${formatearFecha(pendiente.fecha_salida)}). No se puede dar de baja.`
      )
    }
    db.prepare('UPDATE modelos SET activo = 0 WHERE id = ?').run(id)
    registrarAuditoria(db, sesion, 'modelo_baja', 'modelo', id, {})
  })()
}

export function reactivarModelo(db: Db, id: number, sesion: Sesion | null): void {
  exigirDuena(sesion, 'reactivar un disfraz')
  db.transaction(() => {
    const m = filaModelo(db, id)
    if (m.activo === 1) throw new ErrorDeNegocio(`"${m.nombre}" ya está activo.`)
    evitarNombreRepetido(db, m.nombre, id)
    db.prepare('UPDATE modelos SET activo = 1 WHERE id = ?').run(id)
    registrarAuditoria(db, sesion, 'modelo_reactivado', 'modelo', id, {})
  })()
}

export function cambiarFotoModelo(db: Db, id: number, foto: string | null, sesion: Sesion | null): void {
  db.transaction(() => {
    const anterior = filaModelo(db, id)
    db.prepare('UPDATE modelos SET foto = ? WHERE id = ?').run(foto, id)
    // El archivo anterior no se borra del disco.
    registrarAuditoria(db, sesion, 'foto_cambiada', 'modelo', id, { anterior: anterior.foto, nueva: foto })
  })()
}

// ---------- Unidades y piezas ----------

export function crearUnidades(db: Db, datos: NuevasUnidades, sesion: Sesion | null): void {
  const talla = validarTalla(datos.talla)
  const codigos = validarCodigosNuevos(datos.codigos)
  const piezas = validarPiezas(datos.piezas)

  db.transaction(() => {
    const m = filaModelo(db, datos.modeloId)
    if (m.activo === 0) throw new ErrorDeNegocio(`"${m.nombre}" está dado de baja. Reactívelo para agregar unidades.`)
    const existe = db.prepare('SELECT 1 FROM unidades WHERE codigo = ?')
    for (const codigo of codigos) {
      if (existe.get(codigo)) throw new ErrorDeNegocio(`El código ${codigo} ya existe. Use otro código.`)
    }
    const insUnidad = db.prepare('INSERT INTO unidades (modelo_id, codigo, talla) VALUES (?, ?, ?)')
    const insPieza = db.prepare('INSERT INTO piezas (unidad_id, nombre, costo_reposicion) VALUES (?, ?, ?)')
    for (const codigo of codigos) {
      const unidadId = insUnidad.run(datos.modeloId, codigo, talla).lastInsertRowid
      for (const p of piezas) insPieza.run(unidadId, p.nombre, p.costoReposicion)
    }
    registrarAuditoria(db, sesion, 'unidades_creadas', 'modelo', datos.modeloId, { codigos, talla })
  })()
}

/** Guarda talla, observaciones y piezas. Las piezas quitadas se desactivan, no se borran. */
export function actualizarUnidad(db: Db, id: number, datos: DatosUnidad, sesion: Sesion | null): void {
  const talla = validarTalla(datos.talla)
  const observaciones = datos.observaciones.trim()
  if (observaciones.length > 500) throw new ErrorDeNegocio('Las observaciones son demasiado largas (máximo 500 letras).')
  const piezas = validarPiezas(datos.piezas)

  db.transaction(() => {
    const u = filaUnidad(db, id)
    db.prepare('UPDATE unidades SET talla = ?, observaciones = ? WHERE id = ?').run(talla, observaciones, id)

    const actuales = db
      .prepare('SELECT id FROM piezas WHERE unidad_id = ? AND activo = 1')
      .all(id) as { id: number }[]
    const idsEnviados = new Set(piezas.filter((p) => p.id !== undefined).map((p) => p.id))
    for (const p of piezas) {
      if (p.id !== undefined && !actuales.some((a) => a.id === p.id)) {
        throw new ErrorDeNegocio('Una de las piezas ya no existe. Cierre y vuelva a abrir la unidad.')
      }
    }
    const desactivar = db.prepare('UPDATE piezas SET activo = 0 WHERE id = ?')
    for (const a of actuales) if (!idsEnviados.has(a.id)) desactivar.run(a.id)
    const actualizar = db.prepare('UPDATE piezas SET nombre = ?, costo_reposicion = ? WHERE id = ?')
    const insertar = db.prepare('INSERT INTO piezas (unidad_id, nombre, costo_reposicion) VALUES (?, ?, ?)')
    for (const p of piezas) {
      if (p.id !== undefined) actualizar.run(p.nombre, p.costoReposicion, p.id)
      else insertar.run(id, p.nombre, p.costoReposicion)
    }

    registrarAuditoria(db, sesion, 'unidad_editada', 'unidad', id, {
      codigo: u.codigo,
      talla,
      observaciones,
      piezas: piezas.map((p) => ({ nombre: p.nombre, costo: p.costoReposicion }))
    })
  })()
}

export function cambiarEstadoUnidad(db: Db, id: number, nuevo: EstadoFisico, sesion: Sesion | null): void {
  db.transaction(() => {
    const u = filaUnidad(db, id)
    validarCambioEstado(u.codigo, u.estado_fisico, nuevo)
    if (cambioRequiereDuena(u.estado_fisico, nuevo)) {
      exigirDuena(sesion, nuevo === 'baja' ? 'dar de baja una unidad' : 'reactivar una unidad')
    }

    const pendiente = alquilerPendiente(db, [id])
    if (pendiente?.estado === 'entregado') {
      throw new ErrorDeNegocio(
        `${u.codigo} está alquilado ahora (debe volver el ${formatearFecha(pendiente.fecha_devolucion_pactada)}). Registre la devolución antes de cambiar su estado.`
      )
    }
    if (pendiente && cambioChocaConReserva(nuevo)) {
      const accion = nuevo === 'baja' ? 'dar de baja' : 'enviar a reparación'
      throw new ErrorDeNegocio(
        `${u.codigo} tiene una reserva con salida el ${formatearFecha(pendiente.fecha_salida)}. No se puede ${accion}.`
      )
    }

    if (nuevo === 'disponible' && u.estado_fisico === 'baja') {
      const modelo = db.prepare('SELECT activo, nombre FROM modelos WHERE id = ?').get(u.modelo_id) as {
        activo: number
        nombre: string
      }
      if (modelo.activo === 0) {
        throw new ErrorDeNegocio(`"${modelo.nombre}" está dado de baja. Reactive primero el disfraz.`)
      }
    }

    db.prepare('UPDATE unidades SET estado_fisico = ? WHERE id = ?').run(nuevo, id)
    registrarAuditoria(db, sesion, 'estado_cambiado', 'unidad', id, {
      codigo: u.codigo,
      anterior: u.estado_fisico,
      nuevo
    })
  })()
}
