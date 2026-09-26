import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

let a: AppDePrueba

test.beforeAll(async () => {
  a = await lanzarApp()
})

test.afterAll(async () => {
  await a?.cerrar()
})

test('abre con el nombre de la tienda y crea la base de datos', async () => {
  await expect(a.ventana).toHaveTitle('Disfraces Los Mellizos')
  await expect(a.ventana.getByRole('heading', { name: 'Inicio' })).toBeVisible()
  expect(existsSync(join(a.carpetaDatos, 'datos.db'))).toBe(true)
  expect(existsSync(join(a.carpetaDatos, 'fotos'))).toBe(true)
})

test('el renderer no tiene acceso a Node', async () => {
  const tipos = await a.ventana.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    api: typeof (window as unknown as { api?: unknown }).api
  }))
  expect(tipos).toEqual({ require: 'undefined', process: 'undefined', api: 'object' })
})

test('el menú lateral navega por todas las secciones', async () => {
  const menu = a.ventana.getByRole('navigation', { name: 'Menú principal' })
  for (const seccion of ['Alquileres', 'Disfraces', 'Clientes', 'Reportes', 'Configuración', 'Inicio']) {
    await menu.getByRole('link', { name: seccion }).click()
    await expect(a.ventana.getByRole('heading', { level: 1, name: seccion })).toBeVisible()
  }
})

test('Configuración muestra datos leídos por IPC desde SQLite', async () => {
  await a.ventana.getByRole('link', { name: 'Configuración' }).click()
  await expect(a.ventana.getByText('S/ 5.00')).toBeVisible()
  await expect(a.ventana.getByText(a.carpetaDatos)).toBeVisible()
})

test('a 1366×768 el menú y el contenido se ven sin desbordarse', async () => {
  await ventanaMinima(a.app, a.ventana)
  const desborde = await a.ventana.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > window.innerWidth,
    vertical: document.documentElement.scrollHeight > window.innerHeight
  }))
  expect(desborde).toEqual({ horizontal: false, vertical: false })
  await expect(a.ventana.getByRole('link', { name: 'Configuración' })).toBeInViewport()
})
