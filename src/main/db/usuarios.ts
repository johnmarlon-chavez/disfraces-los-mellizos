// Cuentas de acceso: dos cuentas fijas (dueña y trabajadores), sin contraseñas por defecto.
// Las contraseñas y el código de recuperación se guardan solo como hash bcrypt.
import bcrypt from 'bcryptjs'
import type Database from 'better-sqlite3'
import {
  NOMBRE_CUENTA,
  normalizarCodigo,
  problemaDeContrasena,
  type Cuenta,
  type DatosPrimerUso
} from '../../shared/contrasenas'
import { ErrorDeNegocio } from '../errores'
import {
  INTENTOS_ANTES_DE_BLOQUEO,
  generarCodigoRecuperacion,
  mensajeBloqueo,
  mismoCodigo,
  registrarFallo,
  segundosBloqueado,
  type ContadorIntentos
} from '../logica/acceso'
import type { Sesion } from '../sesion'
import { registrarAuditoria } from './auditoria'

const ROL: Record<Cuenta, Sesion['rol']> = { duena: 'admin', trabajadores: 'empleado' }
const OTRA: Record<Cuenta, Cuenta> = { duena: 'trabajadores', trabajadores: 'duena' }

// Costo de bcrypt: ~0,1 s por verificación en bcryptjs; suficiente para una laptop sin red.
let rondas = 10
/** Solo para pruebas: bajar el costo para que corran rápido. */
export function establecerRondasBcrypt(n: number): void {
  rondas = n
}
export function rondasBcrypt(): number {
  return rondas
}

interface FilaUsuario {
  id: number
  contrasena_hash: string
  codigo_recuperacion_hash: string | null
  intentos_fallidos: number
  bloqueos: number
  bloqueado_hasta: string | null
}

function fila(db: Database.Database, cuenta: Cuenta): FilaUsuario | undefined {
  return db
    .prepare<[string], FilaUsuario>(
      `SELECT id, contrasena_hash, codigo_recuperacion_hash, intentos_fallidos, bloqueos, bloqueado_hasta
       FROM usuarios WHERE usuario = ? AND activo = 1`
    )
    .get(cuenta)
}

function filaObligatoria(db: Database.Database, cuenta: Cuenta): FilaUsuario {
  const f = fila(db, cuenta)
  if (!f) throw new ErrorDeNegocio('Todavía no se crearon las cuentas. Cierre y vuelva a abrir el programa.')
  return f
}

const contador = (f: FilaUsuario): ContadorIntentos => ({
  intentosFallidos: f.intentos_fallidos,
  bloqueos: f.bloqueos,
  bloqueadoHasta: f.bloqueado_hasta
})

function guardarContador(db: Database.Database, id: number, c: ContadorIntentos): void {
  db.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueos = ?, bloqueado_hasta = ? WHERE id = ?').run(
    c.intentosFallidos,
    c.bloqueos,
    c.bloqueadoHasta,
    id
  )
}

const hash = (texto: string): string => bcrypt.hashSync(texto, rondas)

export function hayCuentas(db: Database.Database): boolean {
  return fila(db, 'duena') !== undefined
}

/** Valida una contraseña nueva: reglas generales y que no sea igual a la de la otra cuenta. */
function validarNueva(db: Database.Database, cuenta: Cuenta, contrasena: string): void {
  const problema = problemaDeContrasena(contrasena)
  if (problema) throw new ErrorDeNegocio(problema)
  const otra = fila(db, OTRA[cuenta])
  if (otra && bcrypt.compareSync(contrasena, otra.contrasena_hash)) {
    throw new ErrorDeNegocio('La contraseña de la dueña y la de Trabajadores deben ser distintas.')
  }
}

/**
 * Primer uso: crea las dos cuentas una sola vez. `codigoEsperado` es el código de recuperación
 * que se le mostró a la dueña; debe escribirlo de nuevo para comprobar que lo anotó.
 */
