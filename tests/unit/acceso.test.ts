import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crearServicioAcceso, ErrorSinSesion } from '../../src/main/acceso'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import { actualizarConfiguracion, obtenerConfiguracion } from '../../src/main/db/configuracion'
import * as usuarios from '../../src/main/db/usuarios'
import {
  ControlInactividad,
  generarCodigoRecuperacion,
  mensajeBloqueo,
  minutosDeEspera,
  mismoCodigo,
  registrarFallo,
  segundosBloqueado
} from '../../src/main/logica/acceso'
import { accionDeCanal, nivelDeCanal } from '../../src/main/logica/nivelesIpc'
import { establecerSesion, establecerVerificadorDuena, exigirDuena, obtenerSesion, type Sesion } from '../../src/main/sesion'
import { fuerzaDeContrasena, problemaDeContrasena } from '../../src/shared/contrasenas'

const DUENA = 'mi gato come pan 7'
const TRAB = 'tienda de la esquina'

describe('reglas de contraseña', () => {
  it.each([
    ['corta', 'abc12'],
    ['secuencia numérica', '12345678'],
    ['secuencia al revés', '87654321'],
    ['secuencia de letras', 'abcdefgh'],
    ['teclado', 'qwertyuiop'],
    ['repetida', 'aaaaaaaa'],
    ['casi repetida', 'abababab'],
    ['palabra obvia', 'contraseña'],
    ['obvia con números', 'password123'],
    ['nombre de la tienda', 'Mellizos2026'],
    ['ciudad', 'trujillo1'],
    ['nombre de la cuenta', 'Trabajadores'],
    ['fecha', '15081990'],
    ['pocos números', '48213957'],
    ['espacios de relleno', '   ab    ']
  ])('rechaza %s', (_caso, c) => {
    expect(problemaDeContrasena(c)).not.toBeNull()
  })

  it.each(['mi gato come pan 7', 'Rosa del 2024!', 'tienda de la esquina', '4829175063', 'huaylas ayacucho'])('acepta "%s"', (c) => {
    expect(problemaDeContrasena(c)).toBeNull()
  })

  it('el mensaje es claro y sugiere una frase', () => {
    expect(problemaDeContrasena('12345678')).toBe(
      'La contraseña es una secuencia muy fácil de adivinar (como 12345678). Pruebe con una frase corta que recuerde, como «mi gato come pan 7».'
    )
  })

  it('indicador: muy fácil, aceptable y buena', () => {
    expect(fuerzaDeContrasena('12345678')).toBe('muy_facil')
    expect(fuerzaDeContrasena('rosales7')).toBe('aceptable')
    expect(fuerzaDeContrasena('mi gato come pan 7')).toBe('buena')
  })
})

describe('código de recuperación', () => {
  it('formato XXXX-XXXX-XXXX sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigoRecuperacion()
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(c).not.toMatch(/[01OIL]/)
    }
  })

  it('se compara sin importar guiones, espacios ni mayúsculas', () => {
    expect(mismoCodigo('ab2c-de3f-gh4j', 'AB2CDE3F GH4J')).toBe(true)
    expect(mismoCodigo('AB2C-DE3F-GH4J', 'AB2C-DE3F-GH4K')).toBe(false)
  })
})

describe('bloqueo por intentos (lógica)', () => {
  const inicio = new Date('2026-09-28T15:00:00Z')

  it('mensaje de espera', () => {
    expect(mensajeBloqueo(1)).toBe('Por seguridad, espere 1 segundo antes de volver a intentarlo.')
    expect(mensajeBloqueo(45)).toBe('Por seguridad, espere 45 segundos antes de volver a intentarlo.')
    expect(mensajeBloqueo(61)).toBe('Por seguridad, espere 2 minutos antes de volver a intentarlo.')
  })

  it('5 fallos bloquean con esperas crecientes: 1, 5, 15, 30 y 60 minutos', () => {
    expect([1, 2, 3, 4, 5, 6].map(minutosDeEspera)).toEqual([1, 5, 15, 30, 60, 60])
    let c = { intentosFallidos: 0, bloqueos: 0, bloqueadoHasta: null as string | null }
    for (let i = 0; i < 4; i++) c = registrarFallo(c, inicio)
    expect(c.bloqueadoHasta).toBeNull()
    c = registrarFallo(c, inicio)
    expect(segundosBloqueado(c, inicio)).toBe(60)
    for (let i = 0; i < 5; i++) c = registrarFallo(c, inicio)
    expect(segundosBloqueado(c, inicio)).toBe(5 * 60)
    expect(segundosBloqueado(c, new Date(inicio.getTime() + 5 * 60_000))).toBe(0)
  })
})

