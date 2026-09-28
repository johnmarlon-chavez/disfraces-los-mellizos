// Reglas de los respaldos, puras: nombres, qué conservar, detección de carpetas en la nube
// y mensajes de error comprensibles.
import type { ServicioNube } from '../../shared/respaldos'

const ZONA = 'America/Lima'
const PREFIJO = 'Respaldo Disfraces'
const MARCA_ANTES = ' (antes de restaurar)'

// "Respaldo Disfraces 2026-09-28 18-30-05.zip" o "... 18-30-05 (antes de restaurar).zip"
const PATRON = /^Respaldo Disfraces (\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})-(\d{2})( \(antes de restaurar\))?\.zip$/

export interface NombreRespaldo {
  archivo: string
  /** Día en Lima, "aaaa-mm-dd". */
  dia: string
  /** Clave ordenable: "aaaa-mm-dd hh-mm-ss". */
  orden: string
  antesDeRestaurar: boolean
}

function partesLima(instante: Date): Record<string, string> {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instante)
  return Object.fromEntries(partes.map((p) => [p.type, p.value]))
}

/** Nombre del archivo, con fecha y hora de Lima (se entiende al verlo en Drive). */
export function nombreRespaldo(instante: Date, antesDeRestaurar = false): string {
  const p = partesLima(instante)
  return `${PREFIJO} ${p.year}-${p.month}-${p.day} ${p.hour}-${p.minute}-${p.second}${antesDeRestaurar ? MARCA_ANTES : ''}.zip`
}

/** Lee un nombre de respaldo; null si el archivo no es nuestro (y entonces nunca se toca). */
export function leerNombre(archivo: string): NombreRespaldo | null {
  const m = PATRON.exec(archivo)
  if (!m) return null
  return { archivo, dia: m[1], orden: `${m[1]} ${m[2]}-${m[3]}-${m[4]}`, antesDeRestaurar: !!m[5] }
}

export const DIAS_EN_NUBE = 30
export const RESPALDOS_LOCALES = 7
/** Los "antes de restaurar" se conservan aparte: pueden ser la única copia de lo más reciente. */
export const ANTES_DE_RESTAURAR = 5

const masNuevoPrimero = (a: NombreRespaldo, b: NombreRespaldo): number => b.orden.localeCompare(a.orden)

/**
 * Nube: todos los de hoy y, de los días anteriores, el último de cada día, hasta 30 días distintos.
 * Devuelve los archivos que sobran. Nunca incluye archivos que no son nuestros.
 */
export function sobrantesEnNube(archivos: string[], hoy: string, dias = DIAS_EN_NUBE): string[] {
  const nuestros = archivos.map(leerNombre).filter((n): n is NombreRespaldo => n !== null)
  const comunes = nuestros.filter((n) => !n.antesDeRestaurar).sort(masNuevoPrimero)
  const conservados = new Set<string>()
  const diasVistos = new Set<string>()
  for (const n of comunes) {
    if (n.dia === hoy) {
      conservados.add(n.archivo)
      diasVistos.add(n.dia)
    } else if (!diasVistos.has(n.dia) && diasVistos.size < dias) {
      diasVistos.add(n.dia)
      conservados.add(n.archivo)
    }
  }
  return [...comunes.filter((n) => !conservados.has(n.archivo)), ...sobrantesAntesDeRestaurar(nuestros)].map((n) => n.archivo)
}

/** Copia local: los últimos 7 (más los "antes de restaurar", aparte). */
export function sobrantesLocales(archivos: string[], cantidad = RESPALDOS_LOCALES): string[] {
  const nuestros = archivos.map(leerNombre).filter((n): n is NombreRespaldo => n !== null)
  const comunes = nuestros.filter((n) => !n.antesDeRestaurar).sort(masNuevoPrimero)
  return [...comunes.slice(cantidad), ...sobrantesAntesDeRestaurar(nuestros)].map((n) => n.archivo)
}

function sobrantesAntesDeRestaurar(nuestros: NombreRespaldo[]): NombreRespaldo[] {
  return nuestros
    .filter((n) => n.antesDeRestaurar)
    .sort(masNuevoPrimero)
    .slice(ANTES_DE_RESTAURAR)
}

/** Nombre más reciente entre los nuestros (null si no hay). */
export function masReciente(archivos: string[]): string | null {
  const nuestros = archivos.map(leerNombre).filter((n): n is NombreRespaldo => n !== null && !n.antesDeRestaurar)
  return nuestros.sort(masNuevoPrimero)[0]?.archivo ?? null
}

const normal = (ruta: string): string => ruta.replace(/[\\/]+/g, '\\').replace(/\\$/, '').toLowerCase()

/** ¿`hija` está dentro de `padre` (o es la misma carpeta)? Sin distinguir mayúsculas, como Windows. */
export function estaDentro(hija: string, padre: string): boolean {
  const h = normal(hija)
  const p = normal(padre)
  return h === p || h.startsWith(p + '\\')
}

const SEGMENTOS_DRIVE = ['mi unidad', 'my drive', 'google drive', 'googledrive', 'unidades compartidas', 'shared drives']

/**
 * ¿La carpeta se sincroniza con una nube? Por las variables de OneDrive y por los nombres de
 * carpeta de Google Drive para escritorio ("Mi unidad", "My Drive"...), Dropbox e iCloud.
 */
