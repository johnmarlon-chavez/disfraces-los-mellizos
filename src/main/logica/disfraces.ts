// Reglas de negocio de disfraces. Funciones puras, sin base de datos.
import {
  NOMBRE_ESTADO,
  REGIONES,
  normalizarTalla,
  normalizarTexto,
  type EstadoFisico,
  type PiezaDatos,
  type Region
} from '../../shared/disfraces'
import { ErrorDeNegocio } from '../errores'

function palabrasDelNombre(nombre: string): string[] {
  return normalizarTexto(nombre)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/**
 * Prefijo único de 3 letras para los códigos de unidad de un modelo.
 * "Spiderman" -> SPI; si SPI ya está usado, "Spiderman Negro" -> SPN.
 * Si ninguna combinación está libre, agrega un número: SPI2, SPI3...
 */
export function generarPrefijo(nombre: string, prefijosUsados: string[]): string {
  const usados = new Set(prefijosUsados.map((p) => p.toUpperCase()))
  const palabras = palabrasDelNombre(nombre)
  if (palabras.length === 0) palabras.push('DIS')

  const base = palabras.join('').slice(0, 3).padEnd(3, 'X')
  const candidatos = [base]
  // Dos letras de la primera palabra + inicial de cada palabra siguiente: SPIDERMAN NEGRO -> SPN
  for (const palabra of palabras.slice(1)) {
    candidatos.push((palabras[0].slice(0, 2) + palabra[0]).padEnd(3, 'X'))
  }
  // Iniciales de las tres primeras palabras: HOMBRE ARAÑA NEGRO -> HAN
  if (palabras.length >= 3) candidatos.push(palabras.slice(0, 3).map((p) => p[0]).join(''))

  for (const c of candidatos) if (!usados.has(c)) return c
  for (let n = 2; ; n++) {
    const c = `${base}${n}`
    if (!usados.has(c)) return c
  }
}

/**
 * Siguientes códigos libres para un prefijo: con ARA-001 y ARA-003 existentes,
 * pedir 2 devuelve ARA-004 y ARA-005. Los códigos de baja también cuentan, para no repetirlos.
 */
export function siguientesCodigos(prefijo: string, codigosExistentes: string[], cantidad: number): string[] {
  const patron = new RegExp(`^${prefijo}-(\\d+)$`, 'i')
  let mayor = 0
  for (const codigo of codigosExistentes) {
    const m = patron.exec(codigo)
    if (m) mayor = Math.max(mayor, Number(m[1]))
  }
  return Array.from({ length: cantidad }, (_, i) => `${prefijo}-${String(mayor + i + 1).padStart(3, '0')}`)
}

/** campo: "el nombre del disfraz" -> "Escriba el nombre del disfraz." */
function texto(valor: string, campo: string, maximo: number): string {
  const limpio = valor.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeNegocio(`Escriba ${campo}.`)
  if (limpio.length > maximo) {
    throw new ErrorDeNegocio(`Es demasiado largo: ${campo} puede tener como máximo ${maximo} letras.`)
  }
  return limpio
}

export function validarNombreModelo(nombre: string): string {
  return texto(nombre, 'el nombre del disfraz', 80)
}

export function validarCategoria(categoria: string): string {
  return texto(categoria, 'la categoría', 40)
}

export function validarDescripcion(descripcion: string): string {
  const limpio = descripcion.trim()
  if (limpio.length > 500) throw new ErrorDeNegocio('La descripción es demasiado larga (máximo 500 letras).')
  return limpio
}

export function validarPrecio(centimos: number): number {
  if (!Number.isSafeInteger(centimos) || centimos <= 0) {
    throw new ErrorDeNegocio('El precio debe ser mayor que cero.')
  }
  return centimos
}

export function validarTalla(talla: string): string {
  const limpio = normalizarTalla(talla)
  if (!limpio) throw new ErrorDeNegocio('Escriba la talla.')
  if (limpio.length > 10) throw new ErrorDeNegocio('La talla es demasiado larga (máximo 10 letras).')
  return limpio
}

/** Prefijo elegido a mano: 2 a 5 letras o números, en mayúsculas. La unicidad se revisa en la base. */
export function validarPrefijo(prefijo: string): string {
  const limpio = prefijo.trim().toUpperCase()
  if (!limpio) throw new ErrorDeNegocio('Escriba el prefijo de los códigos.')
  if (!/^[A-Z0-9]{2,5}$/.test(limpio)) {
    throw new ErrorDeNegocio(
      `El prefijo "${prefijo.trim()}" no es válido. Use de 2 a 5 letras o números, sin espacios ni guiones, por ejemplo MAV.`
    )
  }
  return limpio
}

export function validarRegion(region: Region | null): Region | null {
  if (region === null) return null
  if (!REGIONES.includes(region)) throw new ErrorDeNegocio('Elija una región válida: Costa, Sierra, Selva o "No aplica".')
  return region
}

export function validarCodigo(codigo: string): string {
  const limpio = codigo.trim().toUpperCase()
  if (!limpio) throw new ErrorDeNegocio('Escriba el código de la unidad.')
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(limpio) || limpio.length > 20) {
    throw new ErrorDeNegocio(`El código "${codigo.trim()}" no es válido. Use letras, números y guiones, por ejemplo ARA-005.`)
  }
  return limpio
}