describe('inactividad', () => {
  it('vence tras el límite, y la actividad la reinicia', () => {
    let t = 0
    const c = new ControlInactividad(1000, () => t)
    t = 900
    expect(c.vencida()).toBe(false)
    c.tocar()
    t = 1800
    expect(c.vencida()).toBe(false)
    t = 2001
    expect(c.vencida()).toBe(true)
  })
})

describe('niveles de acceso del IPC', () => {
  it('la pantalla de ingreso solo usa canales públicos', () => {
    for (const c of ['app:info', 'acceso:estado', 'acceso:prepararCodigo', 'acceso:crearCuentas', 'acceso:ingresar', 'acceso:recuperar', 'acceso:salir'] as const) {
      expect(nivelDeCanal(c)).toBe('publico')
    }
  })

  it('todo lo demás exige sesión, y reportes, configuración y contraseñas son solo de la dueña', () => {
    expect(nivelDeCanal('pedidos:crear')).toBe('sesion')
    expect(nivelDeCanal('modelos:darDeBaja')).toBe('sesion') // pide la contraseña de la dueña en el diálogo
    expect(nivelDeCanal('acceso:verificarDuena')).toBe('sesion')
    expect(nivelDeCanal('config:obtener')).toBe('sesion')
    expect(nivelDeCanal('inicio:datos')).toBe('sesion')
    for (const c of ['reportes:ingresos', 'reportes:deudas', 'config:actualizar', 'acceso:cambiarContrasenaTrabajadores', 'acceso:nuevoCodigo'] as const) {
      expect(nivelDeCanal(c)).toBe('duena')
    }
    expect(accionDeCanal('reportes:medios')).toBe('ver los reportes')
  })
})

