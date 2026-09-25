import { join } from 'node:path'

const NOMBRE_FOTO = /^[a-z0-9-]+\.jpg$/

export function nombreFotoModelo(modeloId: number, ahora: number = Date.now()): string {
  return `modelo-${modeloId}-${ahora}.jpg`
}

/**
 * Traduce una URL fotos://archivo/<nombre> a la ruta del archivo dentro de la carpeta de fotos.
 * Devuelve null para cualquier cosa que no sea un nombre de foto generado por el sistema,
 * así una URL maliciosa (../../datos.db) nunca puede leer archivos fuera de esa carpeta.
 */
export function resolverRutaFoto(carpetaFotos: string, url: string): string | null {
  let nombre: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'fotos:' || u.hostname !== 'archivo') return null
    nombre = decodeURIComponent(u.pathname.replace(/^\//, ''))
  } catch {
    return null
  }
  if (!NOMBRE_FOTO.test(nombre)) return null
  return join(carpetaFotos, nombre)
}

/** Nuevo tamaño para que ningún lado pase de `maximo` píxeles, conservando la proporción. */
export function tamanoReducido(
  ancho: number,
  alto: number,
  maximo = 1200
): { ancho: number; alto: number } | null {
  if (ancho <= maximo && alto <= maximo) return null
  const escala = maximo / Math.max(ancho, alto)
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) }
}
