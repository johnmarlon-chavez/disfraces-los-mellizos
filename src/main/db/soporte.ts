// Clave de soporte: protege la herramienta --restablecer-duena. La define el técnico una sola vez
// al instalar (--definir-clave-soporte); se guarda como hash y tiene su propio contador de intentos.
// Cada uso, con éxito o no, queda en auditoría (entidad "soporte", sin usuario).
import bcrypt from 'bcryptjs'
import type Database from 'better-sqlite3'
import { problemaDeClaveSoporte, type EstadoSoporte } from '../../shared/soporte'
import { ErrorDeNegocio } from '../errores'
import {
  INTENTOS_ANTES_DE_BLOQUEO,
  mensajeBloqueo,
  registrarFallo,
  segundosBloqueado,
  type ContadorIntentos
} from '../logica/acceso'
import { registrarAuditoria } from './auditoria'
import { hayCuentas, rondasBcrypt, restablecerCodigoDuena } from './usuarios'

interface FilaSoporte {
  clave_hash: string | null
  intentos_fallidos: number
  bloqueos: number
  bloqueado_hasta: string | null
}

function fila(db: Database.Database): FilaSoporte {
  const f = db
    .prepare<[], FilaSoporte>('SELECT clave_hash, intentos_fallidos, bloqueos, bloqueado_hasta FROM soporte WHERE id = 1')
    .get()
  if (!f) throw new Error('Falta la fila de soporte')
  return f
}

const contador = (f: FilaSoporte): ContadorIntentos => ({
  intentosFallidos: f.intentos_fallidos,
  bloqueos: f.bloqueos,
  bloqueadoHasta: f.bloqueado_hasta
})

function guardarContador(db: Database.Database, c: ContadorIntentos): void {
  db.prepare('UPDATE soporte SET intentos_fallidos = ?, bloqueos = ?, bloqueado_hasta = ? WHERE id = 1').run(
    c.intentosFallidos,
    c.bloqueos,
    c.bloqueadoHasta
  )
}

const auditar = (db: Database.Database, accion: string, detalle: Record<string, unknown> = {}): void =>
  registrarAuditoria(db, null, accion, 'soporte', 1, detalle)

export function estadoSoporte(db: Database.Database, ahora = new Date()): EstadoSoporte {
  const f = fila(db)
  return { hayCuentas: hayCuentas(db), claveDefinida: !!f.clave_hash, segundosBloqueado: segundosBloqueado(contador(f), ahora) }
}

/**
 * Verifica la clave con el límite de intentos (5 fallos → esperas de 1, 5, 15, 30 y 60 minutos).
 * Registra el fallo en auditoría con `herramienta`; lanza el error para la pantalla.
 */
function exigirClave(db: Database.Database, clave: string, herramienta: string, ahora: Date): void {
  const f = fila(db)
  if (!f.clave_hash) {
    auditar(db, 'soporte_sin_clave', { herramienta })
    throw new ErrorDeNegocio('La clave de soporte no fue definida en este equipo. Sin ella, la herramienta no hace nada.')
  }
  const espera = segundosBloqueado(contador(f), ahora)
  if (espera > 0) {
    auditar(db, 'soporte_intento_bloqueado', { herramienta })
    throw new ErrorDeNegocio(mensajeBloqueo(espera))
  }
  if (clave && bcrypt.compareSync(clave, f.clave_hash)) {
    if (f.intentos_fallidos || f.bloqueos || f.bloqueado_hasta) guardarContador(db, { intentosFallidos: 0, bloqueos: 0, bloqueadoHasta: null })
    return
  }
  const nuevo = registrarFallo(contador(f), ahora)
  guardarContador(db, nuevo)
  auditar(db, 'soporte_clave_incorrecta', { herramienta, intentos: f.intentos_fallidos + 1 })
  if (nuevo.bloqueadoHasta) {
    auditar(db, 'soporte_bloqueado', { herramienta, hasta: nuevo.bloqueadoHasta })
    throw new ErrorDeNegocio(`Se equivocó ${INTENTOS_ANTES_DE_BLOQUEO} veces. ${mensajeBloqueo(segundosBloqueado(nuevo, ahora))}`)
  }
  throw new ErrorDeNegocio('La clave de soporte no es correcta.')
}

/**
 * Define la clave de soporte (al instalar) o la cambia. Si ya hay una, hace falta la actual:
 * así nadie puede reemplazarla para usar la herramienta.
 */
export function definirClaveSoporte(db: Database.Database, actual: string | null, nueva: string, ahora = new Date()): void {
  const definida = !!fila(db).clave_hash
  if (definida) exigirClave(db, actual ?? '', 'definir_clave', ahora)
  const problema = problemaDeClaveSoporte(nueva)
  if (problema) throw new ErrorDeNegocio(problema)
  const cuentas = db.prepare<[], { contrasena_hash: string }>('SELECT contrasena_hash FROM usuarios').all()
  if (cuentas.some((c) => bcrypt.compareSync(nueva, c.contrasena_hash))) {
    throw new ErrorDeNegocio('La clave de soporte no puede ser igual a la contraseña de la dueña ni a la de Trabajadores.')
  }
  const hash = bcrypt.hashSync(nueva, rondasBcrypt())
  db.transaction(() => {
    db.prepare(
      'UPDATE soporte SET clave_hash = ?, definida_en = ?, intentos_fallidos = 0, bloqueos = 0, bloqueado_hasta = NULL WHERE id = 1'
    ).run(hash, ahora.toISOString())
    auditar(db, definida ? 'soporte_clave_cambiada' : 'soporte_clave_definida')
  }).immediate()
}

/** --restablecer-duena: con la clave de soporte correcta, código de recuperación nuevo para la dueña. */
export function restablecerConClave(db: Database.Database, clave: string, ahora = new Date()): string {
  if (!hayCuentas(db)) throw new ErrorDeNegocio('Todavía no se crearon las cuentas. Abra el programa normalmente.')
  exigirClave(db, clave, 'restablecer_duena', ahora)
  return restablecerCodigoDuena(db, ahora)
}

/** Cada vez que se abre una herramienta de soporte queda en auditoría, se use o no. */
export function registrarAperturaSoporte(db: Database.Database, herramienta: 'restablecer_duena' | 'definir_clave'): void {
  auditar(db, 'soporte_herramienta_abierta', { herramienta, claveDefinida: !!fila(db).clave_hash })
}
