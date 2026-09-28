import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { CONTRASENA_DUENA, hayDesbordeHorizontal, lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

type Api = import('../../src/shared/ipc').ApiDisfraces
const PATRON = /^Respaldo Disfraces \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}( \(antes de restaurar\))?\.zip$/

let raiz: string
let nube: string
let abierta: AppDePrueba | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), 'disfraces-nube-'))
  nube = join(raiz, 'Mi unidad', 'Respaldos Disfraces Los Mellizos')
})

test.afterEach(async () => {
  await abierta?.cerrar()
  abierta = null
})

test.afterAll(() => rmSync(raiz, { recursive: true, force: true }))

const respaldosEn = (carpeta: string): string[] => (existsSync(carpeta) ? readdirSync(carpeta).filter((f) => PATRON.test(f)) : [])

async function irA(v: Page, seccion: string): Promise<void> {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: seccion }).click()
  await expect(v.getByRole('heading', { level: 1, name: seccion })).toBeVisible()
}

/** Llama a window.api.<grupo>.<metodo>(...args) en la ventana; lanza el mensaje de error si falla. */
async function api<T>(v: Page, metodo: string, ...args: unknown[]): Promise<T> {
  const r = (await v.evaluate(
    ([metodo, args]) => {
      const [grupo, nombre] = (metodo as string).split('.')
      const api = (window as unknown as { api: Record<string, Record<string, (...a: unknown[]) => unknown>> }).api
      return api[grupo][nombre](...(args as unknown[]))
    },
    [metodo, args] as const
  )) as import('../../src/shared/ipc').Resultado<T>
  if (!r.ok) throw new Error(r.error)
  return r.datos
}

/** Crea un pedido con un adelanto (un pedido y un pago), por la API. */
async function crearPedido(v: Page, dni: string, prefijo: string): Promise<void> {
  await v.evaluate(
    async ([dni, prefijo]) => {
      const api = (window as unknown as { api: Api }).api
      const ok = async <T,>(r: Promise<import('../../src/shared/ipc').Resultado<T>>): Promise<T> => {
        const x = await r
        if (!x.ok) throw new Error(x.error)
        return x.datos
      }
      const modelo = await ok(api.modelos.crear({ nombre: `Pirata ${prefijo}`, categoria: 'Personajes', region: null, descripcion: '', precioAlquiler: 3000, prefijo }))
      await ok(api.unidades.crear({ modeloId: modelo, talla: 'M', codigos: [`${prefijo}-001`], piezas: [] }))
      const cliente = await ok(
        api.clientes.crear({ tipo: 'persona', tipoDocumento: 'dni', numeroDocumento: dni, nombres: `Cliente ${dni}`, telefono: '987654321', direccion: '', observaciones: '' })
      )
      const libres = await ok(api.pedidos.unidadesLibres(modelo, 'M', { inicio: '2027-01-10', fin: '2027-01-12' }, null, []))
      await ok(
        api.pedidos.crear({
          clienteId: cliente,
          fechaSalida: '2027-01-10',
          fechaDevolucionPactada: '2027-01-12',
          evento: 'Otro',
          gradoSeccion: '',
          observaciones: '',
          garantiaTipo: null,
          garantiaMonto: 0,
          lineas: [{ unidadId: libres[0].unidadId, precioCobrado: 3000 }],
          pendientes: [],
          adelanto: { monto: 1000, medio: 'yape' }
        })
      )
    },
    [dni, prefijo] as const
  )
}

test('sin carpeta en la nube: aviso en Inicio, respaldo local verificado desde Configuración', async () => {
  abierta = await lanzarApp()
  const v = abierta.ventana
  await ventanaMinima(abierta.app, v)
  await expect(v.getByLabel('Respaldos')).toContainText('Los respaldos solo se guardan en esta computadora')
  await expect(v.getByRole('region', { name: 'Devoluciones vencidas' })).toBeInViewport()

  await irA(v, 'Configuración')
  const panel = v.getByRole('region', { name: 'Respaldos' })
  await expect(panel).toContainText('Solo se guardan en esta computadora')
  await panel.getByRole('button', { name: 'Hacer un respaldo ahora' }).click()
  await expect(v.getByText('Respaldo guardado y verificado en esta computadora.')).toBeVisible()
  await expect(panel.getByRole('status')).toContainText('✔ Último respaldo:')
  await panel.getByRole('button', { name: 'Probar el último respaldo' }).click()
  await expect(v.getByText(/está bien: 0 clientes, 0 pedidos y 0 fotos/)).toBeVisible()
  expect(respaldosEn(join(abierta.carpetaDatos, 'respaldos')).length).toBeGreaterThanOrEqual(1)
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  // La carpeta de datos no puede ser la de respaldos
  await expect(api(v, 'respaldos.usarCarpeta', join(abierta.carpetaDatos, 'nube'))).rejects.toThrow('está junto a los datos del programa')
})

test('con carpeta de Google Drive: respaldo en la nube, recordatorio en Inicio y respaldo al cerrar', async () => {
  abierta = await lanzarApp()
  const v = abierta.ventana
  await api(v, 'respaldos.usarCarpeta', nube)
  await irA(v, 'Configuración')
  const panel = v.getByRole('region', { name: 'Respaldos' })
  await expect(panel).toContainText('En Google Drive:')
  await panel.getByRole('button', { name: 'Hacer un respaldo ahora' }).click()
  await expect(v.getByText('Respaldo guardado y verificado, en la nube y en esta computadora.')).toBeVisible()
  expect(respaldosEn(nube)).toHaveLength(1)

  await irA(v, 'Inicio')
  const recordatorio = v.getByRole('region', { name: 'Revisar respaldo en el celular' })
  await expect(recordatorio).toContainText(respaldosEn(nube)[0])
  await recordatorio.getByRole('button', { name: 'Sí, lo vi en mi celular' }).click()
  await expect(recordatorio).toHaveCount(0)

  const antes = respaldosEn(nube).length
  const carpeta = abierta.carpetaDatos
  await v.waitForTimeout(1100) // otro segundo: otro nombre de archivo
  await abierta.cerrar(true)
  abierta = null
  expect(respaldosEn(nube).length).toBeGreaterThan(antes) // el de cierre
  rmSync(carpeta, { recursive: true, force: true })
})

