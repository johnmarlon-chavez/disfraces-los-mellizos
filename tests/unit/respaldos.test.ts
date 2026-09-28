import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as clientes from '../../src/main/db/clientes'
import { abrirBaseDeDatos } from '../../src/main/db/conexion'
import * as disfraces from '../../src/main/db/disfraces'
import { aplicarMigraciones, MIGRACIONES } from '../../src/main/db/migraciones'
import * as pedidos from '../../src/main/db/pedidos'
import * as registro from '../../src/main/db/respaldos'
import * as usuarios from '../../src/main/db/usuarios'
import { generarCodigoRecuperacion } from '../../src/main/logica/acceso'
import {
  detectarNube,
  estaDentro,
  faltaRespaldoAlAbrir,
  leerNombre,
  nombreRespaldo,
  problemaDeRespaldo,
  sobrantesEnNube,
  sobrantesLocales,
  tipoDeError,
  tocaRecordatorioNube
} from '../../src/main/logica/respaldos'
import {
  abrirRespaldo,
  alAbrir,
  avisosRespaldo,
  crearRespaldo,
  estadoRespaldos,
  restaurarRespaldo,
  subirPendiente,
  sugerirCarpetas,
  validarCarpetaNube,
  vistaRestauracion,
  type ContextoRespaldos
} from '../../src/main/respaldos'
import { rutasDe } from '../../src/main/rutas'
import { trasladarDatos } from '../../src/main/traslado'
import type { Manifiesto } from '../../src/shared/respaldos'

const DUENA = 'mi gato come pan 7'
const TRAB = 'tienda de la esquina'

describe('nombres y qué conservar', () => {
  it('nombre con fecha y hora de Lima, y solo se reconocen los nuestros', () => {
    const n = nombreRespaldo(new Date('2026-09-29T02:30:05Z')) // 21:30:05 del 28 en Lima
    expect(n).toBe('Respaldo Disfraces 2026-09-28 21-30-05.zip')
    expect(leerNombre(n)).toMatchObject({ dia: '2026-09-28', antesDeRestaurar: false })
    expect(nombreRespaldo(new Date('2026-09-29T02:30:05Z'), true)).toBe('Respaldo Disfraces 2026-09-28 21-30-05 (antes de restaurar).zip')
    for (const ajeno of ['foto.jpg', 'Respaldo Disfraces 2026-09-28.zip', 'Respaldo Disfraces 2026-09-28 21-30-05.zip.tmp']) {
      expect(leerNombre(ajeno)).toBeNull()
    }
  })

  it('nube: todos los de hoy y el último de cada día anterior, hasta 30 días distintos; nunca archivos ajenos', () => {
    const archivos: string[] = ['mis fotos.zip', 'Respaldo Disfraces 2020-01-01.zip']
    for (let d = 0; d < 40; d++) {
      const dia = new Date(Date.UTC(2026, 8, 28 - d)).toISOString().slice(0, 10)
      for (const h of ['09-00-00', '13-00-00', '19-00-00']) archivos.push(`Respaldo Disfraces ${dia} ${h}.zip`)
    }
    const sobran = sobrantesEnNube(archivos, '2026-09-28')
    const quedan = archivos.filter((a) => !sobran.includes(a))
    const nuestros = quedan.filter((a) => leerNombre(a))
    expect(nuestros).toHaveLength(3 + 29) // hoy completo + 29 días anteriores = 30 días distintos
    expect(new Set(nuestros.map((a) => leerNombre(a)!.dia)).size).toBe(30)
    expect(nuestros).toContain('Respaldo Disfraces 2026-09-27 19-00-00.zip')
    expect(nuestros).not.toContain('Respaldo Disfraces 2026-09-27 09-00-00.zip')
    expect(quedan).toContain('mis fotos.zip')
    expect(sobran.every((a) => leerNombre(a))).toBe(true)
  })

  it('los "antes de restaurar" se conservan aparte (los últimos 5), aunque haya respaldos después ese día', () => {
    const antes = Array.from({ length: 7 }, (_, i) => `Respaldo Disfraces 2026-09-0${i + 1} 10-00-00 (antes de restaurar).zip`)
    const sobran = sobrantesEnNube([...antes, 'Respaldo Disfraces 2026-09-07 18-00-00.zip'], '2026-09-28')
    expect(sobran).toEqual([antes[1], antes[0]])
  })

  it('copia local: los últimos 7', () => {
    const archivos = Array.from({ length: 10 }, (_, i) => `Respaldo Disfraces 2026-09-${String(i + 10)} 10-00-00.zip`)
    expect(sobrantesLocales(archivos).sort()).toEqual(archivos.slice(0, 3))
  })
})