export function detectarNube(ruta: string, entorno: Record<string, string | undefined>): ServicioNube | null {
  for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const base = entorno[v]
    if (base && estaDentro(ruta, base)) return 'onedrive'
  }
  const segmentos = normal(ruta).split('\\')
  if (segmentos.some((s) => SEGMENTOS_DRIVE.includes(s))) return 'google_drive'
  if (segmentos.some((s) => s === 'onedrive' || s.startsWith('onedrive - '))) return 'onedrive'
  if (segmentos.includes('dropbox')) return 'dropbox'
  if (segmentos.includes('iclouddrive')) return 'icloud'
  return null
}

export type TipoError = 'no_existe' | 'disco_lleno' | 'sin_permiso' | 'en_uso' | 'tiempo' | 'verificacion' | 'otro'

/** Clasifica un error de disco en algo que se pueda explicar sin tecnicismos. */
export function tipoDeError(error: unknown): TipoError {
  const codigo = (error as { code?: string } | null)?.code
  if (codigo === 'ENOENT' || codigo === 'ENOTDIR' || codigo === 'ENODEV') return 'no_existe'
  if (codigo === 'ENOSPC' || codigo === 'EDQUOT') return 'disco_lleno'
  if (codigo === 'EACCES' || codigo === 'EPERM' || codigo === 'EROFS') return 'sin_permiso'
  if (codigo === 'EBUSY') return 'en_uso'
  if (codigo === 'ETIMEDOUT') return 'tiempo'
  if (codigo === 'EVERIFICACION') return 'verificacion'
  return 'otro'
}

export const MENSAJE_ERROR: Record<TipoError, string> = {
  no_existe: 'la carpeta de respaldos no está disponible (¿se borró, o la aplicación de Google Drive u OneDrive está cerrada?)',
  disco_lleno: 'el disco está lleno',
  sin_permiso: 'no hay permiso para escribir en la carpeta',
  en_uso: 'otro programa está usando el archivo',
  tiempo: 'la carpeta tardó demasiado en responder',
  verificacion: 'la copia no se pudo verificar',
  otro: 'ocurrió un problema al escribir el archivo'
}

/**
 * Acciones de auditoría que no cambian los datos del negocio: no cuentan como "hubo cambios"
 * (si no, cada inicio de sesión o cada respaldo pediría otro respaldo).
 */
export const ACCIONES_SIN_CAMBIOS = [
  'respaldo_creado',
  'respaldo_nube_confirmado',
  'inicio_sesion',
  'cierre_sesion',
  'sesion_cerrada_inactividad',
  'cuenta_bloqueada',
  'aviso_restablecimiento_visto',
  'datos_trasladados',
  'traslado_fallido',
  'soporte_herramienta_abierta',
  'soporte_sin_clave',
  'soporte_clave_incorrecta',
  'soporte_bloqueado',
  'soporte_intento_bloqueado',
  'soporte_sin_contrasena_duena',
  'soporte_contrasena_duena_incorrecta'
] as const

/**
 * ¿Hace falta un respaldo al abrir? Si hubo cambios después del último respaldo correcto (por
 * ejemplo, se apagó la laptop sin cerrar el programa), o si el último tiene más de 24 horas.
 */
export function faltaRespaldoAlAbrir(ultimoOk: string | null, hayCambios: boolean, ahora: Date): boolean {
  if (!ultimoOk || hayCambios) return true
  return ahora.getTime() - new Date(ultimoOk).getTime() > 24 * 60 * 60 * 1000
}

export const RESPALDO_AUTOMATICO_MS = 2 * 60 * 60 * 1000

/**
 * Respaldo automático con la app abierta: si hubo cambios y pasaron 2 horas desde el último
 * intento (correcto o no: si la nube falla, no se reintenta a cada rato).
 */
export function tocaRespaldoAutomatico(
  ultimoIntento: string | null,
  hayCambios: boolean,
  ahora: Date,
  cadaMs = RESPALDO_AUTOMATICO_MS
): boolean {
  if (!hayCambios) return false
  return !ultimoIntento || ahora.getTime() - new Date(ultimoIntento).getTime() >= cadaMs
}

/**
 * Recordatorio de revisar en el celular que el respaldo llegó a la nube: apenas haya un respaldo
 * en la nube (para comprobar que la carpeta elegida sí se sube) y luego una vez al mes.
 */
export function tocaRecordatorioNube(confirmadoEn: string | null, hayRespaldoEnNube: boolean, ahora: Date): boolean {
  if (!hayRespaldoEnNube) return false
  if (!confirmadoEn) return true
  return ahora.getTime() - new Date(confirmadoEn).getTime() >= 30 * 24 * 60 * 60 * 1000
}

/** Aviso en Inicio: sin respaldo correcto en más de 2 días, o el último intento falló. */
export function problemaDeRespaldo(ultimoOk: string | null, ultimoIntentoFallo: boolean, ahora: Date): 'fallo' | 'viejo' | null {
  if (ultimoIntentoFallo) return 'fallo'
  if (!ultimoOk) return null
  return ahora.getTime() - new Date(ultimoOk).getTime() > 2 * 24 * 60 * 60 * 1000 ? 'viejo' : null
}