export function crearCuentas(db: Database.Database, datos: DatosPrimerUso, codigoEsperado: string | null): Sesion {
  const pDuena = problemaDeContrasena(datos.contrasenaDuena)
  if (pDuena) throw new ErrorDeNegocio(`Contraseña de la dueña: ${pDuena}`)
  const pTrab = problemaDeContrasena(datos.contrasenaTrabajadores)
  if (pTrab) throw new ErrorDeNegocio(`Contraseña de Trabajadores: ${pTrab}`)
  if (datos.contrasenaDuena === datos.contrasenaTrabajadores) {
    throw new ErrorDeNegocio('La contraseña de la dueña y la de Trabajadores deben ser distintas.')
  }
  if (!codigoEsperado) throw new ErrorDeNegocio('Vuelva a empezar: el código de recuperación ya no es válido.')
  if (!mismoCodigo(datos.codigoConfirmado, codigoEsperado)) {
    throw new ErrorDeNegocio('El código de recuperación no coincide. Revise lo que anotó en el papel.')
  }
  const hashDuena = hash(datos.contrasenaDuena)
  const hashTrab = hash(datos.contrasenaTrabajadores)
  const hashCodigo = hash(normalizarCodigo(codigoEsperado))
  return db
    .transaction((): Sesion => {
      if (hayCuentas(db)) throw new ErrorDeNegocio('Las cuentas ya fueron creadas. Ingrese con su contraseña.')
      const insertar = db.prepare(
        `INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, codigo_recuperacion_hash) VALUES (?, ?, ?, ?, ?)`
      )
      const idDuena = Number(insertar.run(NOMBRE_CUENTA.duena, 'duena', hashDuena, 'admin', hashCodigo).lastInsertRowid)
      insertar.run(NOMBRE_CUENTA.trabajadores, 'trabajadores', hashTrab, 'empleado', null)
      const sesion: Sesion = { usuarioId: idDuena, rol: 'admin' }
      registrarAuditoria(db, sesion, 'cuentas_creadas', 'usuarios', idDuena, {})
      return sesion
    })
    .immediate()
}

/** Revisa que la cuenta no esté bloqueada; si lo está, lanza el mensaje con la espera. */
function exigirNoBloqueada(f: FilaUsuario, ahora: Date): void {
  const s = segundosBloqueado(contador(f), ahora)
  if (s > 0) throw new ErrorDeNegocio(mensajeBloqueo(s))
}

/**
 * Compara la contraseña con la de la cuenta y actualiza su contador (cada cuenta tiene el suyo).
 * Devuelve false si no coincide; lanza un error si la cuenta está (o queda) bloqueada.
 */
function comprobar(db: Database.Database, cuenta: Cuenta, secreto: string, campo: 'contrasena' | 'codigo', ahora: Date): boolean {
  const f = filaObligatoria(db, cuenta)
  exigirNoBloqueada(f, ahora)
  const guardado = campo === 'contrasena' ? f.contrasena_hash : f.codigo_recuperacion_hash
  const valor = campo === 'contrasena' ? secreto : normalizarCodigo(secreto)
  if (guardado && valor && bcrypt.compareSync(valor, guardado)) {
    if (f.intentos_fallidos || f.bloqueos || f.bloqueado_hasta) {
      guardarContador(db, f.id, { intentosFallidos: 0, bloqueos: 0, bloqueadoHasta: null })
    }
    return true
  }
  const nuevo = registrarFallo(contador(f), ahora)
  guardarContador(db, f.id, nuevo)
  if (nuevo.bloqueadoHasta) {
    registrarAuditoria(db, null, 'cuenta_bloqueada', 'usuarios', f.id, { cuenta, hasta: nuevo.bloqueadoHasta })
    throw new ErrorDeNegocio(`Se equivocó ${INTENTOS_ANTES_DE_BLOQUEO} veces. ${mensajeBloqueo(segundosBloqueado(nuevo, ahora))}`)
  }
  return false
}

