// Respaldos y restauración. Sin Electron, para poder probarlo con Vitest.
// Un respaldo es un .zip con datos.db (API de backup de SQLite), fotos\ y manifiesto.json.
// Se arma y se verifica en memoria, se escribe como .tmp, se vuelve a leer y recién entonces se
// renombra: nunca queda un archivo a medias. Los viejos se borran solo después de verificar el nuevo.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { hoyEnLima } from '../shared/formato'
import type {
  ArchivoRespaldo,
  AvisosRespaldo,
  ConteosRespaldo,
  EstadoRespaldos,
  IntentoRespaldo,
  Manifiesto,
  ResultadoRespaldo,
  TipoRespaldo,
  VistaRestauracion
} from '../shared/respaldos'
import { abrirBaseDeDatos } from './db/conexion'
import { registrarAuditoria } from './db/auditoria'
import { versionActual } from './db/migraciones'
import * as registro from './db/respaldos'
import { ErrorDeNegocio } from './errores'
import {
  detectarNube,
  estaDentro,
  faltaRespaldoAlAbrir,
  leerNombre,
  masReciente,
  MENSAJE_ERROR,
  nombreRespaldo,
  problemaDeRespaldo,
  sobrantesEnNube,
  sobrantesLocales,
  tipoDeError,
  tocaRecordatorioNube
} from './logica/respaldos'
import type { Rutas } from './rutas'
import type { Sesion } from './sesion'

export interface ContextoRespaldos {
  db: Database.Database
  rutas: Rutas
  versionPrograma: string
  tienda: string
  entorno?: Record<string, string | undefined>
  ahora?: () => Date
  /** Tiempo máximo para escribir en la carpeta de la nube (puede ser una unidad que no responde). */
  tiempoNubeMs?: number
}

const TIEMPO_NUBE_MS = 60_000
const sha256 = (datos: Uint8Array): string => createHash('sha256').update(datos).digest('hex')
const ahoraDe = (ctx: ContextoRespaldos): Date => (ctx.ahora ? ctx.ahora() : new Date())

/** Error con código, para clasificarlo con tipoDeError. */
function errorCon(codigo: string, mensaje: string): Error {
  return Object.assign(new Error(mensaje), { code: codigo })
}

// ——— Armar y verificar ———

function conteos(db: Database.Database, fotos: number): ConteosRespaldo & { ultimoIdPedido: number; ultimoIdPago: number } {
  const n = (sql: string): number => (db.prepare(sql).get() as { n: number | null }).n ?? 0
  return {
    clientes: n('SELECT COUNT(*) AS n FROM clientes'),
    modelos: n('SELECT COUNT(*) AS n FROM modelos'),
    unidades: n('SELECT COUNT(*) AS n FROM unidades'),
    pedidos: n('SELECT COUNT(*) AS n FROM alquileres'),
    pagos: n('SELECT COUNT(*) AS n FROM pagos'),
    fotos,
    ultimoIdPedido: n('SELECT MAX(id) AS n FROM alquileres'),
    ultimoIdPago: n('SELECT MAX(id) AS n FROM pagos')
  }
}

/** Carpeta temporal dentro de la carpeta de datos (nunca en la nube). */
function carpetaTemporal(ctx: ContextoRespaldos, nombre: string): string {
  const ruta = join(ctx.rutas.carpetaDatos, `tmp-${nombre}-${process.pid}-${Date.now()}`)
  mkdirSync(ruta, { recursive: true })
  return ruta
}

