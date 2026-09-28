import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearServicioAcceso } from '../../src/main/acceso'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as soporte from '../../src/main/db/soporte'
import * as usuarios from '../../src/main/db/usuarios'
import { generarCodigoRecuperacion } from '../../src/main/logica/acceso'
import { nivelDeCanal } from '../../src/main/logica/nivelesIpc'
import { establecerSesion, establecerVerificadorDuena, type Sesion } from '../../src/main/sesion'
import { formatearFecha, formatearHora } from '../../src/shared/formato'

const DUENA = 'mi gato come pan 7'
const TRAB = 'tienda de la esquina'
const CLAVE = 'tecnico de confianza 2026'
const ahora = new Date('2026-09-28T20:05:00Z') // 15:05 en Lima

let db: Database.Database

const acciones = (): string[] =>
  (db.prepare("SELECT accion FROM auditoria WHERE entidad = 'soporte' OR accion LIKE '%soporte%' ORDER BY id").all() as { accion: string }[]).map(
    (f) => f.accion
  )

function crearCuentas(): void {
  const codigo = generarCodigoRecuperacion()
  usuarios.crearCuentas(db, { contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: codigo }, codigo)
}

beforeEach(() => {
  usuarios.establecerRondasBcrypt(4)
  db = abrirBaseDeDatos(':memory:')
  crearCuentas()
})

afterEach(() => {
  establecerSesion(null)
  establecerVerificadorDuena(null)
})

describe('clave de soporte', () => {
  it('sin clave definida, la herramienta no hace nada y queda en auditoría', () => {
    expect(soporte.estadoSoporte(db)).toEqual({ hayCuentas: true, claveDefinida: false, segundosBloqueado: 0 })
    const antes = db.prepare("SELECT codigo_recuperacion_hash FROM usuarios WHERE usuario = 'duena'").get()
    expect(() => soporte.restablecerConClave(db, 'lo que sea', ahora)).toThrow('La clave de soporte no fue definida en este equipo.')
    expect(db.prepare("SELECT codigo_recuperacion_hash FROM usuarios WHERE usuario = 'duena'").get()).toEqual(antes)
    expect(usuarios.avisoRestablecimiento(db)).toBeNull()
    expect(acciones()).toEqual(['soporte_sin_clave'])
  })

  it('se define una vez, como hash, y no puede ser una clave débil ni una contraseña de las cuentas', () => {
    expect(() => soporte.definirClaveSoporte(db, null, 'corta 12', ahora)).toThrow('al menos 12 caracteres')
    expect(() => soporte.definirClaveSoporte(db, null, 'aaaaaaaaaaaaaa', ahora)).toThrow('La clave de soporte repite casi siempre lo mismo')
    expect(() => soporte.definirClaveSoporte(db, null, TRAB, ahora)).toThrow('no puede ser igual a la contraseña')
    soporte.definirClaveSoporte(db, null, CLAVE, ahora)
    expect(soporte.estadoSoporte(db).claveDefinida).toBe(true)
    const todo = JSON.stringify(db.prepare('SELECT * FROM soporte').all()) + JSON.stringify(db.prepare('SELECT * FROM auditoria').all())
    expect(todo).not.toContain(CLAVE)
    expect(acciones()).toEqual(['soporte_clave_definida'])
  })

  it('para cambiarla hace falta la actual (nadie puede reemplazarla para usar la herramienta)', () => {
    soporte.definirClaveSoporte(db, null, CLAVE, ahora)
    expect(() => soporte.definirClaveSoporte(db, null, 'otra clave muy larga', ahora)).toThrow('La clave de soporte no es correcta.')
    expect(() => soporte.definirClaveSoporte(db, 'no es la clave', 'otra clave muy larga', ahora)).toThrow('La clave de soporte no es correcta.')
    soporte.definirClaveSoporte(db, CLAVE, 'otra clave muy larga', ahora)
    expect(() => soporte.restablecerConClave(db, CLAVE, ahora)).toThrow('no es correcta')
    expect(soporte.restablecerConClave(db, 'otra clave muy larga', ahora)).toMatch(/^[A-Z2-9]{4}-/)
    expect(acciones()).toEqual([
      'soporte_clave_definida',
      'soporte_clave_incorrecta',
      'soporte_clave_incorrecta',
      'soporte_clave_cambiada',
      'soporte_clave_incorrecta',
      'codigo_restablecido_soporte'
    ])
  })

  it('con la clave correcta: código nuevo, cuenta desbloqueada y aviso pendiente para la dueña', () => {
    soporte.definirClaveSoporte(db, null, CLAVE, ahora)
    const codigo = soporte.restablecerConClave(db, CLAVE, ahora)
    expect(usuarios.avisoRestablecimiento(db)).toBe(ahora.toISOString())
    expect(usuarios.recuperarDuena(db, codigo, 'diablada de puno', ahora).sesion.rol).toBe('admin')
    expect(usuarios.ultimoRestablecimientoSoporte(db)).not.toBeNull()
  })

  it('límite de intentos propio: 5 fallos bloquean, y cada intento queda en auditoría', () => {
    soporte.definirClaveSoporte(db, null, CLAVE, ahora)
    for (let i = 0; i < 4; i++) expect(() => soporte.restablecerConClave(db, 'intento', ahora)).toThrow('La clave de soporte no es correcta.')
    expect(() => soporte.restablecerConClave(db, 'intento', ahora)).toThrow('Se equivocó 5 veces. Por seguridad, espere 60 segundos')
    expect(() => soporte.restablecerConClave(db, CLAVE, ahora)).toThrow('Por seguridad, espere')
    expect(soporte.estadoSoporte(db, ahora).segundosBloqueado).toBe(60)
    expect(usuarios.avisoRestablecimiento(db)).toBeNull()
    // Los fallos de soporte no bloquean a la dueña
    expect(usuarios.iniciarSesion(db, 'duena', DUENA, ahora).rol).toBe('admin')
    // Pasada la espera, la clave correcta funciona y reinicia el contador
    expect(soporte.restablecerConClave(db, CLAVE, new Date(ahora.getTime() + 61_000))).toMatch(/^[A-Z2-9]{4}-/)
    expect(db.prepare('SELECT intentos_fallidos, bloqueos, bloqueado_hasta FROM soporte').get()).toEqual({
      intentos_fallidos: 0,
      bloqueos: 0,
      bloqueado_hasta: null
    })
    expect(acciones()).toEqual([
      'soporte_clave_definida',
      ...Array(5).fill('soporte_clave_incorrecta').flatMap((a, i) => (i === 4 ? [a, 'soporte_bloqueado'] : [a])),
      'soporte_intento_bloqueado',
      'codigo_restablecido_soporte'
    ])
  })

  it('la apertura de la herramienta queda en auditoría', () => {
    soporte.registrarAperturaSoporte(db, 'restablecer_duena')
    const f = db.prepare("SELECT usuario_id, detalle FROM auditoria WHERE accion = 'soporte_herramienta_abierta'").get() as {
      usuario_id: number | null
      detalle: string
    }
    expect(f.usuario_id).toBeNull()
    expect(JSON.parse(f.detalle)).toEqual({ herramienta: 'restablecer_duena', claveDefinida: false })
  })
})