describe('carpetas en la nube', () => {
  const entorno = { OneDrive: 'C:\\Users\\Rosa\\OneDrive', USERPROFILE: 'C:\\Users\\Rosa' }

  it('detecta OneDrive, Google Drive y carpetas locales', () => {
    expect(detectarNube('C:\\Users\\Rosa\\OneDrive\\Documentos\\SistemaDisfraces', entorno)).toBe('onedrive')
    expect(detectarNube('c:\\users\\rosa\\onedrive', entorno)).toBe('onedrive')
    expect(detectarNube('G:\\Mi unidad\\Respaldos', entorno)).toBe('google_drive')
    expect(detectarNube('G:\\My Drive\\Respaldos', entorno)).toBe('google_drive')
    expect(detectarNube('C:\\Users\\Rosa\\OneDrive - Colegio\\x', {})).toBe('onedrive')
    expect(detectarNube('C:\\Users\\Rosa\\AppData\\Local\\SistemaDisfraces', entorno)).toBeNull()
    expect(detectarNube('D:\\Respaldos', entorno)).toBeNull()
  })

  it('estaDentro sin distinguir mayúsculas ni confundir prefijos', () => {
    expect(estaDentro('C:\\Datos\\Sistema\\respaldos', 'c:\\datos\\sistema')).toBe(true)
    expect(estaDentro('C:\\Datos\\Sistema', 'C:\\Datos\\Sistema\\')).toBe(true)
    expect(estaDentro('C:\\Datos\\Sistema2', 'C:\\Datos\\Sistema')).toBe(false)
  })

  it('sugiere las carpetas de Drive y OneDrive que existen', () => {
    const existen = new Set(['C:\\Users\\Rosa\\OneDrive', 'G:\\Mi unidad'])
    expect(sugerirCarpetas(entorno, (r) => existen.has(r))).toEqual([
      { ruta: join('C:\\Users\\Rosa\\OneDrive', 'Respaldos Disfraces Los Mellizos'), servicio: 'onedrive' },
      { ruta: join('G:\\Mi unidad', 'Respaldos Disfraces Los Mellizos'), servicio: 'google_drive' }
    ])
  })

  it('errores de disco en palabras simples', () => {
    expect(tipoDeError({ code: 'ENOSPC' })).toBe('disco_lleno')
    expect(tipoDeError({ code: 'ENOENT' })).toBe('no_existe')
    expect(tipoDeError({ code: 'EPERM' })).toBe('sin_permiso')
    expect(tipoDeError(new Error('x'))).toBe('otro')
  })

  it('cuándo respaldar al abrir, avisar y recordar', () => {
    const ahora = new Date('2026-09-28T15:00:00Z')
    expect(faltaRespaldoAlAbrir(null, ahora)).toBe(true)
    expect(faltaRespaldoAlAbrir('2026-09-27T16:00:00Z', ahora)).toBe(false)
    expect(faltaRespaldoAlAbrir('2026-09-27T14:00:00Z', ahora)).toBe(true)
    expect(problemaDeRespaldo('2026-09-28T10:00:00Z', true, ahora)).toBe('fallo')
    expect(problemaDeRespaldo('2026-09-25T10:00:00Z', false, ahora)).toBe('viejo')
    expect(problemaDeRespaldo('2026-09-27T10:00:00Z', false, ahora)).toBeNull()
    expect(tocaRecordatorioNube(null, false, ahora)).toBe(false)
    expect(tocaRecordatorioNube(null, true, ahora)).toBe(true)
    expect(tocaRecordatorioNube('2026-09-01T10:00:00Z', true, ahora)).toBe(false)
    expect(tocaRecordatorioNube('2026-08-28T10:00:00Z', true, ahora)).toBe(true)
  })
})

