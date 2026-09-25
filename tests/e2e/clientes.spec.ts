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

async function irAClientes(): Promise<void> {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Clientes' }).click()
  await expect(v.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible()
}

async function nuevoCliente(tipo: 'Persona' | 'Colegio'): Promise<void> {
  await irAClientes()
  await v.getByRole('link', { name: '+ Nuevo cliente' }).click()
  await v.getByRole('radio', { name: new RegExp(`^${tipo}`) }).click()
}

async function registrarColegio(nombre: string, distrito: string, responsable: string, dni: string): Promise<void> {
  await nuevoCliente('Colegio')
  await v.getByLabel('Nombre del colegio').fill(nombre)
  await v.getByLabel('Distrito').fill(distrito)
  await v.getByLabel('Responsable (profesora o coordinadora)').fill(responsable)
  await v.getByLabel('DNI de la responsable').fill(dni)
  await v.getByLabel('Teléfono').fill('949 111 222')
  await v.getByRole('button', { name: 'Guardar cliente' }).click()
}

test('registrar una persona valida el teléfono y guarda', async () => {
  await nuevoCliente('Persona')
  await v.getByLabel('Número').fill('40123456')
  await v.getByLabel('Nombres y apellidos').fill('María Quispe Huamán')
  await v.getByLabel('Teléfono').fill('98765432')
  await v.getByRole('button', { name: 'Guardar cliente' }).click()
  await expect(v.getByText('El celular debe tener 9 dígitos y empezar con 9, por ejemplo 987 654 321.')).toBeVisible()

  await v.getByLabel('Teléfono').fill('987 654 321')
  await v.getByRole('button', { name: 'Guardar cliente' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /María Quispe Huamán/ })).toBeVisible()
  await expect(v.getByText('Todavía no tiene alquileres.')).toBeVisible()
})

test('un documento repetido avisa y ofrece usar el cliente existente', async () => {
  await nuevoCliente('Persona')
  await v.getByLabel('Número').fill('40123456')
  await v.getByLabel('Nombres y apellidos').click()
  await expect(v.getByText('Este documento ya está registrado a nombre de')).toBeVisible()
  await v.getByRole('button', { name: 'Usar ese cliente' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /María Quispe Huamán/ })).toBeVisible()
})

test('carné de extranjería alfanumérico', async () => {
  await nuevoCliente('Persona')
  await v.getByLabel('Documento').selectOption({ label: 'Carné de extranjería' })
  await v.getByLabel('Número').fill('001234567')
  await v.getByLabel('Nombres y apellidos').fill('Ana Pérez')
  await v.getByLabel('Teléfono').fill('044 234567')
  await v.getByRole('button', { name: 'Guardar cliente' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /Ana Pérez/ })).toBeVisible()
})

test('registrar un colegio normaliza el distrito', async () => {
  await registrarColegio('I.E. Los Girasoles', 'la esperanza', 'Carmen Rojas Vega', '45678901')
  await expect(v.getByRole('heading', { level: 1, name: /I\.E\. Los Girasoles/ })).toBeVisible()
  await expect(v.getByLabel('Distrito')).toHaveValue('La Esperanza')
})

test('el mismo colegio en el mismo distrito se bloquea y ofrece usar el existente', async () => {
  await registrarColegio('IE los girasoles', 'La Esperanza', 'Otra Persona', '46789012')
  const dialogo = v.getByRole('dialog', { name: 'Este colegio ya está registrado' })
  await expect(dialogo).toContainText('Ya existe «I.E. Los Girasoles» en La Esperanza')
  await expect(dialogo.getByRole('button', { name: 'No, es otro colegio: guardar' })).toHaveCount(0)
  await dialogo.getByRole('button', { name: 'Usar este colegio' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /I\.E\. Los Girasoles/ })).toBeVisible()
})

test('un colegio parecido en otro distrito pregunta y se puede registrar igual', async () => {
  await registrarColegio('Los Girasoles', 'El Porvenir', 'Julia Sánchez', '46789012')
  const dialogo = v.getByRole('dialog', { name: '¿Es alguno de estos colegios?' })
  await expect(dialogo).toContainText('I.E. Los Girasoles · La Esperanza')
  await dialogo.getByRole('button', { name: 'No, es otro colegio: guardar' }).click()
  await expect(v.getByRole('heading', { level: 1, name: /Los Girasoles/ })).toBeVisible()
  await expect(v.getByLabel('Distrito')).toHaveValue('El Porvenir')
})

test('buscar por DNI, responsable y tipo', async () => {
  await irAClientes()
  const lista = v.getByRole('list', { name: 'Lista de clientes' })
  await expect(lista.getByRole('link')).toHaveCount(4)

  await v.getByLabel('Buscar').fill('40123456')
  await expect(lista.getByRole('link')).toHaveCount(1)
  await expect(lista).toContainText('María Quispe Huamán')

  await v.getByLabel('Buscar').fill('carmen')
  await expect(lista.getByRole('link')).toHaveCount(1)
  await expect(lista).toContainText('La Esperanza · Responsable: Carmen Rojas Vega')

  await v.getByLabel('Buscar').fill('')
  await v.getByLabel('Tipo').selectOption({ label: 'Colegios' })
  await expect(lista.getByRole('link')).toHaveCount(2)
})

test('editar los datos desde la ficha', async () => {
  await v.getByRole('list', { name: 'Lista de clientes' }).getByRole('link', { name: /El Porvenir/ }).click()
  await v.getByLabel('RUC (opcional)').fill('2048123456')
  await v.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(v.getByText('El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.')).toBeVisible()
  await v.getByLabel('RUC (opcional)').fill('20481234567')
  await v.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(v.getByRole('status').filter({ hasText: 'Datos guardados.' })).toBeVisible()
})

test('la ficha se ve completa a 1366×768', async () => {
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  await v.locator('main').evaluate((m) => m.scrollTo(0, 0))
  await expect(v.getByRole('heading', { name: 'Historial' })).toBeInViewport()
  if (process.env.CAPTURAS) await v.screenshot({ path: `${process.env.CAPTURAS}/ficha-cliente.png` })
})

test('volver conserva los filtros de la lista', async () => {
  await v.getByRole('link', { name: '← Volver a Clientes' }).click()
  await expect(v.getByLabel('Tipo')).toHaveValue('colegio')
})

test('desactivar pide confirmación y oculta al cliente de la lista', async () => {
  await v.getByLabel('Tipo').selectOption({ label: 'Personas' })
  await v.getByRole('list', { name: 'Lista de clientes' }).getByRole('link', { name: /Ana Pérez/ }).click()
  await v.getByRole('button', { name: 'Desactivar cliente' }).click()
  await v.getByRole('dialog', { name: '¿Desactivar a Ana Pérez?' }).getByRole('button', { name: 'Sí, desactivar' }).click()
  await expect(v.getByText('Desactivado', { exact: true })).toBeVisible()

  await irAClientes()
  const lista = v.getByRole('list', { name: 'Lista de clientes' })
  await expect(lista).not.toContainText('Ana Pérez')
  await v.getByLabel('Mostrar clientes desactivados').check()
  await expect(lista).toContainText('Ana Pérez')
})
