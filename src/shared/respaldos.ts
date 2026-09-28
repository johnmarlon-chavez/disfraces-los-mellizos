// Tipos de respaldos y restauración compartidos por main y renderer.

export type ServicioNube = 'onedrive' | 'google_drive' | 'dropbox' | 'icloud'

export const NOMBRE_NUBE: Record<ServicioNube, string> = {
  onedrive: 'OneDrive',
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
  icloud: 'iCloud'
}

export type TipoRespaldo = 'cierre' | 'manual' | 'inicio' | 'automatico' | 'antes_de_restaurar' | 'subida_pendiente'

export interface ArchivoRespaldo {
  archivo: string
  ruta: string
  /** Instante ISO sacado del nombre (hora de Lima). */
  fecha: string
  tamano: number
  antesDeRestaurar: boolean
}

export interface IntentoRespaldo {
  fecha: string
  destino: 'local' | 'nube'
  ok: boolean
  /** Mensaje para la dueña si falló. */
  error: string | null
}

export interface EstadoRespaldos {
  carpetaNube: string | null
  /** Servicio detectado para la carpeta elegida; null = no parece subirse a internet. */
  servicioNube: ServicioNube | null
  carpetaNubeDisponible: boolean
  carpetaLocal: string
  carpetaDatos: string
  /** La carpeta de datos está dentro de una carpeta sincronizada (no debería). */
  datosEnNube: ServicioNube | null
  ultimoOkNube: string | null
  ultimoOkLocal: string | null
  ultimoIntento: IntentoRespaldo | null
  enNube: ArchivoRespaldo[]
  locales: ArchivoRespaldo[]
  /** Bytes que ocupan los respaldos en la carpeta de la nube. */
  espacioNube: number
  confirmadoNubeEn: string | null
  /** Carpetas de Google Drive u OneDrive encontradas en esta computadora, para sugerir. */
  sugerencias: { ruta: string; servicio: ServicioNube }[]
}

export interface ResultadoRespaldo {
  archivo: string
  local: IntentoRespaldo
  /** null si no hay carpeta en la nube elegida. */
  nube: IntentoRespaldo | null
  /** Se volvió a crear la carpeta de la nube porque ya no existía. */
  carpetaRecreada: boolean
}

export interface ConteosRespaldo {
  clientes: number
  modelos: number
  unidades: number
  pedidos: number
  pagos: number
  fotos: number
}

export interface Manifiesto {
  formato: 1
  tienda: string
  versionPrograma: string
  versionEsquema: number
  fecha: string
  tipo: TipoRespaldo
  conteos: ConteosRespaldo
  /** Id más alto de pedidos y pagos: para decir exactamente qué se perdería al restaurar. */
  ultimoIdPedido: number
  ultimoIdPago: number
  archivos: Record<string, { tamano: number; sha256: string }>
}

/** Lo que la dueña ve antes de confirmar una restauración. */
export interface VistaRestauracion {
  archivo: string
  fecha: string
  versionPrograma: string
  conteos: ConteosRespaldo
  /** Registrado después del respaldo, que se perdería (queda en el respaldo "antes de restaurar"). */
  sePerderan: { pedidos: number; pagos: number }
  /** null si se puede restaurar; si no, el motivo. */
  impedimento: string | null
}

export interface AvisosRespaldo {
  /** fallo: el último intento falló; viejo: más de 2 días sin respaldo correcto. */
  problema: 'fallo' | 'viejo' | null
  ultimoOk: string | null
  error: string | null
  sinCarpetaNube: boolean
  recordatorioNube: { archivo: string } | null
  datosEnNube: ServicioNube | null
}