/** Arma el .zip en memoria: copia de la base con la API de backup, fotos y manifiesto. */
export async function armarRespaldo(ctx: ContextoRespaldos, tipo: TipoRespaldo, instante: Date): Promise<Uint8Array> {
  const tmp = carpetaTemporal(ctx, 'respaldo')
  try {
    const copiaDb = join(tmp, 'datos.db')
    await ctx.db.backup(copiaDb)
    const copia = new Database(copiaDb, { readonly: true })
    const fotos = existsSync(ctx.rutas.fotos)
      ? readdirSync(ctx.rutas.fotos).filter((f) => statSync(join(ctx.rutas.fotos, f)).isFile())
      : []
    let datos: { c: ReturnType<typeof conteos>; esquema: number }
    try {
      datos = { c: conteos(copia, fotos.length), esquema: copia.pragma('user_version', { simple: true }) as number }
    } finally {
      copia.close()
    }
    const archivos: Zippable = {}
    const resumen: Manifiesto['archivos'] = {}
    const agregar = (ruta: string, contenido: Uint8Array, comprimir: boolean): void => {
      archivos[ruta] = [contenido, { level: comprimir ? 6 : 0 }]
      resumen[ruta] = { tamano: contenido.length, sha256: sha256(contenido) }
    }
    agregar('datos.db', readFileSync(copiaDb), true)
    for (const f of fotos) agregar(`fotos/${f}`, readFileSync(join(ctx.rutas.fotos, f)), false)
    const { ultimoIdPedido, ultimoIdPago, ...c } = datos.c
    const manifiesto: Manifiesto = {
      formato: 1,
      tienda: ctx.tienda,
      versionPrograma: ctx.versionPrograma,
      versionEsquema: datos.esquema,
      fecha: instante.toISOString(),
      tipo,
      conteos: c,
      ultimoIdPedido,
      ultimoIdPago,
      archivos: resumen
    }
    archivos['manifiesto.json'] = strToU8(JSON.stringify(manifiesto, null, 2))
    return zipSync(archivos)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

interface RespaldoAbierto {
  manifiesto: Manifiesto
  archivos: Record<string, Uint8Array>
}

/**
 * Abre un .zip de respaldo y verifica cada archivo contra el manifiesto, y la base con
 * integrity_check. Lanza un error con código EVERIFICACION si algo no cuadra.
 */
export function abrirRespaldo(ctx: ContextoRespaldos, zip: Uint8Array): RespaldoAbierto {
  let archivos: Record<string, Uint8Array>
  let manifiesto: Manifiesto
  try {
    archivos = unzipSync(zip)
    manifiesto = JSON.parse(strFromU8(archivos['manifiesto.json'])) as Manifiesto
  } catch {
    throw errorCon('EVERIFICACION', 'El archivo no es un respaldo del sistema o está dañado.')
  }
  if (manifiesto?.formato !== 1 || !archivos['datos.db']) throw errorCon('EVERIFICACION', 'El archivo no es un respaldo del sistema.')
  for (const [ruta, esperado] of Object.entries(manifiesto.archivos)) {
    const contenido = archivos[ruta]
    if (!contenido || contenido.length !== esperado.tamano || sha256(contenido) !== esperado.sha256) {
      throw errorCon('EVERIFICACION', `El respaldo está dañado (${ruta}).`)
    }
  }
  const tmp = carpetaTemporal(ctx, 'verificar')
  try {
    const ruta = join(tmp, 'datos.db')
    writeFileSync(ruta, archivos['datos.db'])
    const copia = new Database(ruta, { readonly: true })
    try {
      if (copia.pragma('integrity_check', { simple: true }) !== 'ok') throw errorCon('EVERIFICACION', 'La base del respaldo está dañada.')
    } finally {
      copia.close()
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  return { manifiesto, archivos }
}

// ——— Escribir ———

/** Escribe como .tmp, fuerza al disco, lo vuelve a leer, compara y recién entonces renombra. */
async function escribirVerificado(destino: string, zip: Uint8Array): Promise<void> {
  const tmp = `${destino}.tmp`
  try {
    const archivo = await open(tmp, 'w')
    try {
      await archivo.writeFile(zip)
      await archivo.sync()
    } finally {
      await archivo.close()
    }
    const leido = await readFile(tmp)
    if (leido.length !== zip.length || sha256(leido) !== sha256(zip)) throw errorCon('EVERIFICACION', 'La copia escrita no coincide.')
    await rename(tmp, destino)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

function conTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let reloj: NodeJS.Timeout
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(errorCon('ETIMEDOUT', 'Tiempo agotado')), ms)
  })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj))
}

/**
 * Prepara la carpeta de la nube: si no existe pero existe la de arriba (por ejemplo "Mi unidad"),
 * se vuelve a crear. Si falta también la de arriba (unidad G: sin la app de Drive), falla.
 */
