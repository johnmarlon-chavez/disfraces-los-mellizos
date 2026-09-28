import type Database from 'better-sqlite3'
import type { Configuracion, DatosConfiguracion, ModoMora } from '../../shared/ipc'
import { ErrorDeNegocio } from '../errores'
import { exigirDuena, type Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'

interface FilaConfiguracion {
  mora_por_dia: number
  modo_mora: ModoMora
  dias_margen_lavado: number
  precio_por_dia: number
  carpeta_respaldo: string
  nombre_tienda: string
}

export function obtenerConfiguracion(db: Database.Database): Configuracion {
  const fila = db
    .prepare<[], FilaConfiguracion>(
      `SELECT mora_por_dia, modo_mora, dias_margen_lavado, precio_por_dia, carpeta_respaldo, nombre_tienda
       FROM configuracion WHERE id = 1`
    )
    .get()
  if (!fila) throw new Error('Falta la fila de configuración')
  return {
    moraPorDia: fila.mora_por_dia,
    modoMora: fila.modo_mora,
    diasMargenLavado: fila.dias_margen_lavado,
    precioPorDia: fila.precio_por_dia === 1,
    carpetaRespaldo: fila.carpeta_respaldo,
    nombreTienda: fila.nombre_tienda
  }
}

const MORA_MAXIMA = 100_000 // S/ 1000 por día
const LAVADO_MAXIMO = 14

/** Cambia la configuración del negocio. Solo la dueña; queda en auditoría el antes y el después. */
export function actualizarConfiguracion(db: Database.Database, datos: DatosConfiguracion, sesion: Sesion | null): void {
  exigirDuena(sesion, 'cambiar la configuración')
  if (!Number.isInteger(datos.moraPorDia) || datos.moraPorDia < 0 || datos.moraPorDia > MORA_MAXIMA) {
    throw new ErrorDeNegocio('La mora por día debe ser un monto entre S/ 0.00 y S/ 1000.00.')
  }
  if (datos.modoMora !== 'por_unidad' && datos.modoMora !== 'por_pedido') {
    throw new ErrorDeNegocio('Elija si la mora se cobra por cada disfraz o una sola vez por pedido.')
  }
  if (!Number.isInteger(datos.diasMargenLavado) || datos.diasMargenLavado < 0 || datos.diasMargenLavado > LAVADO_MAXIMO) {
    throw new ErrorDeNegocio(`Los días para lavado deben ser un número entero entre 0 y ${LAVADO_MAXIMO}.`)
  }
  if (typeof datos.precioPorDia !== 'boolean') throw new ErrorDeNegocio('Elija si el precio es por evento o por día.')
  db.transaction(() => {
    const antes = obtenerConfiguracion(db)
    const cambios: Record<string, { antes: unknown; despues: unknown }> = {}
    for (const clave of ['moraPorDia', 'modoMora', 'diasMargenLavado', 'precioPorDia'] as const) {
      if (antes[clave] !== datos[clave]) cambios[clave] = { antes: antes[clave], despues: datos[clave] }
    }
    if (Object.keys(cambios).length === 0) return
    db.prepare('UPDATE configuracion SET mora_por_dia = ?, modo_mora = ?, dias_margen_lavado = ?, precio_por_dia = ? WHERE id = 1').run(
      datos.moraPorDia,
      datos.modoMora,
      datos.diasMargenLavado,
      datos.precioPorDia ? 1 : 0
    )
    registrarAuditoria(db, sesion, 'configuracion_cambiada', 'configuracion', 1, cambios)
  }).immediate()
}
