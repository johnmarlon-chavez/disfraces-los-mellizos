import type Database from 'better-sqlite3'
import type { Configuracion } from '../../shared/ipc'

interface FilaConfiguracion {
  mora_por_dia: number
  dias_margen_lavado: number
  precio_por_dia: number
  carpeta_respaldo: string
  nombre_tienda: string
}

export function obtenerConfiguracion(db: Database.Database): Configuracion {
  const fila = db
    .prepare<[], FilaConfiguracion>(
      `SELECT mora_por_dia, dias_margen_lavado, precio_por_dia, carpeta_respaldo, nombre_tienda
       FROM configuracion WHERE id = 1`
    )
    .get()
  if (!fila) throw new Error('Falta la fila de configuración')
  return {
    moraPorDia: fila.mora_por_dia,
    diasMargenLavado: fila.dias_margen_lavado,
    precioPorDia: fila.precio_por_dia === 1,
    carpetaRespaldo: fila.carpeta_respaldo,
    nombreTienda: fila.nombre_tienda
  }
}