describe('cuentas en la base', () => {
  let db: Database.Database
  const ahora = new Date('2026-09-28T15:00:00Z')

  beforeEach(() => {
    usuarios.establecerRondasBcrypt(4)
    db = abrirBaseDeDatos(':memory:')
  })

  afterEach(() => {
    establecerSesion(null)
    establecerVerificadorDuena(null)
  })

  function crear(): string {
    const codigo = generarCodigoRecuperacion()
    usuarios.crearCuentas(db, { contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: codigo }, codigo)
    return codigo
  }

  it('sin cuentas al instalar: no hay contraseñas por defecto', () => {
    expect(usuarios.hayCuentas(db)).toBe(false)
    expect(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get()).toEqual({ n: 0 })
    expect(() => usuarios.iniciarSesion(db, 'duena', 'cualquier cosa')).toThrow('Todavía no se crearon las cuentas')
  })

  it('primer uso: crea las dos cuentas una sola vez, con hash y sin texto en claro', () => {
    const codigo = crear()
    expect(usuarios.hayCuentas(db)).toBe(true)
    const filas = db.prepare('SELECT usuario, rol, contrasena_hash, codigo_recuperacion_hash FROM usuarios ORDER BY id').all() as Record<string, string | null>[]
    expect(filas.map((f) => [f.usuario, f.rol])).toEqual([['duena', 'admin'], ['trabajadores', 'empleado']])
    const todo = JSON.stringify(db.prepare('SELECT * FROM usuarios').all()) + JSON.stringify(db.prepare('SELECT * FROM auditoria').all())
    for (const secreto of [DUENA, TRAB, codigo, codigo.replace(/-/g, '')]) expect(todo).not.toContain(secreto)
    expect(filas[0].contrasena_hash).toMatch(/^\$2[aby]\$/)
    expect(filas[1].codigo_recuperacion_hash).toBeNull()
    expect(() => crear()).toThrow('Las cuentas ya fueron creadas')
  })

  it('primer uso: valida contraseñas distintas y el código anotado', () => {
    const codigo = 'AAAA-BBBB-CCCC'
    const base = { contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: codigo }
    expect(() => usuarios.crearCuentas(db, { ...base, contrasenaTrabajadores: DUENA }, codigo)).toThrow('deben ser distintas')
    expect(() => usuarios.crearCuentas(db, { ...base, contrasenaDuena: '12345678' }, codigo)).toThrow('Contraseña de la dueña:')
    expect(() => usuarios.crearCuentas(db, { ...base, codigoConfirmado: 'AAAA-BBBB-CCCD' }, codigo)).toThrow('no coincide')
    expect(() => usuarios.crearCuentas(db, base, null)).toThrow('Vuelva a empezar')
    expect(usuarios.hayCuentas(db)).toBe(false)
    usuarios.crearCuentas(db, { ...base, codigoConfirmado: 'aaaa bbbb cccc' }, codigo)
    expect(usuarios.hayCuentas(db)).toBe(true)
  })

  it('ingreso correcto de cada cuenta, con su rol y auditoría', () => {
    crear()
    const d = usuarios.iniciarSesion(db, 'duena', DUENA, ahora)
    const t = usuarios.iniciarSesion(db, 'trabajadores', TRAB, ahora)
    expect(d.rol).toBe('admin')
    expect(t.rol).toBe('empleado')
    expect(() => usuarios.iniciarSesion(db, 'trabajadores', DUENA, ahora)).toThrow('La contraseña no es correcta.')
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'inicio_sesion'").get()).toEqual({ n: 2 })
  })

  it('bloqueo con contadores separados: los fallos de Trabajadores no bloquean a la dueña', () => {
    crear()
    for (let i = 0; i < 3; i++) expect(() => usuarios.iniciarSesion(db, 'trabajadores', 'no es esta', ahora)).toThrow('La contraseña no es correcta.')
    expect(() => usuarios.iniciarSesion(db, 'trabajadores', 'no es esta', ahora)).toThrow('Le quedan 1 intento antes de esperar.')
    expect(() => usuarios.iniciarSesion(db, 'trabajadores', 'no es esta', ahora)).toThrow('Se equivocó 5 veces. Por seguridad, espere 60 segundos')
    // Bloqueada: ni con la contraseña correcta
    expect(() => usuarios.iniciarSesion(db, 'trabajadores', TRAB, ahora)).toThrow('Por seguridad, espere')
    // La dueña entra sin problema
    expect(usuarios.iniciarSesion(db, 'duena', DUENA, ahora).rol).toBe('admin')
    // Pasado el minuto, Trabajadores entra y el contador se reinicia
    const despues = new Date(ahora.getTime() + 61_000)
    expect(usuarios.iniciarSesion(db, 'trabajadores', TRAB, despues).rol).toBe('empleado')
    expect(db.prepare("SELECT intentos_fallidos, bloqueos, bloqueado_hasta FROM usuarios WHERE usuario = 'trabajadores'").get()).toEqual({
      intentos_fallidos: 0,
      bloqueos: 0,
      bloqueado_hasta: null
    })
  })

  it('las esperas crecen si se sigue fallando', () => {
    crear()
    const fallar5 = (cuando: Date): void => {
      for (let i = 0; i < 5; i++) {
        try {
          usuarios.iniciarSesion(db, 'duena', 'no es esta', cuando)
        } catch {
          /* se espera */
        }
      }
    }
    fallar5(ahora)
    const t2 = new Date(ahora.getTime() + 61_000)
    fallar5(t2)
    expect(() => usuarios.iniciarSesion(db, 'duena', DUENA, new Date(t2.getTime() + 2 * 60_000))).toThrow('espere 3 minutos')
    expect(usuarios.iniciarSesion(db, 'duena', DUENA, new Date(t2.getTime() + 5 * 60_000 + 1000)).rol).toBe('admin')
  })

  it('la autorización de la dueña usa su contador (y el verificador de exigirDuena)', () => {
    crear()
    crearServicioAcceso(db)
    const empleado: Sesion = { usuarioId: 2, rol: 'empleado' }
    expect(() => exigirDuena(empleado, 'dar de baja', { contrasena: DUENA })).not.toThrow()
    expect(() => exigirDuena(empleado, 'dar de baja', { contrasena: TRAB })).toThrow('La contraseña de la dueña no es correcta.')
    expect(() => exigirDuena(empleado, 'dar de baja', null)).toThrow('Solo la dueña puede dar de baja.')
    expect(db.prepare("SELECT intentos_fallidos FROM usuarios WHERE usuario = 'duena'").get()).toEqual({ intentos_fallidos: 1 })
    expect(db.prepare("SELECT intentos_fallidos FROM usuarios WHERE usuario = 'trabajadores'").get()).toEqual({ intentos_fallidos: 0 })
  })

  it('recuperación con el código: de un solo uso, entrega uno nuevo', () => {
    const codigo = crear()
    expect(() => usuarios.recuperarDuena(db, 'AAAA-BBBB-CCCC', 'nueva frase secreta', ahora)).toThrow('El código de recuperación no es correcto.')
    expect(() => usuarios.recuperarDuena(db, codigo, TRAB, ahora)).toThrow('deben ser distintas')
    const { sesion, codigoNuevo } = usuarios.recuperarDuena(db, codigo.toLowerCase(), 'nueva frase secreta', ahora)
    expect(sesion.rol).toBe('admin')
    expect(codigoNuevo).not.toBe(codigo)
    expect(() => usuarios.iniciarSesion(db, 'duena', DUENA, ahora)).toThrow('no es correcta')
    expect(usuarios.iniciarSesion(db, 'duena', 'nueva frase secreta', ahora).rol).toBe('admin')
    // El código usado ya no sirve; el nuevo sí
    expect(() => usuarios.recuperarDuena(db, codigo, 'otra frase secreta', ahora)).toThrow('no es correcto')
    expect(() => usuarios.recuperarDuena(db, codigoNuevo, 'otra frase secreta', ahora)).not.toThrow()
  })

  it('cambios de contraseña: la dueña da la actual; la de Trabajadores no la necesita', () => {
    crear()
    const duena = usuarios.iniciarSesion(db, 'duena', DUENA, ahora)
    const trab = usuarios.iniciarSesion(db, 'trabajadores', TRAB, ahora)
    expect(() => usuarios.cambiarContrasena(db, trab, 'trabajadores', null, 'otra frase buena')).toThrow('Solo la dueña')
    expect(() => usuarios.cambiarContrasena(db, duena, 'duena', 'equivocada', 'otra frase buena', ahora)).toThrow('Su contraseña actual no es correcta.')
    expect(() => usuarios.cambiarContrasena(db, duena, 'trabajadores', null, DUENA)).toThrow('deben ser distintas')
    usuarios.cambiarContrasena(db, duena, 'trabajadores', null, 'caporales del norte')
    expect(() => usuarios.iniciarSesion(db, 'trabajadores', TRAB, ahora)).toThrow('no es correcta')
    expect(usuarios.iniciarSesion(db, 'trabajadores', 'caporales del norte', ahora).rol).toBe('empleado')
    usuarios.cambiarContrasena(db, duena, 'duena', DUENA, 'marinera en la plaza', ahora)
    expect(usuarios.iniciarSesion(db, 'duena', 'marinera en la plaza', ahora).rol).toBe('admin')
    const acciones = (db.prepare("SELECT detalle FROM auditoria WHERE accion = 'contrasena_cambiada'").all() as { detalle: string }[]).map((f) => f.detalle)
    expect(acciones).toEqual(['{"cuenta":"trabajadores"}', '{"cuenta":"duena"}'])
  })

  it('código nuevo desde Configuración y herramienta de soporte', () => {
    const codigo = crear()
    const duena = usuarios.iniciarSesion(db, 'duena', DUENA, ahora)
    expect(() => usuarios.nuevoCodigoRecuperacion(db, duena, 'equivocada', ahora)).toThrow('no es correcta')
    const nuevo = usuarios.nuevoCodigoRecuperacion(db, duena, DUENA, ahora)
    expect(() => usuarios.recuperarDuena(db, codigo, 'otra frase buena', ahora)).toThrow('no es correcto')
    // Soporte: dueña bloqueada, sin código a mano
    for (let i = 0; i < 5; i++) {
      try {
        usuarios.iniciarSesion(db, 'duena', 'no es esta', ahora)
      } catch {
        /* se espera */
      }
    }
    const soporte = usuarios.restablecerCodigoDuena(db)
    expect(soporte).not.toBe(nuevo)
    expect(usuarios.recuperarDuena(db, soporte, 'otra frase buena', ahora).sesion.rol).toBe('admin')
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'codigo_restablecido_soporte'").get()).toEqual({ n: 1 })
  })
})

