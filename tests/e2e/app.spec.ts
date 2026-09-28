import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { hayDesbordeHorizontal, lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

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
  await expect(a.ventana.getByLabel('Mora por día de retraso')).toHaveValue('5.00')
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

test('«¿Cómo se hace?» abre la guía de uso, con sus capturas incluidas en el programa', async () => {
  const v = a.ventana
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: '¿Cómo se hace?' }).click()
  await expect(v.getByRole('heading', { level: 1, name: '¿Cómo se hace?' })).toBeVisible()
  await expect(v.getByRole('heading', { name: '3. Registrar un pedido' })).toBeVisible()
  await v.getByRole('navigation', { name: 'Temas de la guía' }).getByRole('link', { name: 'Recibir la devolución' }).click()
  await expect(v.getByRole('heading', { name: '5. Recibir la devolución' })).toBeInViewport()
  // Las capturas vienen dentro del programa (funciona sin internet)
  const imagenes = await v.evaluate(() => Array.from(document.querySelectorAll('main img')).map((i) => ({ src: (i as HTMLImageElement).src, ancho: (i as HTMLImageElement).naturalWidth })))
  expect(imagenes.length).toBe(6)
  for (const i of imagenes) {
    expect(i.src.startsWith('file:') || i.src.startsWith('data:')).toBe(true)
    expect(i.ancho).toBeGreaterThan(1000)
  }
  expect(await hayDesbordeHorizontal(v)).toBe(false)
})
