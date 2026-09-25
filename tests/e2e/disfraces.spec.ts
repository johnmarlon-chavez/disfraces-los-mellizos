import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { hayDesbordeHorizontal, lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

let a: AppDePrueba
let v: Page

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  a = await lanzarApp()
  v = a.ventana
  await ventanaMinima(a.app, v)
})

test.afterAll(async () => {
  await a?.cerrar()
})

async function irADisfraces(): Promise<void> {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Disfraces' }).click()
  await expect(v.getByRole('heading', { level: 1, name: 'Disfraces' })).toBeVisible()
}

async function crearDisfraz(nombre: string, categoria: string, precio: string): Promise<void> {
  await irADisfraces()
  await v.getByRole('link', { name: '+ Nuevo disfraz' }).click()
  await v.getByLabel('Nombre').fill(nombre)
  await v.getByLabel('Categoría').fill(categoria)
  await v.getByLabel('Precio de alquiler').fill(precio)
  await v.getByRole('button', { name: 'Guardar disfraz' }).click()
  await expect(v.getByRole('heading', { level: 1, name: nombre })).toBeVisible()
}

async function agregarUnidades(talla: string, cantidad: number, piezas: [string, string][] = []): Promise<void> {
  await v.getByRole('button', { name: '+ Agregar unidades' }).click()
  const dialogo = v.getByRole('dialog')
  await dialogo.getByLabel('Talla').fill(talla)
  await dialogo.getByLabel('¿Cuántas unidades?').fill(String(cantidad))
  for (const [nombre, costo] of piezas) {
    await dialogo.getByRole('button', { name: '+ Agregar pieza' }).click()
    await dialogo.getByPlaceholder('Ej. Máscara').last().fill(nombre)
    await dialogo.getByPlaceholder('0.00').last().fill(costo)
  }
  await expect(dialogo.getByLabel(`Código de la unidad ${cantidad}`)).toBeVisible()
  await dialogo.getByRole('button', { name: /^Agregar \d+ unidad/ }).click()
  await expect(dialogo).toBeHidden()
}

const fila = (codigo: string) => v.getByRole('row', { name: new RegExp(codigo) })

test('el precio no acepta formatos ambiguos y explica cómo escribirlo', async () => {
  await irADisfraces()
  await v.getByRole('link', { name: '+ Nuevo disfraz' }).click()
  await v.getByLabel('Nombre').fill('Prueba')
  await v.getByLabel('Categoría').fill('Otros')
  await v.getByLabel('Precio de alquiler').fill('1.250,00')
  await v.getByRole('button', { name: 'Guardar disfraz' }).click()
  await expect(v.getByText('No se entiende el monto "1.250,00". Escríbalo sin separador de miles, por ejemplo 1250.50')).toBeVisible()
})

test('crear un disfraz con precio en coma decimal y agregar unidades con piezas', async () => {
  await crearDisfraz('Spiderman', 'Superhéroes', '35,5')
  await expect(v.getByLabel('Precio de alquiler')).toHaveValue('35.50')
  await agregarUnidades('8', 3, [
    ['Traje', '60'],
    ['Máscara', '20,50']
  ])
  for (const codigo of ['SPI-001', 'SPI-002', 'SPI-003']) {
    await expect(fila(codigo)).toContainText('Disponible')
  }
  // Las unidades nuevas copian las piezas de las existentes
  await agregarUnidades('10', 1)
  await fila('SPI-004').getByRole('button', { name: 'Piezas y datos' }).click()
  const dialogo = v.getByRole('dialog', { name: 'Unidad SPI-004' })
  await expect(dialogo.getByPlaceholder('Ej. Máscara')).toHaveCount(2)
  await expect(dialogo.getByPlaceholder('0.00').nth(1)).toHaveValue('20.50')
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
})

test('"Spiderman Negro" recibe un prefijo distinto de "Spiderman"', async () => {
  await crearDisfraz('Spiderman Negro', 'Superhéroes', '40')
  await agregarUnidades('M', 1)
  await expect(fila('SPN-001')).toBeVisible()
})

test('cambiar el precio desde la ficha', async () => {
  await irADisfraces()
  await v.getByRole('link', { name: /^Spiderman Superhéroes/ }).click()
  await v.getByLabel('Precio de alquiler').fill('42')
  await v.getByRole('button', { name: 'Guardar precio' }).click()
  await expect(v.getByRole('status').filter({ hasText: 'Precio actualizado a S/ 42.00' })).toBeVisible()
})

test('mandar a lavandería y volver a disponible', async () => {
  await fila('SPI-002').getByRole('button', { name: 'A lavandería' }).click()
  await expect(fila('SPI-002')).toContainText('En lavandería')
  await fila('SPI-002').getByRole('button', { name: 'Marcar disponible' }).click()
  await expect(fila('SPI-002')).toContainText('Disponible')
})

