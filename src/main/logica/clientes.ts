// Reglas de negocio de clientes. Funciones puras, sin base de datos.
import {
  NOMBRE_DOCUMENTO,
  TIPOS_DOCUMENTO,
  normalizarDistrito,
  soloDigitosTelefono,
  type DatosCliente,
  type TipoDocumento
} from '../../shared/clientes'
import { normalizarTexto } from '../../shared/disfraces'
import { ErrorDeNegocio } from '../errores'

function textoObligatorio(valor: string, mensajeVacio: string, maximo: number, etiqueta: string): string {
  const limpio = valor.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeNegocio(mensajeVacio)
  if (limpio.length > maximo) throw new ErrorDeNegocio(`${etiqueta} es demasiado largo (máximo ${maximo} letras).`)
  return limpio
}

function textoOpcional(valor: string, maximo: number, etiqueta: string): string {
  const limpio = valor.trim()
  if (limpio.length > maximo) throw new ErrorDeNegocio(`${etiqueta} es demasiado largo (máximo ${maximo} letras).`)
  return limpio
}

/** DNI: 8 dígitos. Carné de extranjería y pasaporte: 6 a 12 letras o números. Se guarda sin espacios ni guiones. */
export function validarDocumento(tipo: TipoDocumento, numero: string): string {
  if (!TIPOS_DOCUMENTO.includes(tipo)) throw new ErrorDeNegocio('Elija el tipo de documento.')
  const limpio = numero.replace(/[\s.-]/g, '').toUpperCase()
  if (!limpio) throw new ErrorDeNegocio(`Escriba el número de ${NOMBRE_DOCUMENTO[tipo]}.`)
  if (tipo === 'dni') {
    if (!/^\d{8}$/.test(limpio)) throw new ErrorDeNegocio('El DNI debe tener 8 dígitos.')
  } else if (!/^[A-Z0-9]{6,12}$/.test(limpio)) {
    throw new ErrorDeNegocio(`El ${NOMBRE_DOCUMENTO[tipo].toLowerCase()} debe tener de 6 a 12 letras o números.`)
  }
  return limpio
}

export function validarDniResponsable(dni: string): string {
  const limpio = dni.replace(/[\s.-]/g, '')
  if (!limpio) throw new ErrorDeNegocio('Escriba el DNI de la responsable.')
  if (!/^\d{8}$/.test(limpio)) throw new ErrorDeNegocio('El DNI de la responsable debe tener 8 dígitos.')
  return limpio
}

/** RUC opcional: 11 dígitos que empiezan con 10, 15, 17 o 20. Devuelve null si está vacío. */
export function validarRuc(ruc: string): string | null {
  const limpio = ruc.replace(/[\s.-]/g, '')
  if (!limpio) return null
  if (!/^(10|15|17|20)\d{9}$/.test(limpio)) {
    throw new ErrorDeNegocio('El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.')
  }
  return limpio
}

/**
 * Teléfono obligatorio. Celular: 9 dígitos que empiezan con 9. Fijo: con código de
 * ciudad (044 123456, 01 1234567) o solo el número local (6 o 7 dígitos).
 * Acepta espacios, guiones y +51. Se guarda solo con dígitos.
 */
export function validarTelefono(telefono: string): string {
  const d = soloDigitosTelefono(telefono)
  if (!d) throw new ErrorDeNegocio('Escriba un teléfono de contacto.')
  if (/^9\d{8}$/.test(d)) return d
  if (/^0\d{7,8}$/.test(d) || /^[1-8]\d{5,6}$/.test(d)) return d
  if (d.startsWith('9')) {
    throw new ErrorDeNegocio('El celular debe tener 9 dígitos y empezar con 9, por ejemplo 987 654 321.')
  }
  throw new ErrorDeNegocio(
    'El teléfono no es válido. Escriba un celular de 9 dígitos (987 654 321) o un fijo con su código (044 123456).'
  )
}

export function validarDistrito(distrito: string): string {
  const limpio = normalizarDistrito(distrito)
  if (!limpio) throw new ErrorDeNegocio('Escriba el distrito del colegio.')
  if (limpio.length > 60) throw new ErrorDeNegocio('El distrito es demasiado largo (máximo 60 letras).')
  return limpio
}

