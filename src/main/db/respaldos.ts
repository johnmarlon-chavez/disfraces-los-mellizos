// Registro de los intentos de respaldo y configuración de la carpeta en la nube.
import type Database from 'better-sqlite3'
import type { IntentoRespaldo, TipoRespaldo } from '../../shared/respaldos'
import { ACCIONES_SIN_CAMBIOS } from '../logica/respaldos'
import type { Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'

export interface NuevoIntento {
  tipo: TipoRespaldo
  destino: 'local' | 'nube'
  archivo: string
  ok: boolean
  error: string | null
  tamano: number | null
  sha256: string | null
  fecha: string
  /** marcaCambios() al armar el respaldo (solo cuenta en los correctos). */
  marca: number | null
}

export function registrarIntento(db: Database.Database, i: NuevoIntento): void {
  db.prepare(
    'INSERT INTO respaldos (fecha, tipo, destino, archivo, ok, error, tamano, sha256, marca_cambios) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(i.fecha, i.tipo, i.destino, i.archivo, i.ok ? 1 : 0, i.error, i.tamano, i.sha256, i.ok ? i.marca : null)
}

const SIN_CAMBIOS = ACCIONES_SIN_CAMBIOS.map(() => '?').join(', ')

/** Id más alto de auditoría con cambios de datos: toda escritura de la app queda en auditoría. */
export function marcaCambios(db: Database.Database): number {
  const f = db
    .prepare(`SELECT MAX(id) AS marca FROM auditoria WHERE accion NOT IN (${SIN_CAMBIOS})`)
    .get(...ACCIONES_SIN_CAMBIOS) as { marca: number | null }
  return f.marca ?? 0
}

/**
 * ¿Hubo cambios después del último respaldo correcto (en cualquier destino: el local siempre se
 * escribe primero)? Sin marca (respaldos anteriores a la migración 012, o tras restaurar) se
 * toma como que sí.
 */
export function hayCambios(db: Database.Database): boolean {
  const f = db
    .prepare<[], { marca: number | null }>(
      `SELECT marca_cambios AS marca FROM respaldos WHERE ok = 1 AND tipo <> 'subida_pendiente' ORDER BY fecha DESC, id DESC LIMIT 1`
    )
    .get()
  if (!f || f.marca === null) return true
  return marcaCambios(db) > f.marca
}

/** Fecha del último intento de respaldo (correcto o no), en cualquier destino. */
export function ultimoIntentoFecha(db: Database.Database): string | null {
  const f = db.prepare<[], { fecha: string }>('SELECT fecha FROM respaldos ORDER BY fecha DESC, id DESC LIMIT 1').get()
  return f?.fecha ?? null
}

/** Fecha del último respaldo correcto en ese destino (o en cualquiera). */
export function ultimoOk(db: Database.Database, destino?: 'local' | 'nube'): string | null {
  const f = destino
    ? db.prepare<[string], { fecha: string }>('SELECT fecha FROM respaldos WHERE ok = 1 AND destino = ? ORDER BY fecha DESC, id DESC LIMIT 1').get(destino)
    : db.prepare<[], { fecha: string }>('SELECT fecha FROM respaldos WHERE ok = 1 ORDER BY fecha DESC, id DESC LIMIT 1').get()
  return f?.fecha ?? null
}

/**
 * Último intento que importa para el aviso: el de la nube si hay carpeta elegida (es la copia
 * que protege de perder la laptop); si no, el local.
 */
export function ultimoIntento(db: Database.Database, conNube: boolean): IntentoRespaldo | null {
  const f = db
    .prepare<[string], { fecha: string; destino: 'local' | 'nube'; ok: number; error: string | null }>(
      'SELECT fecha, destino, ok, error FROM respaldos WHERE destino = ? ORDER BY fecha DESC, id DESC LIMIT 1'
    )
    .get(conNube ? 'nube' : 'local')
  return f ? { fecha: f.fecha, destino: f.destino, ok: f.ok === 1, error: f.error } : null
}

export function carpetaNube(db: Database.Database): string | null {
  const f = db.prepare<[], { carpeta_respaldo: string }>('SELECT carpeta_respaldo FROM configuracion WHERE id = 1').get()
  return f?.carpeta_respaldo ? f.carpeta_respaldo : null
}

export function guardarCarpetaNube(db: Database.Database, carpeta: string, sesion: Sesion | null): void {
  db.transaction(() => {
    const antes = carpetaNube(db)
    db.prepare('UPDATE configuracion SET carpeta_respaldo = ? WHERE id = 1').run(carpeta)
    registrarAuditoria(db, sesion, 'carpeta_respaldo_cambiada', 'configuracion', 1, { antes, despues: carpeta })
  }).immediate()
}

export function confirmadoNubeEn(db: Database.Database): string | null {
  const f = db.prepare<[], { en: string | null }>('SELECT respaldo_nube_confirmado_en AS en FROM configuracion WHERE id = 1').get()
  return f?.en ?? null
}

/** La dueña vio en su celular que el respaldo llegó a la nube. */
export function confirmarNube(db: Database.Database, sesion: Sesion | null, archivo: string, ahora = new Date()): void {
  db.transaction(() => {
    db.prepare('UPDATE configuracion SET respaldo_nube_confirmado_en = ? WHERE id = 1').run(ahora.toISOString())
    registrarAuditoria(db, sesion, 'respaldo_nube_confirmado', 'configuracion', 1, { archivo })
  }).immediate()
}
