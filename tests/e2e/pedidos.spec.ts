import { expect, test, type Page } from '@playwright/test'
import { sumarDias } from '../../src/shared/fechas'
import { hoyEnLima } from '../../src/shared/formato'
import { hayDesbordeHorizontal, lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

let a: AppDePrueba
let v: Page
const HOY = hoyEnLima()
const dia = (n: number): string => sumarDias(HOY, n)

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  a = await lanzarApp()
  v = a.ventana
  await ventanaMinima(a.app, v)
  // Datos iniciales con la API real de la app
  await v.evaluate(async () => {
    const api = (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api
    const ok = async <T,>(r: Promise<import('../../src/shared/ipc').Resultado<T>>): Promise<T> => {
      const x = await r
      if (!x.ok) throw new Error(x.error)
      return x.datos
    }
    const huaylas = await ok(
      api.modelos.crear({ nombre: 'Huaylas mujer', categoria: 'Danzas típicas', region: 'sierra', descripcion: '', precioAlquiler: 4500, prefijo: 'HUM' })
    )
    const codigosH = await ok(api.unidades.sugerirCodigos(huaylas, 5))
    await ok(api.unidades.crear({ modeloId: huaylas, talla: '10', codigos: codigosH, piezas: [] }))
    const pirata = await ok(
      api.modelos.crear({ nombre: 'Pirata', categoria: 'Personajes', region: null, descripcion: '', precioAlquiler: 3000, prefijo: 'PIR' })
    )
    await ok(api.unidades.crear({ modeloId: pirata, talla: 'M', codigos: ['PIR-001'], piezas: [] }))
    await ok(
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
    await ok(
      api.clientes.crear({
        tipo: 'persona',
        tipoDocumento: 'dni',
        numeroDocumento: '40123456',
        nombres: 'María Quispe',
        telefono: '987654321',
        direccion: '',
        observaciones: ''
      })
    )
  })
})

test.afterAll(async () => {
  await a?.cerrar()
})

async function nuevoPedido(buscarCliente: string, salida: string, devolucion: string, evento: string): Promise<void> {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Alquileres' }).click()
  await v.getByRole('link', { name: '+ Nuevo pedido' }).click()
  await v.getByPlaceholder('Buscar por nombre, DNI, colegio o responsable').fill(buscarCliente)
  await v.getByRole('list', { name: 'Clientes encontrados' }).getByRole('button').first().click()
  await v.getByLabel('Salida').fill(salida)
  await v.getByLabel('Devolución').fill(devolucion)
  await v.getByLabel('Evento').fill(evento)
}

async function agregarDisfraz(buscar: string, talla: string, cantidad: number): Promise<void> {
  await v.getByLabel('Buscar disfraz').fill('') // si ya decía lo mismo, React no vería el cambio
  await v.getByLabel('Buscar disfraz').fill(buscar)
  await v.getByRole('list', { name: 'Disfraces encontrados' }).getByRole('button').first().click()
  await v.getByRole('radio', { name: new RegExp(`^T${talla}\\b`) }).click()
  await v.getByLabel('Cantidad', { exact: true }).fill(String(cantidad))
  await v.getByRole('button', { name: 'Agregar al pedido' }).click()
}

const pedidoPanel = () => v.getByRole('complementary', { name: 'Pedido' })

test('pedido de colegio por cantidad: faltan 3 y quedan por confeccionar', async () => {
  await nuevoPedido('girasoles', dia(10), dia(12), 'Día de la Madre')
  await expect(v.getByRole('radio', { name: /^T10/ })).toHaveCount(0) // aún no se eligió disfraz
  await v.getByLabel('Buscar disfraz').fill('huaylas')
  await v.getByRole('list', { name: 'Disfraces encontrados' }).getByRole('button').first().click()
  await expect(v.getByRole('radio', { name: /^T10/ })).toContainText('5 libres de 5')

  await agregarDisfraz('huaylas', '10', 8)
  const dialogo = v.getByRole('dialog', { name: 'Hay 5 libres, faltan 3' })
  await expect(dialogo.getByLabel('Fecha límite de confección')).toHaveValue(dia(8)) // 2 días antes de la salida
  await dialogo.getByRole('button', { name: 'Agregar 5 y confeccionar 3' }).click()

  const panel = pedidoPanel()
  await expect(panel.getByRole('region', { name: 'Huaylas mujer talla 10', exact: true })).toContainText('Huaylas mujer · T10 × 5')
  await expect(panel.getByRole('region', { name: 'Por confeccionar Huaylas mujer talla 10' })).toBeVisible()
  await expect(panel).toContainText('S/ 360.00') // 8 × 45

  await v.getByLabel('Adelanto', { exact: true }).fill('100')
  await expect(panel).toContainText('S/ 260.00')
  await expect(v.getByLabel('Tipo de garantía')).toHaveValue('dni') // colegio: DNI de la responsable
  await v.getByRole('button', { name: 'Guardar reserva' }).click()

  await expect(v.getByRole('heading', { level: 1, name: /Pedido N\.° 1/ })).toBeVisible()
  await expect(v.getByRole('listitem', { name: 'Pendiente Huaylas mujer talla 10' })).toContainText('faltan 3 de 3')
})

test('en las mismas fechas ya no hay Huaylas libres', async () => {
  await nuevoPedido('maría', dia(11), dia(11), 'Otro')
  await v.getByLabel('Buscar disfraz').fill('huaylas')
  await v.getByRole('list', { name: 'Disfraces encontrados' }).getByRole('button').first().click()
  await expect(v.getByRole('radio', { name: /^T10/ })).toContainText('0 libres de 5')
  await v.getByRole('button', { name: 'Elegir otro' }).click()

  await agregarDisfraz('pirata', 'M', 1)
  await expect(pedidoPanel()).toContainText('Pirata · TM × 1')
  await v.getByRole('button', { name: 'Guardar reserva' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /Pedido N\.° 2/ })).toBeVisible()
})