async function prepararCarpetaNube(carpeta: string): Promise<boolean> {
  if (existsSync(carpeta)) return false
  if (!existsSync(dirname(carpeta))) throw errorCon('ENOENT', 'No existe la carpeta de arriba')
  await mkdir(carpeta)
  return true
}

function intento(destino: 'local' | 'nube', fecha: string, error: unknown): IntentoRespaldo {
  return { fecha, destino, ok: !error, error: error ? MENSAJE_ERROR[tipoDeError(error)] : null }
}

function listarArchivos(carpeta: string): string[] {
  try {
    return readdirSync(carpeta)
  } catch {
    return []
  }
}

function borrarSobrantes(carpeta: string, sobrantes: string[]): void {
  for (const f of sobrantes) {
    try {
      rmSync(join(carpeta, f), { force: true })
    } catch (error) {
      console.error('[respaldos] No se pudo borrar un respaldo viejo:', f, error)
    }
  }
}

/**
 * Hace un respaldo: primero la copia local (siempre), luego la de la nube si hay carpeta elegida.
 * Nunca lanza: devuelve el resultado de cada destino, que además queda registrado.
 */
export async function crearRespaldo(ctx: ContextoRespaldos, tipo: TipoRespaldo): Promise<ResultadoRespaldo> {
  const instante = ahoraDe(ctx)
  const fecha = instante.toISOString()
  const archivo = nombreRespaldo(instante, tipo === 'antes_de_restaurar')
  const nube = registro.carpetaNube(ctx.db)
  const registrar = (destino: 'local' | 'nube', error: unknown, zip: Uint8Array | null): void =>
    registro.registrarIntento(ctx.db, {
      tipo,
      destino,
      archivo,
      ok: !error,
      error: error ? MENSAJE_ERROR[tipoDeError(error)] : null,
      tamano: zip?.length ?? null,
      sha256: zip && !error ? sha256(zip) : null,
      fecha
    })

  let zip: Uint8Array | null = null
  let errorArmar: unknown = null
  try {
    zip = await armarRespaldo(ctx, tipo, instante)
    abrirRespaldo(ctx, zip)
  } catch (error) {
    console.error('[respaldos] No se pudo armar el respaldo:', error)
    errorArmar = error
  }

  // Local
  let errorLocal = errorArmar
  if (zip && !errorArmar) {
    try {
      mkdirSync(ctx.rutas.respaldosLocales, { recursive: true })
      await escribirVerificado(join(ctx.rutas.respaldosLocales, archivo), zip)
      borrarSobrantes(ctx.rutas.respaldosLocales, sobrantesLocales(listarArchivos(ctx.rutas.respaldosLocales)))
    } catch (error) {
      console.error('[respaldos] Falló la copia local:', error)
      errorLocal = error
    }
  }
  registrar('local', errorLocal, zip)

  // Nube
  let resultadoNube: IntentoRespaldo | null = null
  let carpetaRecreada = false
  if (nube) {
    let errorNube = errorArmar
    if (zip && !errorArmar) {
      try {
        await conTiempo(
          (async () => {
            carpetaRecreada = await prepararCarpetaNube(nube)
            await escribirVerificado(join(nube, archivo), zip)
          })(),
          ctx.tiempoNubeMs ?? TIEMPO_NUBE_MS
        )
        borrarSobrantes(nube, sobrantesEnNube(listarArchivos(nube), hoyEnLima(instante)))
      } catch (error) {
        console.error('[respaldos] Falló la copia en la nube:', error)
        errorNube = error
      }
    }
    registrar('nube', errorNube, zip)
    resultadoNube = intento('nube', fecha, errorNube)
  }
  if (!errorLocal || (resultadoNube && resultadoNube.ok)) {
    registrarAuditoria(ctx.db, null, 'respaldo_creado', 'respaldos', null, {
      archivo,
      tipo,
      local: !errorLocal,
      nube: resultadoNube ? resultadoNube.ok : null
    })
  }
  return { archivo, local: intento('local', fecha, errorLocal), nube: resultadoNube, carpetaRecreada }
}

