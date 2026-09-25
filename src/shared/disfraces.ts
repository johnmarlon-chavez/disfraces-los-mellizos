// Tipos y funciones puras de disfraces compartidos por main y renderer. Montos en céntimos.

export const ESTADOS_FISICOS = ['disponible', 'lavanderia', 'reparacion', 'baja'] as const
export type EstadoFisico = (typeof ESTADOS_FISICOS)[number]

export const NOMBRE_ESTADO: Record<EstadoFisico, string> = {
  disponible: 'Disponible',
  lavanderia: 'En lavandería',
  reparacion: 'En reparación',
  baja: 'De baja'
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
  precioAlquiler: number
  foto: string | null
  activo: boolean
  unidades: UnidadResumen[]
}

export interface FichaModelo {
  id: number
  nombre: string
  categoria: string
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
  descripcion: string
}
export interface NuevoModelo extends DatosModelo {
  precioAlquiler: number
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
  return normalizarTexto(a) === normalizarTexto(b)
}

export function unidadDisponible(u: UnidadResumen): boolean {
  return u.estadoFisico === 'disponible' && !u.alquilada
}

const ORDEN_LETRAS = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl']

/** Tallas únicas en orden natural: 2, 4, 6, 8, 10... y luego XS, S, M, L, XL... */
export function ordenarTallas(tallas: string[]): string[] {
  const unicas = new Map<string, string>()
  for (const t of tallas) {
    const clave = normalizarTexto(t)
    if (clave && !unicas.has(clave)) unicas.set(clave, t.trim())
  }
  const peso = (t: string): [number, number, string] => {
    const n = normalizarTexto(t)
    if (/^\d+(\.\d+)?$/.test(n)) return [0, Number(n), n]
    const i = ORDEN_LETRAS.indexOf(n)
    if (i >= 0) return [1, i, n]
    return [2, 0, n]
  }
  return [...unicas.values()].sort((a, b) => {
    const [ga, na, sa] = peso(a)
    const [gb, nb, sb] = peso(b)
    return ga - gb || na - nb || sa.localeCompare(sb, 'es')
  })
}

export interface FiltroModelos {
  texto: string
  categoria: string
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
 * categoría y códigos de unidad; todas las palabras deben coincidir.
 * Con filtro de talla, solo quedan los modelos que tienen esa talla.
 */
export function filtrarModelos(modelos: ResumenModelo[], filtro: FiltroModelos): ModeloFiltrado[] {
  const palabras = normalizarTexto(filtro.texto).split(/\s+/).filter(Boolean)
  const resultado: ModeloFiltrado[] = []

  for (const modelo of modelos) {
    if (!modelo.activo && !filtro.incluirBaja) continue
    if (filtro.categoria && modelo.categoria !== filtro.categoria) continue

    if (palabras.length > 0) {
      const texto = normalizarTexto([modelo.nombre, modelo.categoria, ...modelo.unidades.map((u) => u.codigo)].join(' '))
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
