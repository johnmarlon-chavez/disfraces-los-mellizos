// Reglas de acceso, puras: código de recuperación, bloqueo por intentos y sesión de la dueña.
import { randomInt } from 'node:crypto'
import { normalizarCodigo } from '../../shared/contrasenas'

// Sin caracteres que se confunden al leer o escribir a mano: 0/O, 1/I/L.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Código de recuperación de 12 caracteres, en tres grupos: "K7QM-3XPA-9TRD". */
export function generarCodigoRecuperacion(azar: (n: number) => number = randomInt): string {
  const c = Array.from({ length: 12 }, () => ALFABETO[azar(ALFABETO.length)]).join('')
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`
}

export function mismoCodigo(a: string, b: string): boolean {
  return normalizarCodigo(a) === normalizarCodigo(b)
}

export const INTENTOS_ANTES_DE_BLOQUEO = 5
const ESPERAS_MINUTOS = [1, 5, 15, 30, 60]

/** Espera tras el n-ésimo bloqueo seguido (1.°: 1 minuto, 2.°: 5, luego 15, 30 y 60). */
export function minutosDeEspera(bloqueo: number): number {
  return ESPERAS_MINUTOS[Math.min(Math.max(bloqueo, 1), ESPERAS_MINUTOS.length) - 1]
}

export interface ContadorIntentos {
  intentosFallidos: number
  bloqueos: number
  /** Instante ISO hasta el que la cuenta está bloqueada, o null. */
  bloqueadoHasta: string | null
}

/** Nuevo estado del contador tras un fallo. Cada cuenta tiene el suyo. */
export function registrarFallo(c: ContadorIntentos, ahora: Date): ContadorIntentos {
  const intentos = c.intentosFallidos + 1
  if (intentos < INTENTOS_ANTES_DE_BLOQUEO) return { ...c, intentosFallidos: intentos }
  const bloqueos = c.bloqueos + 1
  return {
    intentosFallidos: 0,
    bloqueos,
    bloqueadoHasta: new Date(ahora.getTime() + minutosDeEspera(bloqueos) * 60_000).toISOString()
  }
}

export function segundosBloqueado(c: ContadorIntentos, ahora: Date): number {
  if (!c.bloqueadoHasta) return 0
  return Math.max(0, Math.ceil((new Date(c.bloqueadoHasta).getTime() - ahora.getTime()) / 1000))
}

export function mensajeBloqueo(segundos: number): string {
  const minutos = Math.ceil(segundos / 60)
  const espera = segundos <= 60 ? `${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}` : `${minutos} minutos`
  return `Por seguridad, espere ${espera} antes de volver a intentarlo.`
}

/**
 * Sesión con control de inactividad. Se usa un reloj monótono (no la hora del sistema),
 * así un cambio de hora de la laptop no cierra ni alarga la sesión.
 */
export class ControlInactividad {
  private ultima: number
  constructor(
    private readonly limiteMs: number,
    private readonly reloj: () => number = () => performance.now()
  ) {
    this.ultima = reloj()
  }
  tocar(): void {
    this.ultima = this.reloj()
  }
  vencida(): boolean {
    return this.reloj() - this.ultima > this.limiteMs
  }
}