/** Sube a la nube la copia local más reciente si no está allá (por ejemplo, si al cerrar no se pudo). */
export async function subirPendiente(ctx: ContextoRespaldos): Promise<IntentoRespaldo | null> {
  const nube = registro.carpetaNube(ctx.db)
  if (!nube) return null
  const ultimo = masReciente(listarArchivos(ctx.rutas.respaldosLocales))
  if (!ultimo || existsSync(join(nube, ultimo))) return null
  const fecha = ahoraDe(ctx).toISOString()
  let zip: Uint8Array | null = null
  let fallo: unknown = null
  try {
    zip = readFileSync(join(ctx.rutas.respaldosLocales, ultimo))
    abrirRespaldo(ctx, zip)
    const contenido = zip
    await conTiempo(
      (async () => {
        await prepararCarpetaNube(nube)
        await escribirVerificado(join(nube, ultimo), contenido)
      })(),
      ctx.tiempoNubeMs ?? TIEMPO_NUBE_MS
    )
    borrarSobrantes(nube, sobrantesEnNube(listarArchivos(nube), hoyEnLima(ahoraDe(ctx))))
  } catch (error) {
    fallo = error
  }
  registro.registrarIntento(ctx.db, {
    tipo: 'subida_pendiente',
    destino: 'nube',
    archivo: ultimo,
    ok: !fallo,
    error: fallo ? MENSAJE_ERROR[tipoDeError(fallo)] : null,
    tamano: zip?.length ?? null,
    sha256: zip && !fallo ? sha256(zip) : null,
    fecha
  })
  return intento('nube', fecha, fallo)
}

/** Al abrir: respaldo si el último correcto tiene más de 24 h; si no, subir lo pendiente. */
export async function alAbrir(ctx: ContextoRespaldos): Promise<void> {
  const conNube = !!registro.carpetaNube(ctx.db)
  const ultimo = registro.ultimoOk(ctx.db, conNube ? 'nube' : 'local')
  if (faltaRespaldoAlAbrir(ultimo, ahoraDe(ctx))) await crearRespaldo(ctx, 'inicio')
  else await subirPendiente(ctx)
}

// ——— Estado para la dueña ———

/** Instante ISO a partir del nombre (hora de Lima, UTC−5 todo el año). */
function fechaDeNombre(archivo: string): string {
  const n = leerNombre(archivo)!
  const [dia, hora] = n.orden.split(' ')
  return new Date(`${dia}T${hora.replace(/-/g, ':')}-05:00`).toISOString()
}

export function listarRespaldos(carpeta: string | null): ArchivoRespaldo[] {
  if (!carpeta) return []
  return listarArchivos(carpeta)
    .map((archivo) => ({ archivo, n: leerNombre(archivo) }))
    .filter((x) => x.n)
    .sort((a, b) => b.n!.orden.localeCompare(a.n!.orden))
    .map(({ archivo, n }) => {
      const ruta = join(carpeta, archivo)
      let tamano = 0
      try {
        tamano = statSync(ruta).size
      } catch {
        /* se borró mientras se listaba */
      }
      return { archivo, ruta, fecha: fechaDeNombre(archivo), tamano, antesDeRestaurar: n!.antesDeRestaurar }
    })
}

/** Carpetas de Google Drive u OneDrive de esta computadora, para sugerir dónde guardar. */
export function sugerirCarpetas(
  entorno: Record<string, string | undefined>,
  existe: (ruta: string) => boolean = existsSync
): EstadoRespaldos['sugerencias'] {
  const CARPETA = 'Respaldos Disfraces Los Mellizos'
  const vistas = new Set<string>()
  const sugerencias: EstadoRespaldos['sugerencias'] = []
  const agregar = (base: string, servicio: 'onedrive' | 'google_drive'): void => {
    const clave = base.toLowerCase()
    if (vistas.has(clave) || !existe(base)) return
    vistas.add(clave)
    sugerencias.push({ ruta: join(base, CARPETA), servicio })
  }
  for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const base = entorno[v]
    if (base) agregar(base, 'onedrive')
  }
  for (const letra of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const nombre of ['Mi unidad', 'My Drive']) agregar(`${letra}:\\${nombre}`, 'google_drive')
  }
  if (entorno.USERPROFILE) {
    for (const nombre of ['Google Drive', 'Mi unidad', 'My Drive']) agregar(join(entorno.USERPROFILE, nombre), 'google_drive')
  }
  return sugerencias
}

