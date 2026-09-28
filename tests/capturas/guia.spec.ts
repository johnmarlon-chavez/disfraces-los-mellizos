// Genera las capturas de la guía de uso (src/renderer/src/guia/capturas/*.jpg) con datos ficticios,
// a 1366×768 como la laptop de la tienda. Volver a ejecutarlo en cada versión: npm run capturas.
import { basename, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { sumarDias } from '../../src/shared/fechas'
import { hoyEnLima } from '../../src/shared/formato'
import { CONTRASENA_DUENA, lanzarApp, ventanaMinima, type AppDePrueba } from '../e2e/ayudante'

const CARPETA = join(process.cwd(), 'src', 'renderer', 'src', 'guia', 'capturas')
const HOY = hoyEnLima()
const dia = (n: number): string => sumarDias(HOY, n)
let a: AppDePrueba
let v: Page

const capturar = (nombre: string): Promise<Buffer> => v.screenshot({ path: join(CARPETA, `${nombre}.jpg`), type: 'jpeg', quality: 82 })
const menu = (): ReturnType<Page['getByRole']> => v.getByRole('navigation', { name: 'Menú principal' })

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  a = await lanzarApp()
  v = a.ventana
  await ventanaMinima(a.app, v)
  await v.evaluate(
    async ([hoy, en2, en3, en6, en8, nube]) => {
      const api = (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api
      const ok = async <T,>(r: Promise<import('../../src/shared/ipc').Resultado<T>>): Promise<T> => {
        const x = await r
        if (!x.ok) throw new Error(x.error)
        return x.datos
      }
      const modelo = async (nombre: string, prefijo: string, region: 'costa' | 'sierra' | 'selva', precio: number, talla: string, n: number): Promise<number> => {
        const id = await ok(api.modelos.crear({ nombre, categoria: 'Danzas típicas', region, descripcion: '', precioAlquiler: precio, prefijo }))
        await ok(
          api.unidades.crear({
            modeloId: id,
            talla,
            codigos: await ok(api.unidades.sugerirCodigos(id, n)),
            piezas: [
              { nombre: 'Sombrero', costoReposicion: 3000 },
              { nombre: 'Pañuelo', costoReposicion: 1000 }
            ]
          })
        )
        return id
      }
      const huaylas = await modelo('Huaylas mujer', 'HUM', 'sierra', 4500, '10', 8)
      const marinera = await modelo('Marinera varón', 'MAV', 'costa', 5000, '12', 4)
      await modelo('Caporales varón', 'CAV', 'sierra', 5500, 'M', 3)
      const colegio = await ok(
        api.clientes.crear({
          tipo: 'colegio',
          nombres: 'I.E. Los Girasoles',
          distrito: 'La Esperanza',
          responsable: 'Carmen Rojas',
          dniResponsable: '45678901',
          telefono: '949111222',
          ruc: '',
          direccion: '',
          observaciones: ''
        })
      )
      const persona = await ok(
        api.clientes.crear({ tipo: 'persona', tipoDocumento: 'dni', numeroDocumento: '40123456', nombres: 'María Quispe', telefono: '987654321', direccion: '', observaciones: '' })
      )
      const pedir = async (cliente: number, modeloId: number, talla: string, n: number, precio: number, salida: string, dev: string, evento: string, adelanto: number): Promise<number> => {
        const libres = await ok(api.pedidos.unidadesLibres(modeloId, talla, { inicio: salida, fin: dev }, null, []))
        return ok(
          api.pedidos.crear({
            clienteId: cliente,
            fechaSalida: salida,
            fechaDevolucionPactada: dev,
            evento,
            gradoSeccion: '',
            observaciones: '',
            garantiaTipo: 'dni',
            garantiaMonto: 0,
            lineas: libres.slice(0, n).map((u) => ({ unidadId: u.unidadId, precioCobrado: precio })),
            pendientes: [],
            adelanto: adelanto ? { monto: adelanto, medio: 'yape' } : null
          })
        )
      }
      // N.° 1: sale hoy (aparece en Inicio); N.° 2: ya entregado, para la devolución; N.° 3: próxima semana.
      await pedir(colegio, huaylas, '10', 5, 4500, hoy, en3, 'Día de la Madre', 5000)
      const p2 = await pedir(persona, marinera, '12', 2, 5000, hoy, en2, 'Aniversario del colegio', 3000)
      const f2 = await ok(api.pedidos.obtener(p2))
      await ok(
        api.entregas.entregar(
          p2,
          {
            detalleIds: f2.lineas.map((l) => l.detalleId),
            adelantarSalida: false,
            lavanderiaConfirmada: false,
            pagos: [{ monto: 7000, medio: 'efectivo' }],
            saldoPendienteAutorizado: false,
            garantia: { tipo: 'dni', monto: 0, medio: 'efectivo', documento: '40123456' }
          },
          null
        )
      )
      await pedir(persona, huaylas, '10', 1, 4500, en6, en8, 'Primavera', 0)
      // Como en la tienda: los respaldos van a una carpeta de Google Drive (aquí, una carpeta de prueba).
      await ok(api.respaldos.usarCarpeta(nube))
      await ok(api.acceso.salir())
    },
    [HOY, dia(2), dia(3), dia(6), dia(8), join(a.carpetaDatos, '..', `${basename(a.carpetaDatos)}-nube`, 'Mi unidad', 'Respaldos')] as const
  )
  await v.reload()
})