test('dar de baja pide confirmación y se puede reactivar', async () => {
  await fila('SPI-003').getByRole('button', { name: 'Piezas y datos' }).click()
  await v.getByRole('dialog', { name: 'Unidad SPI-003' }).getByRole('button', { name: 'Dar de baja' }).click()

  const confirmacion = v.getByRole('dialog', { name: '¿Dar de baja SPI-003?' })
  await confirmacion.getByRole('button', { name: 'No, volver' }).click()
  await expect(confirmacion).toBeHidden()

  // Escape cierra solo la confirmación, no la ventana de la unidad que está debajo
  await v.getByRole('dialog', { name: 'Unidad SPI-003' }).getByRole('button', { name: 'Dar de baja' }).click()
  await expect(confirmacion).toBeVisible()
  await v.keyboard.press('Escape')
  await expect(confirmacion).toBeHidden()
  await expect(v.getByRole('dialog', { name: 'Unidad SPI-003' })).toBeVisible()

  await v.getByRole('dialog', { name: 'Unidad SPI-003' }).getByRole('button', { name: 'Dar de baja' }).click()
  await v.getByRole('dialog', { name: '¿Dar de baja SPI-003?' }).getByRole('button', { name: 'Sí, dar de baja' }).click()
  await expect(fila('SPI-003')).toContainText('De baja')

  await fila('SPI-003').getByRole('button', { name: 'Piezas y datos' }).click()
  await v.getByRole('dialog', { name: 'Unidad SPI-003' }).getByRole('button', { name: 'Reactivar unidad' }).click()
  await v.getByRole('dialog', { name: '¿Reactivar SPI-003?' }).getByRole('button', { name: 'Sí, reactivar' }).click()
  await expect(fila('SPI-003')).toContainText('Disponible')
})

test('la ficha se ve completa a 1366×768 sin desbordarse', async () => {
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  await v.locator('main').evaluate((m) => m.scrollTo(0, 0))
  await expect(v.getByRole('button', { name: 'Guardar precio' })).toBeInViewport()
  if (process.env.CAPTURAS) await v.screenshot({ path: join(process.env.CAPTURAS, 'ficha.png') })
})

test('elegir una foto grande la reduce a 1200 px y se muestra', async () => {
  const imagen = await a.app.evaluate(({ nativeImage }) => {
    const ancho = 2400
    const alto = 1600
    const pixeles = Buffer.alloc(ancho * alto * 4, 200)
    return nativeImage.createFromBitmap(pixeles, { width: ancho, height: alto }).toJPEG(80).toString('base64')
  })
  const ruta = join(a.carpetaDatos, 'foto-original.jpg')
  writeFileSync(ruta, Buffer.from(imagen, 'base64'))
  await a.app.evaluate(({ dialog }, r) => {
    dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [r] })) as typeof dialog.showOpenDialog
  }, ruta)

  await v.getByRole('button', { name: 'Elegir foto' }).click()
  const foto = v.getByRole('img', { name: 'Foto de Spiderman' })
  await expect(foto).toBeVisible()
  await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200)

  const guardadas = readdirSync(join(a.carpetaDatos, 'fotos'))
  expect(guardadas).toHaveLength(1)
  expect(guardadas[0]).toMatch(/^modelo-\d+-\d+\.jpg$/)
})

test('buscar por código y filtrar por talla', async () => {
  await irADisfraces()
  const lista = v.getByRole('list', { name: 'Lista de disfraces' })

  await v.getByLabel('Buscar').fill('spn-001')
  await expect(lista.getByRole('link')).toHaveCount(1)
  await expect(lista).toContainText('Spiderman Negro')

  await v.getByLabel('Buscar').fill('')
  await v.getByLabel('Talla').selectOption('8')
  await expect(lista.getByRole('link')).toHaveCount(1)
  await expect(lista).toContainText('Talla 8: 3 de 3 disponibles')

  await v.getByLabel('Talla').selectOption('M')
  await expect(lista).toContainText('Spiderman Negro')
  await expect(lista.getByRole('link')).toHaveCount(1)
})

test('los filtros se conservan al volver desde una ficha', async () => {
  await v.getByRole('list', { name: 'Lista de disfraces' }).getByRole('link').first().click()
  await v.getByRole('link', { name: '← Volver a Disfraces' }).click()
  await expect(v.getByLabel('Talla')).toHaveValue('M')
  // Desde el menú lateral la lista se muestra sin filtros
  await irADisfraces()
  await expect(v.getByLabel('Talla')).toHaveValue('')
})

test('dar de baja un disfraz lo oculta de la lista', async () => {
  await v.getByLabel('Talla').selectOption('')
  await v.getByRole('link', { name: /^Spiderman Negro/ }).click()
  await v.getByRole('button', { name: 'Dar de baja el disfraz' }).click()
  await v.getByRole('dialog', { name: '¿Dar de baja "Spiderman Negro"?' }).getByRole('button', { name: 'Sí, dar de baja' }).click()
  await expect(v.getByText('Dado de baja', { exact: true })).toBeVisible()

  await irADisfraces()
  const lista = v.getByRole('list', { name: 'Lista de disfraces' })
  await expect(lista).not.toContainText('Spiderman Negro')
  await v.getByLabel('Mostrar disfraces dados de baja').check()
  await expect(v.getByLabel('Mostrar disfraces dados de baja')).toBeChecked()
  await expect(lista).toContainText('Spiderman Negro')
})