export function estadoRespaldos(ctx: ContextoRespaldos): EstadoRespaldos {
  const entorno = ctx.entorno ?? process.env
  const carpeta = registro.carpetaNube(ctx.db)
  const enNube = listarRespaldos(carpeta)
  return {
    carpetaNube: carpeta,
    servicioNube: carpeta ? detectarNube(carpeta, entorno) : null,
    carpetaNubeDisponible: !!carpeta && existsSync(carpeta),
    carpetaLocal: ctx.rutas.respaldosLocales,
    carpetaDatos: ctx.rutas.carpetaDatos,
    datosEnNube: detectarNube(ctx.rutas.carpetaDatos, entorno),
    ultimoOkNube: registro.ultimoOk(ctx.db, 'nube'),
    ultimoOkLocal: registro.ultimoOk(ctx.db, 'local'),
    ultimoIntento: registro.ultimoIntento(ctx.db, !!carpeta),
    enNube,
    locales: listarRespaldos(ctx.rutas.respaldosLocales),
    espacioNube: enNube.reduce((s, a) => s + a.tamano, 0),
    confirmadoNubeEn: registro.confirmadoNubeEn(ctx.db),
    sugerencias: sugerirCarpetas(entorno)
  }
}

export function avisosRespaldo(ctx: ContextoRespaldos): AvisosRespaldo {
  const entorno = ctx.entorno ?? process.env
  const ahora = ahoraDe(ctx)
  const carpeta = registro.carpetaNube(ctx.db)
  const ultimo = registro.ultimoIntento(ctx.db, !!carpeta)
  const ultimoOk = registro.ultimoOk(ctx.db, carpeta ? 'nube' : 'local')
  const enNube = carpeta && registro.ultimoOk(ctx.db, 'nube') ? masReciente(listarArchivos(carpeta)) : null
  return {
    problema: problemaDeRespaldo(ultimoOk, !!ultimo && !ultimo.ok, ahora),
    ultimoOk,
    error: ultimo && !ultimo.ok ? ultimo.error : null,
    sinCarpetaNube: !carpeta,
    recordatorioNube: enNube && tocaRecordatorioNube(registro.confirmadoNubeEn(ctx.db), true, ahora) ? { archivo: enNube } : null,
    datosEnNube: detectarNube(ctx.rutas.carpetaDatos, entorno)
  }
}

// ——— Carpeta en la nube ———

/**
 * Valida la carpeta elegida para los respaldos: no puede estar dentro de la carpeta de datos
 * (ni contenerla), y se prueba escribir, leer y borrar un archivo.
 */
export function validarCarpetaNube(ctx: ContextoRespaldos, carpeta: string): void {
  if (estaDentro(carpeta, ctx.rutas.carpetaDatos) || estaDentro(ctx.rutas.carpetaDatos, carpeta)) {
    throw new ErrorDeNegocio(
      'Esa carpeta no sirve: está junto a los datos del programa. Elija una carpeta de Google Drive u OneDrive.'
    )
  }
  try {
    mkdirSync(carpeta, { recursive: true })
    const prueba = join(carpeta, `.prueba-disfraces-${Date.now()}.tmp`)
    writeFileSync(prueba, 'prueba')
    const ok = readFileSync(prueba, 'utf8') === 'prueba'
    rmSync(prueba, { force: true })
    if (!ok) throw errorCon('EVERIFICACION', 'No coincide')
  } catch (error) {
    throw new ErrorDeNegocio(`No se puede usar esa carpeta: ${MENSAJE_ERROR[tipoDeError(error)]}.`)
  }
}

// ——— Probar y restaurar ———

export function probarRespaldo(ctx: ContextoRespaldos, ruta: string): Manifiesto {
  let zip: Uint8Array
  try {
    zip = readFileSync(ruta)
  } catch (error) {
    throw new ErrorDeNegocio(`No se pudo abrir el respaldo: ${MENSAJE_ERROR[tipoDeError(error)]}.`)
  }
  try {
    return abrirRespaldo(ctx, zip).manifiesto
  } catch (error) {
    throw new ErrorDeNegocio((error as Error).message || 'El respaldo está dañado.')
  }
}