describe('respaldos en disco', () => {
  let base: string
  let ctx: ContextoRespaldos
  let reloj: Date

  function nuevoContexto(): void {
    base = mkdtempSync(join(tmpdir(), 'disfraces-respaldos-'))
    const rutas = rutasDe(join(base, 'datos'))
    mkdirSync(rutas.fotos, { recursive: true })
    mkdirSync(rutas.respaldosLocales, { recursive: true })
    reloj = new Date('2026-09-28T15:00:00Z')
    ctx = {
      db: abrirBaseDeDatos(rutas.baseDeDatos),
      rutas,
      versionPrograma: '0.1.0',
      tienda: 'Disfraces Los Mellizos',
      entorno: {},
      ahora: () => reloj
    }
  }

  function crearPedido(dni: string): void {
    const cliente = clientes.crearCliente(
      ctx.db,
      { tipo: 'persona', tipoDocumento: 'dni', numeroDocumento: dni, nombres: `Cliente ${dni}`, telefono: '987654321', direccion: '', observaciones: '' },
      null
    )
    const modelo = disfraces.crearModelo(
      ctx.db,
      { nombre: `Pirata ${dni}`, categoria: 'Personajes', region: null, descripcion: '', precioAlquiler: 3000, prefijo: `P${dni.slice(-2)}` },
      null
    )
    const codigos = disfraces.sugerirCodigos(ctx.db, modelo, 1)
    disfraces.crearUnidades(ctx.db, { modeloId: modelo, talla: 'M', codigos, piezas: [] }, null)
    const unidad = (ctx.db.prepare('SELECT id FROM unidades WHERE codigo = ?').get(codigos[0]) as { id: number }).id
    pedidos.crearPedido(
      ctx.db,
      {
        clienteId: cliente,
        fechaSalida: '2027-01-10',
        fechaDevolucionPactada: '2027-01-12',
        evento: 'Otro',
        gradoSeccion: '',
        observaciones: '',
        garantiaTipo: null,
        garantiaMonto: 0,
        lineas: [{ unidadId: unidad, precioCobrado: 3000 }],
        pendientes: [],
        adelanto: { monto: 1000, medio: 'yape' }
      },
      null,
      '2026-09-28'
    )
  }

  beforeEach(() => {
    usuarios.establecerRondasBcrypt(4)
    nuevoContexto()
  })

  afterEach(() => {
    try {
      ctx.db.close()
    } catch {
      /* ya cerrada */
    }
    rmSync(base, { recursive: true, force: true })
  })

  const zipLocal = (): string[] => readdirSync(ctx.rutas.respaldosLocales)

  it('sin carpeta en la nube: copia local verificada, con base, fotos y manifiesto; sin .tmp', async () => {
    crearPedido('40123456')
    writeFileSync(join(ctx.rutas.fotos, 'modelo-1-1.jpg'), 'foto uno')
    const r = await crearRespaldo(ctx, 'manual')
    expect(r).toMatchObject({ archivo: 'Respaldo Disfraces 2026-09-28 10-00-00.zip', local: { ok: true }, nube: null })
    expect(zipLocal()).toEqual([r.archivo])
    const { manifiesto, archivos } = abrirRespaldo(ctx, readFileSync(join(ctx.rutas.respaldosLocales, r.archivo)))
    expect(manifiesto).toMatchObject({ tipo: 'manual', versionEsquema: MIGRACIONES.length, conteos: { clientes: 1, pedidos: 1, pagos: 1, fotos: 1 } })
    expect(strFromU8(archivos['fotos/modelo-1-1.jpg'])).toBe('foto uno')
    expect(registro.ultimoOk(ctx.db, 'local')).toBe(reloj.toISOString())
  })

  it('con carpeta en la nube: copia en los dos lugares; si la carpeta se borró, se vuelve a crear', async () => {
    const nube = join(base, 'Mi unidad', 'Respaldos')
    mkdirSync(nube, { recursive: true })
    registro.guardarCarpetaNube(ctx.db, nube, null)
    const r = await crearRespaldo(ctx, 'cierre')
    expect(r.nube).toMatchObject({ ok: true })
    expect(readdirSync(nube)).toEqual([r.archivo])

    rmSync(nube, { recursive: true })
    reloj = new Date('2026-09-28T16:00:00Z')
    const r2 = await crearRespaldo(ctx, 'cierre')
    expect(r2).toMatchObject({ nube: { ok: true }, carpetaRecreada: true })
    expect(estadoRespaldos(ctx)).toMatchObject({ servicioNube: 'google_drive', carpetaNubeDisponible: true })
  })

  it('carpeta en la nube no disponible: queda la copia local, el error en palabras simples y el aviso', async () => {
    registro.guardarCarpetaNube(ctx.db, join(base, 'G-sin-drive', 'Mi unidad', 'Respaldos'), null)
    const r = await crearRespaldo(ctx, 'cierre')
    expect(r.local.ok).toBe(true)
    expect(r.nube).toMatchObject({ ok: false, error: expect.stringContaining('la carpeta de respaldos no está disponible') })
    expect(avisosRespaldo(ctx)).toMatchObject({ problema: 'fallo', error: expect.stringContaining('no está disponible') })
  })

  it('si no se puede renombrar en el destino, no queda ningún archivo a medias', async () => {
    const nube = join(base, 'nube')
    mkdirSync(join(nube, 'Respaldo Disfraces 2026-09-28 10-00-00.zip'), { recursive: true }) // un directorio con ese nombre
    registro.guardarCarpetaNube(ctx.db, nube, null)
    const r = await crearRespaldo(ctx, 'manual')
    expect(r.nube?.ok).toBe(false)
    expect(readdirSync(nube).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('al volver la carpeta, se sube la copia local pendiente', async () => {
    const nube = join(base, 'nube')
    registro.guardarCarpetaNube(ctx.db, join(nube, 'no', 'existe'), null)
    const r = await crearRespaldo(ctx, 'cierre')
    expect(r.nube?.ok).toBe(false)
    mkdirSync(nube)
    registro.guardarCarpetaNube(ctx.db, nube, null)
    expect(await subirPendiente(ctx)).toMatchObject({ ok: true })
    expect(readdirSync(nube)).toEqual([r.archivo])
    expect(await subirPendiente(ctx)).toBeNull() // ya está
    expect(avisosRespaldo(ctx).problema).toBeNull()
  })

  it('al abrir: respalda si pasaron más de 24 h desde el último correcto', async () => {
    await alAbrir(ctx)
    expect(zipLocal()).toHaveLength(1)
    reloj = new Date('2026-09-29T10:00:00Z')
    await alAbrir(ctx)
    expect(zipLocal()).toHaveLength(1)
    reloj = new Date('2026-09-29T16:00:00Z')
    await alAbrir(ctx)
    expect(zipLocal()).toHaveLength(2)
  })

  it('la copia local conserva solo los últimos 7', async () => {
    for (let i = 0; i < 9; i++) {
      reloj = new Date(Date.UTC(2026, 8, 20 + i, 15))
      await crearRespaldo(ctx, 'cierre')
    }
    expect(zipLocal()).toHaveLength(7)
    expect(zipLocal()[0]).toBe('Respaldo Disfraces 2026-09-22 10-00-00.zip')
  })

  it('un respaldo alterado no pasa la verificación', async () => {
    const r = await crearRespaldo(ctx, 'manual')
    const archivos = unzipSync(readFileSync(join(ctx.rutas.respaldosLocales, r.archivo)))
    archivos['datos.db'] = new Uint8Array([...archivos['datos.db'].slice(0, 100), 1, 2, 3])
    expect(() => abrirRespaldo(ctx, zipSync(archivos))).toThrow('El respaldo está dañado (datos.db).')
    expect(() => abrirRespaldo(ctx, strToU8('no es un zip'))).toThrow('no es un respaldo del sistema')
  })

  it('la carpeta de respaldos no puede estar junto a los datos', () => {
    expect(() => validarCarpetaNube(ctx, join(ctx.rutas.carpetaDatos, 'respaldos-nube'))).toThrow('está junto a los datos del programa')
    expect(() => validarCarpetaNube(ctx, base)).toThrow('está junto a los datos del programa')
    expect(() => validarCarpetaNube(ctx, join(base, 'Mi unidad', 'Respaldos'))).not.toThrow()
  })

  it('restaurar: vuelven los datos y las fotos, se conservan las credenciales actuales y el registro de respaldos', async () => {
    const codigo = generarCodigoRecuperacion()
    usuarios.crearCuentas(ctx.db, { contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: codigo }, codigo)
    crearPedido('40123456')
    writeFileSync(join(ctx.rutas.fotos, 'modelo-1-1.jpg'), 'foto uno')
    const respaldo = await crearRespaldo(ctx, 'manual')

    // Después del respaldo: otro pedido, otra foto y la dueña cambia su contraseña
    reloj = new Date('2026-09-28T18:00:00Z')
    crearPedido('40999888')
    writeFileSync(join(ctx.rutas.fotos, 'modelo-2-2.jpg'), 'foto dos')
    const duena = usuarios.iniciarSesion(ctx.db, 'duena', DUENA)
    usuarios.cambiarContrasena(ctx.db, duena, 'duena', DUENA, 'marinera en la plaza')

    const ruta = join(ctx.rutas.respaldosLocales, respaldo.archivo)
    expect(vistaRestauracion(ctx, ruta)).toMatchObject({ sePerderan: { pedidos: 1, pagos: 1 }, impedimento: null, conteos: { pedidos: 1 } })

    const { antes } = await restaurarRespaldo(ctx, ruta, duena, () => ctx.db.close())
    expect(antes.local.ok).toBe(true)
    expect(existsSync(join(ctx.rutas.respaldosLocales, antes.archivo))).toBe(true)
    expect(antes.archivo).toContain('(antes de restaurar)')

    const db = abrirBaseDeDatos(ctx.rutas.baseDeDatos)
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM alquileres').get()).toEqual({ n: 1 })
      expect(readdirSync(ctx.rutas.fotos)).toEqual(['modelo-1-1.jpg'])
      // Contraseña actual (la nueva), no la del respaldo
      expect(() => usuarios.iniciarSesion(db, 'duena', DUENA)).toThrow('no es correcta')
      expect(usuarios.iniciarSesion(db, 'duena', 'marinera en la plaza').rol).toBe('admin')
      // Registro de respaldos continuo, y constancia de la restauración
      expect(registro.ultimoOk(db, 'local')).not.toBeNull()
      expect((db.prepare("SELECT tipo FROM respaldos WHERE tipo = 'antes_de_restaurar'").all() as unknown[]).length).toBe(1)
      expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'respaldo_restaurado'").get()).toEqual({ n: 1 })
    } finally {
      db.close()
    }
    // El estado anterior queda a un lado, sin borrar
    expect(existsSync(join(ctx.rutas.carpetaDatos, 'restauracion-anterior', 'datos.db'))).toBe(true)
    expect(existsSync(join(ctx.rutas.carpetaDatos, 'restaurando'))).toBe(false)
  })

  it('restaurar un respaldo de una versión anterior lo migra; uno de una versión más nueva se rechaza', async () => {
    // Respaldo "antiguo": una base con las migraciones hasta la 8
    const vieja = join(base, 'vieja.db')
    const dbVieja = new Database(vieja)
    aplicarMigraciones(dbVieja, MIGRACIONES.slice(0, 8))
    dbVieja.close()
    const bytes = readFileSync(vieja)
    const hash = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')
    const manifiesto: Manifiesto = {
      formato: 1,
      tienda: 'Disfraces Los Mellizos',
      versionPrograma: '0.0.9',
      versionEsquema: 8,
      fecha: '2026-06-01T15:00:00.000Z',
      tipo: 'cierre',
      conteos: { clientes: 0, modelos: 0, unidades: 0, pedidos: 0, pagos: 0, fotos: 0 },
      ultimoIdPedido: 0,
      ultimoIdPago: 0,
      archivos: { 'datos.db': { tamano: bytes.length, sha256: hash } }
    }
    const rutaVieja = join(base, 'Respaldo Disfraces 2026-06-01 10-00-00.zip')
    writeFileSync(rutaVieja, zipSync({ 'datos.db': bytes, 'manifiesto.json': strToU8(JSON.stringify(manifiesto)) }))
    const codigo = generarCodigoRecuperacion()
    usuarios.crearCuentas(ctx.db, { contrasenaDuena: DUENA, contrasenaTrabajadores: TRAB, codigoConfirmado: codigo }, codigo)

    const nueva = join(base, 'Respaldo Disfraces 2030-01-01 10-00-00.zip')
    writeFileSync(nueva, zipSync({ 'datos.db': bytes, 'manifiesto.json': strToU8(JSON.stringify({ ...manifiesto, versionEsquema: 99 })) }))
    expect(vistaRestauracion(ctx, nueva).impedimento).toContain('versión más nueva')
    await expect(restaurarRespaldo(ctx, nueva, null, () => ctx.db.close())).rejects.toThrow('versión más nueva')

    await restaurarRespaldo(ctx, rutaVieja, null, () => ctx.db.close())
    const db = abrirBaseDeDatos(ctx.rutas.baseDeDatos)
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(MIGRACIONES.length)
      // La base antigua no tenía cuentas: se agregan las actuales
      expect(usuarios.iniciarSesion(db, 'trabajadores', TRAB).rol).toBe('empleado')
    } finally {
      db.close()
    }
  })
})

describe('traslado de Documentos a %LOCALAPPDATA%', () => {
  let base: string
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'disfraces-traslado-'))
  })
  afterEach(() => rmSync(base, { recursive: true, force: true }))

  /** Base con datos que siguen en el -wal (sin pasar a datos.db), como si la app se hubiera cortado. */
  function origenConWal(): string {
    const viva = join(base, 'viva')
    const origen = join(base, 'Documentos', 'SistemaDisfraces')
    mkdirSync(viva)
    mkdirSync(join(origen, 'fotos'), { recursive: true })
    const db = abrirBaseDeDatos(join(viva, 'datos.db'))
    db.pragma('wal_autocheckpoint = 0')
    db.prepare("UPDATE configuracion SET nombre_tienda = 'Disfraces Los Mellizos (wal)'").run()
    for (const f of ['datos.db', 'datos.db-wal', 'datos.db-shm']) writeFileSync(join(origen, f), readFileSync(join(viva, f)))
    db.close()
    writeFileSync(join(origen, 'fotos', 'modelo-1-1.jpg'), 'foto')
    return origen
  }

  it('sin datos en Documentos no hace nada', async () => {
    expect(await trasladarDatos(join(base, 'no-hay'), join(base, 'destino'))).toEqual({ estado: 'nada' })
  })

  it('traslada la base (con lo que estaba en el -wal) y las fotos; el original se renombra, no se borra', async () => {
    const origen = origenConWal()
    const destino = join(base, 'Local', 'SistemaDisfraces')
    expect(await trasladarDatos(origen, destino)).toMatchObject({ estado: 'trasladado', fotos: 1 })
    const db = new Database(join(destino, 'datos.db'), { readonly: true })
    expect(db.prepare('SELECT nombre_tienda FROM configuracion').get()).toEqual({ nombre_tienda: 'Disfraces Los Mellizos (wal)' })
    db.close()
    expect(readFileSync(join(destino, 'fotos', 'modelo-1-1.jpg'), 'utf8')).toBe('foto')
    expect(existsSync(join(origen, 'datos.db'))).toBe(false)
    expect(existsSync(join(origen, 'datos.db.trasladado'))).toBe(true)
    expect(existsSync(join(origen, 'fotos', 'modelo-1-1.jpg'))).toBe(true)
    expect(readdirSync(origen)).toContain('LÉAME - los datos se trasladaron.txt')
    // Una segunda vez ya no hace nada
    expect(await trasladarDatos(origen, destino)).toEqual({ estado: 'nada' })
  })

  it('con datos en los dos lugares no mezcla nada', async () => {
    const origen = origenConWal()
    const destino = join(base, 'Local')
    mkdirSync(destino)
    writeFileSync(join(destino, 'datos.db'), '')
    expect(await trasladarDatos(origen, destino)).toMatchObject({ estado: 'ambos' })
    expect(existsSync(join(origen, 'datos.db'))).toBe(true)
  })

  it('si falla, el destino queda sin copias y el origen intacto (se reintenta al próximo inicio)', async () => {
    const origen = join(base, 'Documentos')
    mkdirSync(origen)
    writeFileSync(join(origen, 'datos.db'), 'esto no es una base de datos')
    const destino = join(base, 'Local')
    const r = await trasladarDatos(origen, destino)
    expect(r.estado).toBe('fallo')
    expect(existsSync(join(destino, 'datos.db'))).toBe(false)
    expect(existsSync(join(destino, 'datos.db.trasladando'))).toBe(false)
    expect(readFileSync(join(origen, 'datos.db'), 'utf8')).toBe('esto no es una base de datos')
  })
})
