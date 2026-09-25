import type Database from 'better-sqlite3'
import type { Sesion } from '../sesion'

/** Deja constancia de quién hizo una operación y cuándo. Llamar dentro de la misma transacción. */
export function registrarAuditoria(
  db: Database.Database,
  sesion: Sesion | null,
  accion: string,
  entidad: string,
  entidadId: number | null,
  detalle: Record<string, unknown>
): void {
  db.prepare('INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?)').run(
    sesion?.usuarioId ?? null,
    accion,
    entidad,
    entidadId,
    JSON.stringify(detalle)
  )
}