export function vistaRestauracion(ctx: ContextoRespaldos, ruta: string): VistaRestauracion {
  const m = probarRespaldo(ctx, ruta)
  const actual = versionActual(ctx.db)
  const n = (sql: string, id: number): number => (ctx.db.prepare(sql).get(id) as { n: number }).n
  return {
    archivo: ruta,
    fecha: m.fecha,
    versionPrograma: m.versionPrograma,
    conteos: m.conteos,
    sePerderan: {
      pedidos: n('SELECT COUNT(*) AS n FROM alquileres WHERE id > ?', m.ultimoIdPedido),
      pagos: n('SELECT COUNT(*) AS n FROM pagos WHERE id > ?', m.ultimoIdPago)
    },
    impedimento:
      m.versionEsquema > actual
        ? 'Este respaldo es de una versión más nueva del programa. Actualice el programa antes de restaurarlo.'
        : null
  }
}

interface FilaUsuario {
  id: number
  nombre: string
  usuario: string
  contrasena_hash: string
  rol: string
  activo: number
  creado_en: string
  codigo_recuperacion_hash: string | null
  intentos_fallidos: number
  bloqueos: number
  bloqueado_hasta: string | null
  restablecido_por_soporte_en: string | null
}

/**
 * Lleva a la base restaurada lo que no debe volver atrás: contraseñas, código de recuperación,
 * clave de soporte, contadores de intentos, el registro de respaldos y la carpeta en la nube.
 */
