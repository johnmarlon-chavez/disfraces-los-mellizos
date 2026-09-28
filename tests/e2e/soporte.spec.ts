import { rmSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { CONTRASENA_DUENA, CONTRASENA_TRABAJADORES, hayDesbordeHorizontal, lanzarApp, type AppDePrueba } from './ayudante'

const CLAVE = 'tecnico de confianza 2026'
let carpeta = ''
let codigo = ''
// La app abierta en cada prueba: si una falla, se cierra igual al final (si no, la carpeta queda en uso).
let abierta: AppDePrueba | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  // Una instalación con las cuentas ya creadas; las herramientas se abren sobre la misma carpeta.
  const a = await lanzarApp()
  carpeta = a.carpetaDatos
  await a.cerrar(true)
})

test.afterEach(async () => {
  await abierta?.cerrar(true)
  abierta = null
})

test.afterAll(() => {
  if (carpeta) rmSync(carpeta, { recursive: true, force: true })
})

async function herramienta(flag: string) {
  const a = await lanzarApp({ carpetaDatos: carpeta, cuentas: false, args: [flag] })
  abierta = a
  await expect(a.ventana).toHaveTitle('Disfraces Los Mellizos · Soporte')
  return a
}

test('sin clave de soporte definida, --restablecer-duena no hace nada', async () => {
  const a = await herramienta('--restablecer-duena')
  await expect(a.ventana.getByRole('alert')).toContainText('La clave de soporte no fue definida en este equipo')
  await expect(a.ventana.getByLabel('Clave de soporte', { exact: true })).toHaveCount(0)
})

test('el técnico define la clave de soporte con --definir-clave-soporte, autorizada por la dueña', async () => {
  const a = await herramienta('--definir-clave-soporte')
  const v = a.ventana
  await expect(v.getByRole('heading', { name: 'Definir la clave de soporte' })).toBeVisible()
  await v.getByLabel('Clave de soporte nueva', { exact: true }).fill('corta')
  await v.getByLabel('Repita la clave de soporte nueva', { exact: true }).fill('corta')
  await v.getByRole('button', { name: 'Guardar clave' }).click()
  await expect(v.getByRole('alert')).toContainText('al menos 12 caracteres')
  // Las cuentas ya existen: sin la contraseña de la dueña no se puede definir
  await expect(v.getByText('la dueña debe autorizar la clave de soporte')).toBeVisible()
  await v.getByLabel('Clave de soporte nueva', { exact: true }).fill(CLAVE)
  await v.getByLabel('Repita la clave de soporte nueva', { exact: true }).fill(CLAVE)
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill(CONTRASENA_TRABAJADORES)
  await v.getByRole('button', { name: 'Guardar clave' }).click()
  await expect(v.getByRole('alert')).toContainText('La contraseña de la dueña no es correcta.')
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill(CONTRASENA_DUENA)
  await v.getByRole('button', { name: 'Guardar clave' }).click()
  await expect(v.getByRole('heading', { name: 'Clave de soporte guardada' })).toBeVisible()
  expect(await hayDesbordeHorizontal(v)).toBe(false)
})

test('--restablecer-duena exige la clave; con la correcta muestra un código nuevo', async () => {
  const a = await herramienta('--restablecer-duena')
  const v = a.ventana
  await v.getByLabel('Clave de soporte', { exact: true }).fill('la adivino yo')
  await v.getByRole('button', { name: 'Generar código nuevo' }).click()
  await expect(v.getByRole('alert')).toContainText('La clave de soporte no es correcta.')
  await v.getByLabel('Clave de soporte', { exact: true }).fill(CLAVE)
  await v.getByRole('button', { name: 'Generar código nuevo' }).click()
  const nuevo = v.getByLabel('Código de recuperación')
  await expect(nuevo).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  codigo = (await nuevo.textContent()) ?? ''
})

test('la dueña ve el aviso del restablecimiento al ingresar, hasta pulsar "Entendido"', async () => {
  const a = await lanzarApp({ carpetaDatos: carpeta, cuentas: false })
  abierta = a
  const v = a.ventana
  // Recupera con el código que le dio el técnico
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByRole('button', { name: '¿Olvidó su contraseña?' }).click()
  await v.getByLabel('Código de recuperación (el que anotó en papel)').fill(codigo)
  await v.getByLabel('Contraseña nueva', { exact: true }).fill('diablada de puno')
  await v.getByLabel('Repita la contraseña nueva', { exact: true }).fill('diablada de puno')
  await v.getByRole('button', { name: 'Cambiar y entrar' }).click()
  await v.getByRole('button', { name: 'Ya lo anoté, entrar' }).click()

  const aviso = v.getByRole('alertdialog', { name: '⚠ Acceso restablecido por soporte' })
  await expect(aviso).toContainText(
    /El acceso de su cuenta fue restablecido por soporte técnico el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2}\. Si usted no lo pidió, comuníquese con su técnico\./
  )
  // Escape no lo cierra
  await v.keyboard.press('Escape')
  await expect(aviso).toBeVisible()
  await aviso.getByRole('button', { name: 'Entendido' }).click()
  await expect(aviso).toHaveCount(0)

  // Queda a la vista en Configuración
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Configuración' }).click()
  const info = v.getByRole('region', { name: 'Información' })
  await expect(info).toContainText('Definida por su técnico')
  await expect(info).not.toContainText('Nunca')

  // Al volver a ingresar ya no aparece
  await v.getByRole('button', { name: 'Cerrar sesión / Cambiar de usuario' }).click()
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill('diablada de puno')
  await v.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(v.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
  await expect(v.getByRole('alertdialog')).toHaveCount(0)
})
