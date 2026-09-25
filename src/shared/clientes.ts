// Tipos y funciones puras de clientes compartidos por main y renderer.
import { normalizarTexto } from './disfraces'

export type TipoCliente = 'persona' | 'colegio'

export const TIPOS_DOCUMENTO = ['dni', 'ce', 'pasaporte'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  dni: 'DNI',
  ce: 'Carné de extranjería',
  pasaporte: 'Pasaporte'
}

/** Forma corta para listas: "DNI 40123456", "CE 001234567". */
export const SIGLA_DOCUMENTO: Record<TipoDocumento, string> = {
  dni: 'DNI',
  ce: 'CE',
  pasaporte: 'Pasaporte'
}

/** Distritos de la provincia de Trujillo (La Libertad), para las sugerencias. */
export const DISTRITOS_TRUJILLO = [
  'Trujillo',
  'El Porvenir',
  'Florencia de Mora',
  'Huanchaco',
  'La Esperanza',
  'Laredo',
  'Moche',
  'Poroto',
  'Salaverry',
  'Simbal',
  'Víctor Larco Herrera'
] as const

export interface DatosPersona {
  tipo: 'persona'
  tipoDocumento: TipoDocumento
  numeroDocumento: string
  nombres: string
  telefono: string
  direccion: string
  observaciones: string
}

export interface DatosColegio {
  tipo: 'colegio'
  nombres: string
  distrito: string
  responsable: string
  dniResponsable: string
  telefono: string
  ruc: string
  direccion: string
  observaciones: string
}

export type DatosCliente = DatosPersona | DatosColegio

export interface ResumenCliente {
  id: number
  tipo: TipoCliente
  tipoDocumento: TipoDocumento | null
  numeroDocumento: string | null
  nombres: string
  responsable: string
  dniResponsable: string | null
  distrito: string
  ruc: string | null
  telefono: string
  activo: boolean
  conAntecedentes: boolean
}

export interface HistorialCliente {
  /** Alquileres no cancelados. */
  alquileresTotales: number
  devolucionesTardias: number
  /** Cargos por daños o piezas faltantes. */
  cargosPorDanos: number
  montoCargosPorDanos: number
}

export interface AlquilerDeCliente {
  id: number
  fechaSalida: string
  fechaDevolucionPactada: string
  fechaDevolucionReal: string | null
  estado: 'reservado' | 'entregado' | 'devuelto' | 'cancelado'
  unidades: number
}

export interface FichaCliente extends ResumenCliente {
  direccion: string
  observaciones: string
  historial: HistorialCliente
  alquileres: AlquilerDeCliente[]
}

export interface ColegioParecido {
  id: number
  nombres: string
  distrito: string
  activo: boolean
  /** Mismo nombre y mismo distrito: es el mismo colegio (no se permite registrarlo otra vez). */
  mismo: boolean
}

export function tieneAntecedentes(h: HistorialCliente): boolean {
  return h.devolucionesTardias > 0 || h.cargosPorDanos > 0
}

/** Solo dígitos, sin +51 inicial: "+51 987-654-321" -> "987654321". */
export function soloDigitosTelefono(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '')
  return digitos.length === 11 && digitos.startsWith('51') ? digitos.slice(2) : digitos
}

/** Para mostrar: celular "987 654 321"; fijo con código "044 123456". */
export function formatearTelefono(telefono: string): string {
  const d = soloDigitosTelefono(telefono)
  if (/^9\d{8}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  if (/^0\d{8}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3)}`
  return telefono
}

/** "víctor larco" -> "Víctor Larco Herrera" si coincide con un distrito conocido; si no, en formato Título. */
export function normalizarDistrito(texto: string, conocidos: readonly string[] = DISTRITOS_TRUJILLO): string {
  const limpio = texto.trim().replace(/\s+/g, ' ')
  if (!limpio) return ''
  const clave = normalizarTexto(limpio)
  const exacto = conocidos.find((d) => normalizarTexto(d) === clave)
  if (exacto) return exacto
  return limpio
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && ['de', 'del', 'la', 'las', 'los', 'y'].includes(p) ? p : p[0].toUpperCase() + p.slice(1)))
    .join(' ')
}

export interface FiltroClientes {
  texto: string
  tipo: TipoCliente | ''
  incluirInactivos: boolean
}

/**
 * Filtra mientras se escribe. Busca en nombre, documento, responsable, su DNI,
 * distrito, RUC y teléfono (con o sin espacios). Todas las palabras deben coincidir.
 */
export function filtrarClientes(clientes: ResumenCliente[], filtro: FiltroClientes): ResumenCliente[] {
  const palabras = normalizarTexto(filtro.texto).split(/\s+/).filter(Boolean)
  return clientes
    .filter((c) => {
      if (!c.activo && !filtro.incluirInactivos) return false
      if (filtro.tipo && c.tipo !== filtro.tipo) return false
      if (palabras.length === 0) return true
      const texto = normalizarTexto(
        [
          c.nombres,
          c.numeroDocumento ?? '',
          c.responsable,
          c.dniResponsable ?? '',
          c.distrito,
          c.ruc ?? '',
          c.telefono,
          soloDigitosTelefono(c.telefono)
        ].join(' ')
      )
      return palabras.every((p) => texto.includes(p))
    })
    .sort((a, b) => a.nombres.localeCompare(b.nombres, 'es'))
}