function conservarCredenciales(actual: Database.Database, restaurada: Database.Database): void {
  const usuarios = actual.prepare('SELECT * FROM usuarios').all() as FilaUsuario[]
  const soporte = actual.prepare('SELECT * FROM soporte WHERE id = 1').get() as Record<string, unknown>
  const respaldos = actual.prepare('SELECT * FROM respaldos ORDER BY id').all() as Record<string, unknown>[]
  const config = actual.prepare('SELECT carpeta_respaldo, respaldo_nube_confirmado_en FROM configuracion WHERE id = 1').get() as {
    carpeta_respaldo: string
    respaldo_nube_confirmado_en: string | null
  }
  restaurada.transaction(() => {
    for (const u of usuarios) {
      const existente = restaurada.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u.usuario) as { id: number } | undefined
      const campos = [u.contrasena_hash, u.rol, u.activo, u.codigo_recuperacion_hash, u.intentos_fallidos, u.bloqueos, u.bloqueado_hasta, u.restablecido_por_soporte_en]
      if (existente) {
        restaurada
          .prepare(
            `UPDATE usuarios SET contrasena_hash = ?, rol = ?, activo = ?, codigo_recuperacion_hash = ?, intentos_fallidos = ?,
             bloqueos = ?, bloqueado_hasta = ?, restablecido_por_soporte_en = ? WHERE id = ?`
          )
          .run(...campos, existente.id)
      } else {
        const libre = !restaurada.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(u.id)
        restaurada
          .prepare(
            `INSERT INTO usuarios (id, nombre, usuario, contrasena_hash, rol, activo, codigo_recuperacion_hash, intentos_fallidos,
             bloqueos, bloqueado_hasta, restablecido_por_soporte_en, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(libre ? u.id : null, u.nombre, u.usuario, u.contrasena_hash, u.rol, u.activo, u.codigo_recuperacion_hash,
            u.intentos_fallidos, u.bloqueos, u.bloqueado_hasta, u.restablecido_por_soporte_en, u.creado_en)
      }
    }
    restaurada
      .prepare('UPDATE soporte SET clave_hash = ?, definida_en = ?, intentos_fallidos = ?, bloqueos = ?, bloqueado_hasta = ? WHERE id = 1')
      .run(soporte.clave_hash, soporte.definida_en, soporte.intentos_fallidos, soporte.bloqueos, soporte.bloqueado_hasta)
    restaurada.prepare('DELETE FROM respaldos').run()
    const insertar = restaurada.prepare(
      'INSERT INTO respaldos (id, fecha, tipo, destino, archivo, ok, error, tamano, sha256) VALUES (@id, @fecha, @tipo, @destino, @archivo, @ok, @error, @tamano, @sha256)'
    )
    for (const r of respaldos) insertar.run(r)
    restaurada
      .prepare('UPDATE configuracion SET carpeta_respaldo = ?, respaldo_nube_confirmado_en = ? WHERE id = 1')
      .run(config.carpeta_respaldo, config.respaldo_nube_confirmado_en)
  })()
}

/**
 * Restaura un respaldo. Antes: respaldo del estado actual (si falla, no se restaura).
 * Se prepara todo aparte (extraer, migrar, conservar credenciales, verificar) con la base actual
 * abierta; recién al final se cierra la base (`cerrarBase`) y se intercambian las carpetas.
 * Después hay que reiniciar la app.
 */
export async function restaurarRespaldo(
  ctx: ContextoRespaldos,
  ruta: string,
  sesion: Sesion | null,
  cerrarBase: () => void
): Promise<{ antes: ResultadoRespaldo }> {
  const vista = vistaRestauracion(ctx, ruta)
  if (vista.impedimento) throw new ErrorDeNegocio(vista.impedimento)
  const antes = await crearRespaldo(ctx, 'antes_de_restaurar')
  if (!antes.local.ok && !antes.nube?.ok) {
    throw new ErrorDeNegocio('No se pudo guardar primero un respaldo del estado actual, así que no se restauró nada.')
  }

  const { archivos, manifiesto } = abrirRespaldo(ctx, readFileSync(ruta))
  const preparando = join(ctx.rutas.carpetaDatos, 'restaurando')
  rmSync(preparando, { recursive: true, force: true })
  mkdirSync(join(preparando, 'fotos'), { recursive: true })
  try {
    writeFileSync(join(preparando, 'datos.db'), archivos['datos.db'])
    for (const [nombre, contenido] of Object.entries(archivos)) {
      if (nombre.startsWith('fotos/') && nombre.length > 'fotos/'.length) writeFileSync(join(preparando, nombre), contenido)
    }
    const restaurada = abrirBaseDeDatos(join(preparando, 'datos.db')) // aplica las migraciones que falten
    try {
      conservarCredenciales(ctx.db, restaurada)
      registrarAuditoria(restaurada, sesion, 'respaldo_restaurado', 'respaldos', null, {
        archivo: vista.archivo,
        fechaRespaldo: manifiesto.fecha,
        respaldoPrevio: antes.archivo
      })
      if (restaurada.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('integrity_check')
    } finally {
      restaurada.close()
    }
  } catch (error) {
    rmSync(preparando, { recursive: true, force: true })
    console.error('[respaldos] No se pudo preparar la restauración:', error)
    throw new ErrorDeNegocio('No se pudo preparar la restauración. No se cambió nada.')
  }

  // Intercambio. La carpeta anterior queda en "restauracion-anterior" hasta la próxima restauración.
  const anterior = join(ctx.rutas.carpetaDatos, 'restauracion-anterior')
  rmSync(anterior, { recursive: true, force: true })
  mkdirSync(anterior)
  cerrarBase()
  const hechos: [string, string][] = []
  const mover = (de: string, a: string): void => {
    if (!existsSync(de)) return
    renameSync(de, a)
    hechos.push([de, a])
  }
  try {
    mover(ctx.rutas.baseDeDatos, join(anterior, 'datos.db'))
    mover(`${ctx.rutas.baseDeDatos}-wal`, join(anterior, 'datos.db-wal'))
    mover(`${ctx.rutas.baseDeDatos}-shm`, join(anterior, 'datos.db-shm'))
    mover(ctx.rutas.fotos, join(anterior, 'fotos'))
    mover(join(preparando, 'datos.db'), ctx.rutas.baseDeDatos)
    mover(join(preparando, 'fotos'), ctx.rutas.fotos)
  } catch (error) {
    for (const [de, a] of hechos.reverse()) {
      try {
        renameSync(a, de)
      } catch (e) {
        console.error('[respaldos] No se pudo deshacer un paso de la restauración:', e)
      }
    }
    console.error('[respaldos] Falló el intercambio de la restauración:', error)
    throw Object.assign(new ErrorDeNegocio('No se pudo completar la restauración; los datos quedaron como estaban. El programa se reiniciará.'), {
      baseCerrada: true
    })
  }
  rmSync(preparando, { recursive: true, force: true })
  return { antes }
}