test('si la carpeta de la nube no está al cerrar: "Reintentar / Cerrar igual", copia local y se sube sola al volver', async () => {
  const nubeFallida = join(raiz, 'G-unidad', 'Mi unidad', 'Respaldos')
  abierta = await lanzarApp()
  const carpeta = abierta.carpetaDatos
  await api(abierta.ventana, 'respaldos.usarCarpeta', nubeFallida)
  rmSync(join(raiz, 'G-unidad'), { recursive: true, force: true }) // "la app de Drive está cerrada"
  const locales = respaldosEn(join(carpeta, 'respaldos')).length

  // El diálogo nativo se reemplaza: responde "Cerrar igual" y anota el mensaje en un archivo,
  // porque la app termina enseguida.
  const anotado = join(raiz, 'mensaje-cierre.txt')
  await abierta.app.evaluate(({ dialog }, archivo) => {
    const fs = process.getBuiltinModule('node:fs')
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const opciones = (args.length > 1 ? args[1] : args[0]) as { detail?: string; buttons?: string[] }
      fs.appendFileSync(archivo, `${opciones.detail} | ${opciones.buttons?.join(' / ')}\n`)
      return { response: 1, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, anotado)
  await abierta.app.close()
  const texto = readFileSync(anotado, 'utf8')
  expect(texto).toContain('No se pudo guardar el respaldo en la nube: la carpeta de respaldos no está disponible')
  expect(texto).toContain('Se guardó una copia en esta computadora')
  expect(texto).toContain('Reintentar / Cerrar igual')
  abierta = null
  expect(respaldosEn(join(carpeta, 'respaldos')).length).toBeGreaterThan(locales)

  // Al volver: aviso rojo en Inicio; con la carpeta disponible, la copia pendiente se sube sola.
  mkdirSync(join(raiz, 'G-unidad', 'Mi unidad'), { recursive: true })
  abierta = await lanzarApp({ carpetaDatos: carpeta, cuentas: false })
  const v = abierta.ventana
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill(CONTRASENA_DUENA)
  await v.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(v.getByLabel('Respaldos')).toContainText('El último respaldo falló')
  await expect.poll(() => respaldosEn(nubeFallida).length, { timeout: 15_000 }).toBeGreaterThan(0)
})

test('restaurar: pide la contraseña, avisa qué se pierde y conserva la contraseña actual', async () => {
  abierta = await lanzarApp()
  let v = abierta.ventana
  const carpeta = abierta.carpetaDatos
  await ventanaMinima(abierta.app, v)
  await crearPedido(v, '40123456', 'PIA')
  const respaldo = await api<{ archivo: string }>(v, 'respaldos.hacerAhora')
  await crearPedido(v, '40999888', 'PIB')
  await api(v, 'acceso.cambiarMiContrasena', CONTRASENA_DUENA, 'marinera en la plaza')
  const ruta = join(carpeta, 'respaldos', respaldo.archivo)
  // "Elegir otro archivo…" abre un diálogo nativo: se reemplaza para devolver el respaldo.
  await abierta.app.evaluate(({ dialog }, r) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [r] })) as typeof dialog.showOpenDialog
  }, ruta)

  await irA(v, 'Configuración')
  await v.getByRole('button', { name: 'Restaurar un respaldo…' }).click()
  await v.getByRole('button', { name: 'Elegir otro archivo…' }).click()
  const dialogo = v.getByRole('dialog', { name: '¿Restaurar este respaldo?' })
  await expect(dialogo).toContainText('Sus contraseñas, su código de recuperación y la clave de soporte no cambian.')
  await expect(dialogo).toContainText('1 pedidos y 1 pagos')
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  await dialogo.getByLabel('Su contraseña (dueña)', { exact: true }).fill('no es la mía')
  await dialogo.getByRole('button', { name: 'Sí, restaurar' }).click()
  await expect(dialogo).toContainText('La contraseña de la dueña no es correcta.')
  await dialogo.getByLabel('Su contraseña (dueña)', { exact: true }).fill('marinera en la plaza')
  const cerrado = abierta.app.waitForEvent('close')
  await dialogo.getByRole('button', { name: 'Sí, restaurar' }).click()
  await expect(v.getByText('Respaldo restaurado. El programa se está reiniciando…')).toBeVisible()
  await cerrado
  abierta = null

  // Se reabre: la contraseña es la actual y solo está el primer pedido.
  abierta = await lanzarApp({ carpetaDatos: carpeta, cuentas: false })
  v = abierta.ventana
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill('marinera en la plaza')
  await v.getByRole('button', { name: 'Entrar', exact: true }).click()
  await irA(v, 'Alquileres')
  await expect(v.getByText('Cliente 40123456')).toBeVisible()
  await expect(v.getByText('Cliente 40999888')).toHaveCount(0)
  expect(respaldosEn(join(carpeta, 'respaldos')).some((f) => f.includes('(antes de restaurar)'))).toBe(true)
})
