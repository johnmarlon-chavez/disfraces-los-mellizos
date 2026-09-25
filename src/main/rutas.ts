import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface Rutas {
  carpetaDatos: string
  baseDeDatos: string
  fotos: string
}

/**
 * Los datos viven en Documentos, fuera de la carpeta de instalación, para que
 * reinstalar o actualizar no borre nada. En desarrollo se usa otra carpeta para
 * no mezclar datos de prueba con datos reales.
 * DISFRACES_DATOS_DIR permite a las pruebas E2E usar una carpeta temporal.
 */
export function obtenerRutas(): Rutas {
  const carpetaDatos =
    process.env.DISFRACES_DATOS_DIR ??
    join(app.getPath('documents'), app.isPackaged ? 'SistemaDisfraces' : 'SistemaDisfraces-dev')

  const rutas: Rutas = {
    carpetaDatos,
    baseDeDatos: join(carpetaDatos, 'datos.db'),
    fotos: join(carpetaDatos, 'fotos')
  }
  mkdirSync(rutas.fotos, { recursive: true })
  return rutas
}