describe('servicio de sesión', () => {
  let db: Database.Database
  beforeEach(() => {
    usuarios.establecerRondasBcrypt(4)
    db = abrirBaseDeDatos(':memory:')
  })
  afterEach(() => {
    establecerSesion(null)
    establecerVerificadorDuena(null)
  })

  it('primer uso con el código preparado abre la sesión de la dueña', () => {
    const acceso = crearServicioAcceso(db)
    expect(acceso.estado()).toMatchObject({ hayCuentas: false, sesion: null })
    expect(() => acceso.exigirSesion()).toThrow(ErrorSinSesion)
    const codigo = acceso.prepararCodigo()
    acceso.crearCuentas({ contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: codigo })
    expect(acceso.estado()).toMatchObject({ hayCuentas: true, sesion: { cuenta: 'duena', nombre: 'Dueña' } })
    expect(() => acceso.prepararCodigo()).toThrow('ya fueron creadas')
  })

  it('la sesión de la dueña se cierra sola sin actividad; la de Trabajadores no', () => {
    let t = 0
    const acceso = crearServicioAcceso(db, { inactividadMs: 10 * 60_000, reloj: () => t })
    acceso.crearCuentas({ contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: acceso.prepararCodigo() })
    t = 9 * 60_000
    acceso.actividad()
    t = 19 * 60_000
    expect(acceso.exigirSesion().rol).toBe('admin') // tocó a los 9 minutos
    t = 19 * 60_000 + 31_000 // 10 minutos + margen del latido
    expect(() => acceso.exigirSesion()).toThrow(ErrorSinSesion)
    expect(obtenerSesion()).toBeNull()
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'sesion_cerrada_inactividad'").get()).toEqual({ n: 1 })

    acceso.ingresar('trabajadores', TRAB)
    t += 5 * 60 * 60_000
    expect(acceso.exigirSesion().rol).toBe('empleado')
    acceso.salir()
    expect(acceso.estado().sesion).toBeNull()
  })
})