function mensajeFallo(db: Database.Database, cuenta: Cuenta, que: string): string {
  const quedan = INTENTOS_ANTES_DE_BLOQUEO - filaObligatoria(db, cuenta).intentos_fallidos
  return quedan <= 2 ? `${que} Le quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'} antes de esperar.` : que
}

export function iniciarSesion(db: Database.Database, cuenta: Cuenta, contrasena: string, ahora = new Date()): Sesion {
  if (!comprobar(db, cuenta, contrasena, 'contrasena', ahora)) {
    throw new ErrorDeNegocio(mensajeFallo(db, cuenta, 'La contraseña no es correcta.'))
  }
  const f = filaObligatoria(db, cuenta)
  const sesion: Sesion = { usuarioId: f.id, rol: ROL[cuenta] }
  registrarAuditoria(db, sesion, 'inicio_sesion', 'usuarios', f.id, { cuenta })
  return sesion
}

/**
 * Verifica la contraseña de la dueña para autorizar una acción dentro de otra sesión.
 * Usa el contador de la dueña: los fallos de aquí cuentan para bloquear su cuenta.
 */
export function verificarDuena(db: Database.Database, contrasena: string, ahora = new Date()): boolean {
  return comprobar(db, 'duena', contrasena, 'contrasena', ahora)
}

/**
 * La dueña olvidó su contraseña: con el código de recuperación elige una nueva.
 * El código es de un solo uso: se devuelve uno nuevo para anotarlo en papel.
 */
export function recuperarDuena(
  db: Database.Database,
  codigo: string,
  nuevaContrasena: string,
  ahora = new Date()
): { sesion: Sesion; codigoNuevo: string } {
  const problema = problemaDeContrasena(nuevaContrasena)
  if (problema) throw new ErrorDeNegocio(problema)
  if (!comprobar(db, 'duena', codigo, 'codigo', ahora)) {
    throw new ErrorDeNegocio(mensajeFallo(db, 'duena', 'El código de recuperación no es correcto. Revise lo que anotó en el papel.'))
  }
  validarNueva(db, 'duena', nuevaContrasena)
  const codigoNuevo = generarCodigoRecuperacion()
  const f = filaObligatoria(db, 'duena')
  const sesion: Sesion = { usuarioId: f.id, rol: 'admin' }
  db.transaction(() => {
    db.prepare('UPDATE usuarios SET contrasena_hash = ?, codigo_recuperacion_hash = ? WHERE id = ?').run(
      hash(nuevaContrasena),
      hash(normalizarCodigo(codigoNuevo)),
      f.id
    )
    registrarAuditoria(db, sesion, 'contrasena_recuperada', 'usuarios', f.id, { cuenta: 'duena' })
  }).immediate()
  return { sesion, codigoNuevo }
}

/**
 * Cambia una contraseña. La dueña cambia la suya dando la actual; la de Trabajadores
 * la cambia la dueña sin necesidad de la anterior (por ejemplo, cuando alguien deja la tienda).
 */
export function cambiarContrasena(
  db: Database.Database,
  sesion: Sesion | null,
  cuenta: Cuenta,
  actual: string | null,
  nueva: string,
  ahora = new Date()
): void {
  if (sesion?.rol !== 'admin') throw new ErrorDeNegocio('Solo la dueña puede cambiar las contraseñas.')
  if (cuenta === 'duena') {
    if (!actual) throw new ErrorDeNegocio('Escriba su contraseña actual.')
    if (!comprobar(db, 'duena', actual, 'contrasena', ahora)) {
      throw new ErrorDeNegocio(mensajeFallo(db, 'duena', 'Su contraseña actual no es correcta.'))
    }
  }
  validarNueva(db, cuenta, nueva)
  const f = filaObligatoria(db, cuenta)
  db.transaction(() => {
    // Una contraseña nueva también desbloquea la cuenta.
    db.prepare(
      'UPDATE usuarios SET contrasena_hash = ?, intentos_fallidos = 0, bloqueos = 0, bloqueado_hasta = NULL WHERE id = ?'
    ).run(hash(nueva), f.id)
    registrarAuditoria(db, sesion, 'contrasena_cambiada', 'usuarios', f.id, { cuenta })
  }).immediate()
}