export function validarCodigosNuevos(codigos: string[]): string[] {
  if (codigos.length === 0) throw new ErrorDeNegocio('Indique cuántas unidades quiere agregar.')
  if (codigos.length > 50) throw new ErrorDeNegocio('Puede agregar como máximo 50 unidades a la vez.')
  const limpios = codigos.map(validarCodigo)
  const repetido = limpios.find((c, i) => limpios.indexOf(c) !== i)
  if (repetido) throw new ErrorDeNegocio(`El código ${repetido} está repetido en la lista.`)
  return limpios
}

export function validarPiezas<T extends PiezaDatos>(piezas: T[]): T[] {
  return piezas.map((p) => {
    const nombre = p.nombre.trim()
    if (!nombre) throw new ErrorDeNegocio('Cada pieza debe tener un nombre.')
    if (nombre.length > 60) throw new ErrorDeNegocio(`El nombre de la pieza "${nombre}" es demasiado largo.`)
    if (!Number.isSafeInteger(p.costoReposicion) || p.costoReposicion < 0) {
      throw new ErrorDeNegocio(`El costo de la pieza "${nombre}" no es válido.`)
    }
    return { ...p, nombre }
  })
}

const TRANSICIONES: Record<EstadoFisico, EstadoFisico[]> = {
  disponible: ['lavanderia', 'reparacion', 'baja'],
  lavanderia: ['disponible', 'reparacion', 'baja'],
  reparacion: ['disponible', 'lavanderia', 'baja'],
  baja: ['disponible']
}

export function validarCambioEstado(codigo: string, anterior: EstadoFisico, nuevo: EstadoFisico): void {
  if (anterior === nuevo) throw new ErrorDeNegocio(`${codigo} ya está en estado "${NOMBRE_ESTADO[nuevo]}".`)
  if (!TRANSICIONES[anterior].includes(nuevo)) {
    throw new ErrorDeNegocio(
      `${codigo} está "${NOMBRE_ESTADO[anterior]}" y no puede pasar a "${NOMBRE_ESTADO[nuevo]}".`
    )
  }
}

/** Dar de baja y reactivar son solo para la dueña. */
export function cambioRequiereDuena(anterior: EstadoFisico, nuevo: EstadoFisico): boolean {
  return nuevo === 'baja' || anterior === 'baja'
}

/** Cambios que dejan la unidad sin poder usarse y chocan con una reserva pendiente. */
export function cambioChocaConReserva(nuevo: EstadoFisico): boolean {
  return nuevo === 'reparacion' || nuevo === 'baja'
}
