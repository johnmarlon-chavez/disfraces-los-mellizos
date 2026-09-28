import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface Rutas {
  carpetaDatos: string
  baseDeDatos: string
  fotos: string
  /** Copia local de los respaldos (los últimos 7). */
  respaldosLocales: string
}

const nombreCarpeta = (): string => (app.isPackaged ? 'SistemaDisfraces' : 'SistemaDisfraces-dev')

/**
 * Los datos viven en %LOCALAPPDATA%\SistemaDisfraces, fuera de la carpeta de instalación (reinstalar
 * o actualizar no borra nada) y fuera de Documentos: en muchas laptops Documentos se sincroniza con
 * OneDrive, y una base SQLite abierta sincronizándose puede terminar en conflictos o corrupción.
 * %LOCALAPPDATA% nunca se sincroniza. En desarrollo se usa SistemaDisfraces-dev.
 * DISFRACES_DATOS_DIR permite a las pruebas usar una carpeta temporal.
 */
export function carpetaDatosElegida(): string {
  if (process.env.DISFRACES_DATOS_DIR) return process.env.DISFRACES_DATOS_DIR
  const local = process.env.LOCALAPPDATA ?? join(app.getPath('home'), 'AppData', 'Local')
  return join(local, nombreCarpeta())
}

/** Donde estaban los datos antes de la Fase 8 (Documentos): se trasladan solos al iniciar. */
export function carpetaDatosAnterior(): string {
  return join(app.getPath('documents'), nombreCarpeta())
}

export function rutasDe(carpetaDatos: string): Rutas {
  return {
    carpetaDatos,
    baseDeDatos: join(carpetaDatos, 'datos.db'),
    fotos: join(carpetaDatos, 'fotos'),
    respaldosLocales: join(carpetaDatos, 'respaldos')
  }
}

/** Rutas de la carpeta indicada, creando las subcarpetas que falten. */
export function prepararRutas(carpetaDatos: string): Rutas {
  const rutas = rutasDe(carpetaDatos)
  mkdirSync(rutas.fotos, { recursive: true })
  mkdirSync(rutas.respaldosLocales, { recursive: true })
  return rutas
}

/** Rutas de la carpeta de datos elegida (sin traslado; lo hace index.ts o el seed antes). */
export function obtenerRutas(): Rutas {
  return prepararRutas(carpetaDatosElegida())
}