/** Nuevo código de recuperación (el anterior deja de servir). Pide la contraseña de la dueña. */
export function nuevoCodigoRecuperacion(db: Database.Database, sesion: Sesion | null, contrasena: string, ahora = new Date()): string {
  if (sesion?.rol !== 'admin') throw new ErrorDeNegocio('Solo la dueña puede pedir un código nuevo.')
  if (!comprobar(db, 'duena', contrasena, 'contrasena', ahora)) {
    throw new ErrorDeNegocio(mensajeFallo(db, 'duena', 'Su contraseña no es correcta.'))
  }
  return guardarCodigoNuevo(db, sesion, 'codigo_recuperacion_nuevo')
}

/**
 * Herramienta de soporte (--restablecer-duena), para cuando la dueña perdió la contraseña y el código:
 * genera un código nuevo y desbloquea su cuenta. No toca ninguna contraseña; con ese código la dueña
 * elige una nueva desde "¿Olvidó su contraseña?". Deja pendiente el aviso para la dueña.
 * Llamar solo desde db/soporte.ts, después de verificar la clave de soporte.
 */
export function restablecerCodigoDuena(db: Database.Database, ahora = new Date()): string {
  filaObligatoria(db, 'duena')
  return guardarCodigoNuevo(db, null, 'codigo_restablecido_soporte', ahora.toISOString())
}

function guardarCodigoNuevo(db: Database.Database, sesion: Sesion | null, accion: string, restablecidoEn: string | null = null): string {
  const codigo = generarCodigoRecuperacion()
  const f = filaObligatoria(db, 'duena')
  db.transaction(() => {
    db.prepare(
      'UPDATE usuarios SET codigo_recuperacion_hash = ?, intentos_fallidos = 0, bloqueos = 0, bloqueado_hasta = NULL WHERE id = ?'
    ).run(hash(normalizarCodigo(codigo)), f.id)
    if (restablecidoEn) db.prepare('UPDATE usuarios SET restablecido_por_soporte_en = ? WHERE id = ?').run(restablecidoEn, f.id)
    registrarAuditoria(db, sesion, accion, 'usuarios', f.id, {})
  }).immediate()
  return codigo
}

/** Instante del restablecimiento por soporte que la dueña todavía no vio, o null. */
export function avisoRestablecimiento(db: Database.Database): string | null {
  const f = db
    .prepare<[], { en: string | null }>("SELECT restablecido_por_soporte_en AS en FROM usuarios WHERE usuario = 'duena'")
    .get()
  return f?.en ?? null
}

/** La dueña pulsó "Entendido" en el aviso de restablecimiento. */
export function marcarAvisoRestablecimientoVisto(db: Database.Database, sesion: Sesion | null): void {
  if (sesion?.rol !== 'admin') throw new ErrorDeNegocio('Solo la dueña puede cerrar este aviso.')
  const en = avisoRestablecimiento(db)
  if (!en) return
  db.transaction(() => {
    db.prepare("UPDATE usuarios SET restablecido_por_soporte_en = NULL WHERE usuario = 'duena'").run()
    registrarAuditoria(db, sesion, 'aviso_restablecimiento_visto', 'usuarios', sesion.usuarioId, { restablecidoEn: en })
  }).immediate()
}

/** Último restablecimiento por soporte (para mostrarlo siempre en Configuración), o null. */
export function ultimoRestablecimientoSoporte(db: Database.Database): string | null {
  const f = db
    .prepare<[], { fecha: string }>("SELECT fecha FROM auditoria WHERE accion = 'codigo_restablecido_soporte' ORDER BY id DESC LIMIT 1")
    .get()
  return f?.fecha ?? null
}

/** Cuenta de una sesión, para mostrar "Sesión: Dueña". */
export function cuentaDeSesion(sesion: Sesion): Cuenta {
  return sesion.rol === 'admin' ? 'duena' : 'trabajadores'
}
