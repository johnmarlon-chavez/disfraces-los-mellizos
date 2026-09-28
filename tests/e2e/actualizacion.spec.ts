import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { CONTRASENA_DUENA, enBase, lanzarApp, type AppDePrueba } from './ayudante'

const CLAVE = 'tecnico de confianza 2026'
let carpeta = ''
let abierta: AppDePrueba | null = null

test.describe.configure({ mode: 'serial' })

test.afterEach(async () => {
  await abierta?.cerrar(true)
  abierta = null
})

test.afterAll(async () => {
  if (carpeta) {
    const { rmSync } = await import('node:fs')
    rmSync(carpeta, { recursive: true, force: true })
  }
})

const locales = (): string[] => (existsSync(join(carpeta, 'respaldos')) ? readdirSync(join(carpeta, 'respaldos')) : [])

async function entrarComoDuena(a: AppDePrueba): Promise<void> {
  const v = a.ventana
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill(CONTRASENA_DUENA)
  await v.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(v.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
}

test('al abrir una versión nueva con datos viejos: respaldo "antes de actualizar" y migra', async () => {
  const a = await lanzarApp()
  carpeta = a.carpetaDatos
  await a.cerrar(true)
  // Datos "de la versión anterior": se baja la versión del esquema una migración (la 013 se
  // vuelve a aplicar sin problema) y se define la clave de soporte para la segunda prueba.
  const version = Number(await enBase(carpeta, 'return db.pragma("user_version", { simple: true })'))
  await enBase(
    carpeta,
    `db.pragma("user_version = ${version - 1}"); db.prepare("UPDATE soporte SET clave_hash = ? WHERE id = 1").run(bcrypt.hashSync(${JSON.stringify(CLAVE)}, 4))`
  )
  abierta = await lanzarApp({ carpetaDatos: carpeta, cuentas: false })
  await entrarComoDuena(abierta)
  const antes = locales().filter((f) => f.includes('(antes de actualizar a '))
  expect(antes).toHaveLength(1)
  await abierta.cerrar(true)
  abierta = null
  expect(await enBase(carpeta, 'return db.prepare("SELECT COUNT(*) AS n FROM respaldos WHERE tipo = \'antes_de_actualizar\'").get().n')).toBe('1')
  expect(await enBase(carpeta, 'return db.pragma("user_version", { simple: true })')).toBe(String(version))
})

test('una versión anterior con datos más nuevos: ventana de soporte para volver al respaldo "antes de actualizar"', async () => {
  // Como si se hubiera instalado una versión anterior del programa sobre datos de una más nueva
  await enBase(carpeta, 'db.pragma("user_version = 999")')
  abierta = await lanzarApp({ carpetaDatos: carpeta, cuentas: false })
  const v = abierta.ventana
  await expect(v).toHaveTitle('Disfraces Los Mellizos · Soporte')
  await expect(v.getByRole('heading', { name: 'Datos de una versión más nueva' })).toBeVisible()
  const lista = v.getByRole('list', { name: 'Respaldos compatibles' })
  await expect(lista).toContainText('antes de actualizar a')
  await lista.getByRole('radio').first().check()
  await v.getByLabel('Clave de soporte', { exact: true }).fill('no es la clave')
  await v.getByRole('button', { name: 'Volver a este respaldo' }).click()
  await expect(v.getByRole('alert')).toContainText('La clave de soporte no es correcta.')
  await v.getByLabel('Clave de soporte', { exact: true }).fill(CLAVE)
  const cerrado = abierta.app.waitForEvent('close')
  await v.getByRole('button', { name: 'Volver a este respaldo' }).click()
  await expect(v.getByText('El programa se está reiniciando')).toBeVisible()
  await cerrado
  abierta = null

  // Se abre normal: la versión del esquema es la de este programa y se entra con la contraseña de siempre
  abierta = await lanzarApp({ carpetaDatos: carpeta, cuentas: false })
  await entrarComoDuena(abierta)
  expect(locales().some((f) => f.includes('(antes de restaurar)'))).toBe(true)
})