test.afterAll(async () => {
  await a?.cerrar()
})

test('ingreso', async () => {
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill('ejemplo de contraseña')
  await capturar('ingreso')
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill(CONTRASENA_DUENA)
  await v.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(v.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
})

test('inicio', async () => {
  await expect(v.getByRole('region', { name: 'Entregas de hoy' })).toContainText('I.E. Los Girasoles')
  await capturar('inicio')
})

test('pedido', async () => {
  await menu().getByRole('link', { name: 'Alquileres' }).click()
  await v.getByRole('link', { name: '+ Nuevo pedido' }).click()
  await v.getByPlaceholder('Buscar por nombre, DNI, colegio o responsable').fill('girasoles')
  await v.getByRole('list', { name: 'Clientes encontrados' }).getByRole('button').first().click()
  await v.getByLabel('Salida').fill(dia(10))
  await v.getByLabel('Devolución').fill(dia(12))
  await v.getByLabel('Evento').fill('Fiestas Patrias')
  await v.getByLabel('Buscar disfraz').fill('marinera')
  await v.getByRole('list', { name: 'Disfraces encontrados' }).getByRole('button').first().click()
  await v.getByRole('radio', { name: /^T12\b/ }).click()
  await v.getByLabel('Cantidad', { exact: true }).fill('4')
  await v.getByRole('button', { name: 'Agregar al pedido' }).click()
  await v.getByLabel('Adelanto', { exact: true }).fill('80')
  await expect(v.getByText(/agregados: MAV-001/)).toHaveCount(0, { timeout: 15_000 }) // que se vaya el aviso
  await v.locator('main').evaluate((m) => m.scrollTo(0, 0))
  await capturar('pedido')
})

test('entregar', async () => {
  await menu().getByRole('link', { name: 'Alquileres' }).click()
  await v.getByRole('list', { name: 'Lista de pedidos' }).getByRole('link', { name: /N\.° 1/ }).click()
  await expect(v.getByRole('button', { name: 'Entregar', exact: true })).toBeVisible()
  await capturar('entregar')
})

test('devolucion', async () => {
  await v.reload() // sin los mensajes de la captura anterior
  await menu().getByRole('link', { name: 'Alquileres' }).click()
  await v.getByRole('list', { name: 'Lista de pedidos' }).getByRole('link', { name: /N\.° 2/ }).click()
  await v.getByRole('link', { name: 'Registrar devolución' }).click()
  await v.getByLabel('MAV-001', { exact: true }).check()
  await v.getByLabel('MAV-002', { exact: true }).check()
  const mav2 = v.getByRole('listitem').filter({ hasText: 'MAV-002' })
  await mav2.getByRole('button', { name: 'Revisar piezas y daños' }).click()
  await mav2.getByLabel('Pañuelo').uncheck()
  await capturar('devolucion')
})

test('guardando respaldo', async () => {
  await menu().getByRole('link', { name: 'Inicio' }).click()
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('respaldo:guardando'))
  await expect(v.getByText('Guardando respaldo…')).toBeVisible()
  await capturar('guardando')
})
