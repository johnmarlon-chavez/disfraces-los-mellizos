// Traslado único de los datos de Documentos\SistemaDisfraces a %LOCALAPPDATA%\SistemaDisfraces.
// Seguro: primero se copia y se verifica todo; recién entonces se renombra el original (no se borra).
// Si algo falla, se quitan las copias del destino y el origen queda intacto.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export type ResultadoTraslado =
  | { estado: 'nada' }
  | { estado: 'trasladado'; desde: string; hacia: string; fotos: number }
  /** Hay datos en los dos lugares: se usa el destino y no se mezcla nada. */
  | { estado: 'ambos'; desde: string; hacia: string }
  | { estado: 'fallo'; desde: string; hacia: string; error: unknown }

const hashDe = (ruta: string): string => createHash('sha256').update(readFileSync(ruta)).digest('hex')

const LEAME = (hacia: string): string =>
  [
    'Los datos del sistema de Disfraces Los Mellizos se trasladaron a:',
    hacia,
    '',
    'Esa carpeta no se sincroniza con OneDrive, así que la base de datos no corre riesgo de dañarse.',
    'Los respaldos siguen yendo a la carpeta en la nube elegida en Configuración.',
    '',
    'Los archivos de esta carpeta (datos.db.trasladado y fotos) quedaron como estaban y ya no se usan.',
    'No los borre hasta confirmar que el programa funciona bien.'
  ].join('\r\n')

/**
 * Traslada `origen` → `destino` si en el destino no hay base y en el origen sí.
 * Nunca lanza: devuelve qué pasó para que el inicio decida qué carpeta usar.
 */
export async function trasladarDatos(origen: string, destino: string): Promise<ResultadoTraslado> {
  const dbOrigen = join(origen, 'datos.db')
  const dbDestino = join(destino, 'datos.db')
  if (!existsSync(dbOrigen)) return { estado: 'nada' }
  if (existsSync(dbDestino)) return { estado: 'ambos', desde: origen, hacia: destino }

  const temporal = join(destino, 'datos.db.trasladando')
  const fotosCopiadas: string[] = []
  try {
    mkdirSync(join(destino, 'fotos'), { recursive: true })
    rmSync(temporal, { force: true }) // restos de un intento anterior interrumpido

    // 1) Base: API de backup de SQLite (incluye lo que esté en el -wal), luego integrity_check.
    const fuente = new Database(dbOrigen, { fileMustExist: true })
    try {
      await fuente.backup(temporal)
    } finally {
      fuente.close()
    }
    const copia = new Database(temporal, { readonly: true })
    try {
      const r = copia.pragma('integrity_check', { simple: true })
      if (r !== 'ok') throw new Error(`La copia de la base no pasó integrity_check: ${String(r)}`)
    } finally {
      copia.close()
    }

    // 2) Fotos: se copian y se verifican una por una (tamaño y hash).
    const carpetaFotos = join(origen, 'fotos')
    const fotos = existsSync(carpetaFotos) ? readdirSync(carpetaFotos).filter((f) => statSync(join(carpetaFotos, f)).isFile()) : []
    for (const foto of fotos) {
      const hacia = join(destino, 'fotos', foto)
      if (existsSync(hacia) && hashDe(hacia) === hashDe(join(carpetaFotos, foto))) continue
      copyFileSync(join(carpetaFotos, foto), hacia)
      fotosCopiadas.push(hacia)
      if (statSync(hacia).size !== statSync(join(carpetaFotos, foto)).size || hashDe(hacia) !== hashDe(join(carpetaFotos, foto))) {
        throw new Error(`La foto ${foto} no se copió bien`)
      }
    }

    // 3) Todo verificado: la copia pasa a ser la base, y el original se renombra (no se borra).
    renameSync(temporal, dbDestino)
    try {
      renameSync(dbOrigen, `${dbOrigen}.trasladado`)
    } catch (error) {
      // No se pudo marcar el original: se deshace para no quedar con dos bases "vivas".
      renameSync(dbDestino, temporal)
      throw error
    }
    for (const extra of ['-wal', '-shm']) {
      if (existsSync(dbOrigen + extra)) renameSync(dbOrigen + extra, `${dbOrigen}${extra}.trasladado`)
    }
    try {
      writeFileSync(join(origen, 'LÉAME - los datos se trasladaron.txt'), LEAME(destino), 'utf8')
    } catch {
      // Sin importancia: el traslado ya se hizo.
    }
    return { estado: 'trasladado', desde: origen, hacia: destino, fotos: fotos.length }
  } catch (error) {
    rmSync(temporal, { force: true })
    for (const f of fotosCopiadas) rmSync(f, { force: true })
    return { estado: 'fallo', desde: origen, hacia: destino, error }
  }
}