/** Datos validados y normalizados, listos para guardar. */
export interface ClienteValidado {
  tipo: 'persona' | 'colegio'
  tipoDocumento: TipoDocumento | null
  numeroDocumento: string | null
  nombres: string
  responsable: string
  dniResponsable: string | null
  distrito: string
  ruc: string | null
  telefono: string
  direccion: string
  observaciones: string
}

export function validarCliente(datos: DatosCliente): ClienteValidado {
  const comunes = {
    telefono: validarTelefono(datos.telefono),
    direccion: textoOpcional(datos.direccion, 150, 'La dirección'),
    observaciones: textoOpcional(datos.observaciones, 500, 'Las observaciones')
  }
  if (datos.tipo === 'persona') {
    return {
      tipo: 'persona',
      tipoDocumento: datos.tipoDocumento,
      numeroDocumento: validarDocumento(datos.tipoDocumento, datos.numeroDocumento),
      nombres: textoObligatorio(datos.nombres, 'Escriba los nombres y apellidos.', 100, 'El nombre'),
      responsable: '',
      dniResponsable: null,
      distrito: '',
      ruc: null,
      ...comunes
    }
  }
  if (datos.tipo === 'colegio') {
    return {
      tipo: 'colegio',
      tipoDocumento: null,
      numeroDocumento: null,
      nombres: textoObligatorio(datos.nombres, 'Escriba el nombre del colegio.', 120, 'El nombre del colegio'),
      responsable: textoObligatorio(
        datos.responsable,
        'Escriba el nombre de la responsable (profesora o coordinadora).',
        100,
        'El nombre de la responsable'
      ),
      dniResponsable: validarDniResponsable(datos.dniResponsable),
      distrito: validarDistrito(datos.distrito),
      ruc: validarRuc(datos.ruc),
      ...comunes
    }
  }
  throw new ErrorDeNegocio('Elija si el cliente es una persona o un colegio.')
}

// ---------- Colegios parecidos ----------

// Palabras que no distinguen a un colegio de otro.
const PALABRAS_GENERICAS = new Set([
  'i', 'e', 'p', 'ie', 'iep', 'iiee', 'institucion', 'educativa', 'privada', 'publica', 'colegio',
  'escuela', 'n', 'no', 'nro', 'numero', 'de', 'del', 'la', 'el', 'los', 'las', 'y'
])

/** "I.E. N.° 80001 San Juan" -> ["80001", "san", "juan"] */
export function palabrasClaveColegio(nombre: string): string[] {
  return normalizarTexto(nombre)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && !PALABRAS_GENERICAS.has(p))
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = arriba
    }
  }
  return fila[b.length]
}

/** Mismo colegio: mismas palabras clave (ignorando "I.E.", "N.°", tildes...) y mismo distrito. */
export function esMismoColegio(a: { nombres: string; distrito: string }, b: { nombres: string; distrito: string }): boolean {
  const ka = palabrasClaveColegio(a.nombres).join(' ')
  return ka !== '' && ka === palabrasClaveColegio(b.nombres).join(' ') && normalizarTexto(a.distrito) === normalizarTexto(b.distrito)
}

/**
 * Nombres que probablemente son el mismo colegio escrito distinto:
 * - mismas palabras clave, o
 * - comparten la mayoría de palabras, o
 * - difieren en una o dos letras ("Santa Rosa" / "Santa Rossa").
 * Si ambos tienen número y los números son distintos, son colegios distintos (80001 ≠ 80002).
 */
export function sonColegiosParecidos(a: string, b: string): boolean {
  const pa = palabrasClaveColegio(a)
  const pb = palabrasClaveColegio(b)
  if (pa.length === 0 || pb.length === 0) return false

  const numerosA = pa.filter((p) => /^\d+$/.test(p))
  const numerosB = pb.filter((p) => /^\d+$/.test(p))
  if (numerosA.length > 0 && numerosB.length > 0 && !numerosA.some((n) => numerosB.includes(n))) return false

  const ja = pa.join(' ')
  const jb = pb.join(' ')
  if (ja === jb) return true

  const comunes = pa.filter((p) => pb.includes(p)).length
  const union = new Set([...pa, ...pb]).size
  if (comunes / union >= 0.6) return true

  const sa = pa.join('')
  const sb = pb.join('')
  return Math.min(sa.length, sb.length) >= 6 && distancia(sa, sb) <= 2
}