describe('configuración editable', () => {
  let db: Database.Database
  const duena: Sesion = { usuarioId: 1, rol: 'admin' }
  beforeEach(() => {
    db = abrirBaseDeDatos(':memory:')
    db.exec(`INSERT INTO usuarios (id, nombre, usuario, contrasena_hash, rol) VALUES
      (1, 'Dueña', 'duena', 'x', 'admin'), (2, 'Trabajadores', 'trabajadores', 'x', 'empleado')`)
  })

  it('guarda los cambios con auditoría del antes y el después', () => {
    actualizarConfiguracion(db, { moraPorDia: 800, modoMora: 'por_pedido', diasMargenLavado: 2, precioPorDia: true }, duena)
    expect(obtenerConfiguracion(db)).toMatchObject({ moraPorDia: 800, modoMora: 'por_pedido', diasMargenLavado: 2, precioPorDia: true })
    const fila = db.prepare("SELECT usuario_id, detalle FROM auditoria WHERE accion = 'configuracion_cambiada'").get() as { usuario_id: number; detalle: string }
    expect(fila.usuario_id).toBe(1)
    expect(JSON.parse(fila.detalle)).toEqual({
      moraPorDia: { antes: 500, despues: 800 },
      modoMora: { antes: 'por_unidad', despues: 'por_pedido' },
      diasMargenLavado: { antes: 1, despues: 2 },
      precioPorDia: { antes: false, despues: true }
    })
  })

  it('sin cambios no deja auditoría; valida los valores y el rol', () => {
    const actual = { moraPorDia: 500, modoMora: 'por_unidad' as const, diasMargenLavado: 1, precioPorDia: false }
    actualizarConfiguracion(db, actual, duena)
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'configuracion_cambiada'").get()).toEqual({ n: 0 })
    expect(() => actualizarConfiguracion(db, { ...actual, moraPorDia: -1 }, duena)).toThrow('La mora por día debe ser un monto')
    expect(() => actualizarConfiguracion(db, { ...actual, diasMargenLavado: 1.5 }, duena)).toThrow('Los días para lavado')
    expect(() => actualizarConfiguracion(db, { ...actual, diasMargenLavado: 15 }, duena)).toThrow('Los días para lavado')
    expect(() => actualizarConfiguracion(db, { ...actual, moraPorDia: 700 }, { usuarioId: 2, rol: 'empleado' })).toThrow(
      'Solo la dueña puede cambiar la configuración.'
    )
  })
})