test('al cambiar las fechas, lo que ya no está libre se marca en rojo y no se puede guardar', async () => {
  await nuevoPedido('maría', dia(30), dia(31), 'Primavera')
  await agregarDisfraz('pirata', 'M', 1)
  await expect(pedidoPanel()).toContainText('Pirata · TM × 1')

  await v.getByLabel('Salida').fill(dia(11))
  await v.getByLabel('Devolución').fill(dia(12))
  await expect(pedidoPanel()).toContainText('1 unidad ya no está libre')
  await expect(pedidoPanel()).toContainText(/PIR-001 está reservado del .* para María Quispe/)
  await v.getByRole('button', { name: 'Guardar reserva' }).click()
  await expect(pedidoPanel().getByRole('alert')).toContainText('Hay disfraces que ya no están libres')

  await v.getByRole('button', { name: 'Quitar PIR-001' }).click()
  await expect(pedidoPanel()).toContainText('Todavía no hay disfraces en el pedido.')
})

test('los campos de fecha usan el formato de Perú (dd/mm/aaaa)', async () => {
  // Chromium usa el paquete es-419 (español de Latinoamérica) para es-PE: fechas dd/mm/aaaa.
  const idioma = await v.evaluate(() => navigator.language)
  expect(idioma).toMatch(/^es/)
  if (process.env.CAPTURAS) await v.screenshot({ path: `${process.env.CAPTURAS}/pedido-fechas.png` })
})

test('la pantalla del pedido cabe a 1366×768', async () => {
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  await expect(v.getByRole('button', { name: 'Guardar reserva' })).toBeInViewport()
})

test('editar: "aplicar este precio a todos" cambia unidades y pendientes del modelo', async () => {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Alquileres' }).click()
  await v.getByRole('list', { name: 'Lista de pedidos' }).getByRole('link', { name: /N\.° 1/ }).click()
  await v.getByRole('link', { name: 'Editar pedido' }).click()

  const grupo = pedidoPanel().getByRole('region', { name: 'Huaylas mujer talla 10', exact: true })
  await grupo.getByLabel('c/u').fill('40')
  await grupo.getByLabel('c/u').press('Enter')
  await grupo.getByRole('button', { name: 'Aplicar este precio a todos los Huaylas mujer del pedido' }).click()
  await expect(pedidoPanel()).toContainText('S/ 320.00') // 8 × 40
  // Con carrito y pendientes, a 1366×768 tampoco se desborda
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  await v.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /Pedido N\.° 1/ })).toBeVisible()
  await expect(v.getByText('con descuento')).toBeVisible()
})

test('al agregar unidades en Disfraces, se asignan al pedido que las espera', async () => {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Disfraces' }).click()
  await v.getByRole('link', { name: /^Huaylas mujer/ }).click()
  await v.getByRole('button', { name: '+ Agregar unidades' }).click()
  const agregar = v.getByRole('dialog')
  await agregar.getByLabel('Talla', { exact: true }).selectOption('10')
  await agregar.getByLabel('¿Cuántas unidades?').fill('3')
  await expect(agregar.getByLabel('Código de la unidad 3')).toBeVisible()
  await agregar.getByRole('button', { name: 'Agregar 3 unidades' }).click()

  const dialogo = v.getByRole('dialog', { name: 'Hay pedidos esperando Huaylas mujer talla 10' })
  await expect(dialogo).toContainText('I.E. Los Girasoles')
  await dialogo.getByRole('button', { name: 'Asignar 3 aquí' }).click()
  await expect(dialogo).toContainText('HUM-006, HUM-007, HUM-008 asignadas al pedido N.° 1')
  await dialogo.getByRole('button', { name: 'Listo' }).click()

  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Alquileres' }).click()
  const fila = v.getByRole('list', { name: 'Lista de pedidos' }).getByRole('link', { name: /N\.° 1/ })
  await expect(fila).toContainText('8 disfraces')
  await expect(fila).not.toContainText('por confeccionar')
  await fila.click()
  await expect(v.getByRole('listitem', { name: 'Pendiente Huaylas mujer talla 10' })).toContainText('3 asignadas')
})

test('cancelar devolviendo parte del adelanto libera los disfraces', async () => {
  await v.getByRole('button', { name: 'Cancelar pedido' }).click()
  const dialogo = v.getByRole('dialog', { name: '¿Cancelar el pedido?' })
  await expect(dialogo).toContainText('El cliente pagó S/ 100.00 de adelanto')
  await dialogo.getByLabel('Devolver una parte').check()
  await dialogo.getByLabel('Monto a devolver').fill('150')
  await dialogo.getByRole('button', { name: 'Sí, cancelar pedido' }).click()
  await expect(dialogo.getByRole('alert')).toContainText('No puede devolver más del adelanto pagado (S/ 100.00)')
  await dialogo.getByLabel('Monto a devolver').fill('50')
  await dialogo.getByRole('button', { name: 'Sí, cancelar pedido' }).click()

  await expect(v.getByText('Cancelado', { exact: true }).first()).toBeVisible()
  await expect(v.getByText('Devolución de adelanto')).toBeVisible()
  await expect(v.getByRole('link', { name: 'Editar pedido' })).toHaveCount(0)

  // Las 8 Huaylas talla 10 vuelven a estar libres en esas fechas
  await nuevoPedido('girasoles', dia(10), dia(12), 'Día de la Madre')
  await agregarDisfraz('huaylas', '10', 8)
  await expect(v.getByRole('dialog')).toHaveCount(0)
  await expect(pedidoPanel()).toContainText('Huaylas mujer · T10 × 8')
})
