// Tipos y funciones puras de disfraces compartidos por main y renderer. Montos en céntimos.

export const ESTADOS_FISICOS = ['disponible', 'lavanderia', 'reparacion', 'baja'] as const
export type EstadoFisico = (typeof ESTADOS_FISICOS)[number]

export const NOMBRE_ESTADO: Record<EstadoFisico, string> = {
  disponible: 'Disponible',
  lavanderia: 'En lavandería',
  reparacion: 'En reparación',
  baja: 'De baja'
}

export const REGIONES = ['costa', 'sierra', 'selva'] as const
export type Region = (typeof REGIONES)[number]

export const NOMBRE_REGION: Record<Region, string> = {
  costa: 'Costa',
  sierra: 'Sierra',
  selva: 'Selva'
}

/** Tallas de la lista fija, en su orden lógico. Cualquier otra se registra como "Otra". */
export const TALLAS = ['4', '6', '8', '10', '12', '14', '16', 'S', 'M', 'L', 'XL'] as const

/** Talla escrita a mano: sin espacios sobrantes y en mayúsculas (" xl " -> "XL"). */
export function normalizarTalla(talla: string): string {
  return talla.trim().replace(/\s+/g, ' ').toUpperCase()
}

export interface PiezaDatos {
  nombre: string
  costoReposicion: number
}
export interface Pieza extends PiezaDatos {
  id: number
}
/** Pieza en un formulario: sin id si es nueva. */
export interface PiezaEditable extends PiezaDatos {
  id?: number
}

export interface UnidadResumen {
  codigo: string
  talla: string
  estadoFisico: EstadoFisico
  /** Deducido: la unidad está en un alquiler entregado (fuera de la tienda). */
  alquilada: boolean
}

export interface Unidad extends UnidadResumen {
  id: number
  observaciones: string
  piezas: Pieza[]
}

export interface ResumenModelo {
  id: number
  nombre: string
  categoria: string
  region: Region | null
  precioAlquiler: number
  foto: string | null
  activo: boolean
  unidades: UnidadResumen[]
}

export interface FichaModelo {
  id: number
  nombre: string
  categoria: string
  region: Region | null
  descripcion: string
  precioAlquiler: number
  foto: string | null
  activo: boolean
  prefijo: string
  unidades: Unidad[]
}

export interface DatosModelo {
  nombre: string
  categoria: string
  region: Region | null
  descripcion: string
}
export interface NuevoModelo extends DatosModelo {
  precioAlquiler: number
  /** Prefijo elegido por la usuaria; si falta, se genera uno a partir del nombre. */
  prefijo?: string
}

export interface NuevasUnidades {
  modeloId: number
  talla: string
  codigos: string[]
  piezas: PiezaDatos[]
}

export interface DatosUnidad {
  talla: string
  observaciones: string
  piezas: PiezaEditable[]
}

export function urlFoto(nombreArchivo: string): string {
  return `fotos://archivo/${encodeURIComponent(nombreArchivo)}`
}

/** Minúsculas y sin tildes, para buscar "arana" y encontrar "Araña". */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

export function mismaTalla(a: string, b: string): boolean {
  return normalizarTalla(a) === normalizarTalla(b)
}

export function unidadDisponible(u: UnidadResumen): boolean {
  return u.estadoFisico === 'disponible' && !u.alquilada
}

const ORDEN_LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

function pesoTalla(talla: string): [number, number, string] {
  const t = normalizarTalla(talla)
  if (/^\d+(\.\d+)?$/.test(t)) return [0, Number(t), t]
  const i = ORDEN_LETRAS.indexOf(t)
  if (i >= 0) return [1, i, t]
  return [2, 0, t]
}

/**
 * Orden lógico de tallas, nunca alfabético: numéricas de menor a mayor (4, 6, 8, 10...),
 * luego de letra (S, M, L, XL) y al final cualquier otra en orden alfabético.
 */
export function compararTallas(a: string, b: string): number {
  const [ga, na, sa] = pesoTalla(a)
  const [gb, nb, sb] = pesoTalla(b)
  return ga - gb || na - nb || sa.localeCompare(sb, 'es')
}

/** Tallas únicas (sin distinguir mayúsculas ni espacios) en orden lógico. */
export function ordenarTallas(tallas: string[]): string[] {
  const unicas = new Map<string, string>()
  for (const t of tallas) {
    const clave = normalizarTalla(t)
    if (clave && !unicas.has(clave)) unicas.set(clave, clave)
  }
  return [...unicas.values()].sort(compararTallas)
}

/** Unidades en orden de talla y, dentro de cada talla, por código. */
export function ordenarUnidades<T extends { talla: string; codigo: string }>(unidades: T[]): T[] {
  return [...unidades].sort((a, b) => compararTallas(a.talla, b.talla) || a.codigo.localeCompare(b.codigo, 'es'))
}

export interface FiltroModelos {
  texto: string
  categoria: string
  /** '' = todas; 'ninguna' = modelos sin región. */
  region: Region | 'ninguna' | ''
  talla: string
  incluirBaja: boolean
}

export interface ModeloFiltrado {
  modelo: ResumenModelo
  /** Unidades que no están de baja (y de la talla buscada, si hay filtro de talla). */
  total: number
  disponibles: number
}

/**
 * Filtra la lista de disfraces mientras se escribe. El texto busca en nombre,
 * categoría, región y códigos de unidad; todas las palabras deben coincidir.
 * Con filtro de talla, solo quedan los modelos que tienen esa talla.
 */
export function filtrarModelos(modelos: ResumenModelo[], filtro: FiltroModelos): ModeloFiltrado[] {
  const palabras = normalizarTexto(filtro.texto).split(/\s+/).filter(Boolean)
  const resultado: ModeloFiltrado[] = []

  for (const modelo of modelos) {
    if (!modelo.activo && !filtro.incluirBaja) continue
    if (filtro.categoria && modelo.categoria !== filtro.categoria) continue
    if (filtro.region === 'ninguna' && modelo.region !== null) continue
    if (filtro.region && filtro.region !== 'ninguna' && modelo.region !== filtro.region) continue

    if (palabras.length > 0) {
      const region = modelo.region ? NOMBRE_REGION[modelo.region] : ''
      const texto = normalizarTexto(
        [modelo.nombre, modelo.categoria, region, ...modelo.unidades.map((u) => u.codigo)].join(' ')
      )
      if (!palabras.every((p) => texto.includes(p))) continue
    }

    const unidades = modelo.unidades.filter(
      (u) => u.estadoFisico !== 'baja' && (!filtro.talla || mismaTalla(u.talla, filtro.talla))
    )
    if (filtro.talla && unidades.length === 0) continue

    resultado.push({ modelo, total: unidades.length, disponibles: unidades.filter(unidadDisponible).length })
  }

  return resultado.sort((a, b) => a.modelo.nombre.localeCompare(b.modelo.nombre, 'es'))
}