describe('aviso a la dueña', () => {
  it('se muestra en la sesión de la dueña hasta que pulsa "Entendido"', () => {
    soporte.definirClaveSoporte(db, null, CLAVE, ahora)
    soporte.restablecerConClave(db, CLAVE, ahora)
    const acceso = crearServicioAcceso(db)
    acceso.ingresar('trabajadores', TRAB)
    expect(acceso.estado().avisoRestablecido).toBeNull()
    const empleado: Sesion = { usuarioId: 2, rol: 'empleado' }
    expect(() => usuarios.marcarAvisoRestablecimientoVisto(db, empleado)).toThrow('Solo la dueña')

    acceso.ingresar('duena', DUENA)
    expect(acceso.estado().avisoRestablecido).toBe(ahora.toISOString())
    usuarios.marcarAvisoRestablecimientoVisto(db, { usuarioId: 1, rol: 'admin' })
    expect(acceso.estado().avisoRestablecido).toBeNull()
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'aviso_restablecimiento_visto'").get()).toEqual({ n: 1 })
  })

  it('fecha y hora en Lima para el mensaje', () => {
    expect(`${formatearFecha(ahora)} ${formatearHora(ahora)}`).toBe('28/09/2026 15:05')
    expect(formatearHora(new Date('2026-09-29T04:30:00Z'))).toBe('23:30')
  })
})

describe('niveles de los canales de soporte', () => {
  it('los de la ventana de soporte son públicos (solo existen en esa ventana); el aviso es de la dueña', () => {
    expect(nivelDeCanal('soporte:restablecer')).toBe('publico')
    expect(nivelDeCanal('soporte:definirClave')).toBe('publico')
    expect(nivelDeCanal('acceso:avisoVisto')).toBe('duena')
    expect(nivelDeCanal('acceso:resumenSoporte')).toBe('duena')
  })
})
