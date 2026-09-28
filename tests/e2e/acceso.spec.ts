import { expect, test, type Page } from '@playwright/test'
import { hayDesbordeHorizontal, lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

const DUENA = 'marinera en la plaza'
const TRAB = 'caporales del norte'

let a: AppDePrueba
let v: Page
let codigoRecuperacion = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  a = await lanzarApp({ cuentas: false })
  v = a.ventana
  await ventanaMinima(a.app, v)
})

test.afterAll(async () => {
  await a?.cerrar()
})

const menu = (): ReturnType<Page['getByRole']> => v.getByRole('navigation', { name: 'Menú principal' })

async function entrar(cuenta: 'Dueña' | 'Trabajadores', contrasena: string): Promise<void> {
  await v.getByRole('button', { name: cuenta, exact: true }).click()
  await v.getByLabel(cuenta === 'Dueña' ? 'Contraseña de la dueña' : 'Contraseña de Trabajadores', { exact: true }).fill(contrasena)
  await v.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function salir(): Promise<void> {
  await v.getByRole('button', { name: 'Cerrar sesión / Cambiar de usuario' }).click()
  await expect(v.getByRole('heading', { name: 'Ingresar al sistema' })).toBeVisible()
}

test('primer uso: asistente sin contraseñas por defecto, con código de recuperación', async () => {
  await expect(v.getByRole('heading', { name: /Bienvenida · Paso 1 de 4/ })).toBeVisible()
  expect(await hayDesbordeHorizontal(v)).toBe(false)

  // Contraseña trivial: mensaje claro
  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill('12345678')
  await expect(v.getByText('Seguridad: Muy fácil')).toBeVisible()
  await v.getByLabel('Repita la contraseña de la dueña', { exact: true }).fill('12345678')
  await v.getByRole('button', { name: 'Siguiente →' }).click()
  await expect(v.getByRole('alert')).toContainText('secuencia muy fácil de adivinar')

  await v.getByLabel('Contraseña de la dueña', { exact: true }).fill(DUENA)
  await expect(v.getByText('Seguridad: Buena')).toBeVisible()
  await v.getByLabel('Repita la contraseña de la dueña', { exact: true }).fill(DUENA)
  await v.getByRole('button', { name: 'Siguiente →' }).click()

  // Trabajadores: debe ser distinta
  await v.getByLabel('Contraseña de Trabajadores', { exact: true }).fill(DUENA)
  await v.getByLabel('Repita la contraseña de Trabajadores', { exact: true }).fill(DUENA)
  await v.getByRole('button', { name: 'Siguiente →' }).click()
  await expect(v.getByRole('alert')).toContainText('debe ser distinta de la de la dueña')
  await v.getByLabel('Contraseña de Trabajadores', { exact: true }).fill(TRAB)
  await v.getByLabel('Repita la contraseña de Trabajadores', { exact: true }).fill(TRAB)
  await v.getByRole('button', { name: 'Siguiente →' }).click()

  // Código de recuperación, una sola vez
  const codigo = v.getByLabel('Código de recuperación')
  await expect(codigo).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  codigoRecuperacion = (await codigo.textContent()) ?? ''
  await v.getByRole('button', { name: 'Ya lo anoté' }).click()

  await v.getByLabel('Código de recuperación').fill('AAAA-BBBB-CCCC')
  await v.getByRole('button', { name: 'Crear las cuentas y entrar' }).click()
  await expect(v.getByRole('alert')).toContainText('no coincide')
  await v.getByLabel('Código de recuperación').fill(codigoRecuperacion.toLowerCase().replace(/-/g, ' '))
  await v.getByRole('button', { name: 'Crear las cuentas y entrar' }).click()

  await expect(v.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
  await expect(menu()).toContainText('Sesión: Dueña')
  await expect(menu().getByRole('link', { name: 'Reportes' })).toBeVisible()
})

test('Trabajadores no ve Reportes ni Configuración', async () => {
  // Un disfraz para probar después la baja con autorización
  await v.evaluate(async () => {
    const api = (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api
    const r = await api.modelos.crear({ nombre: 'Pirata', categoria: 'Personajes', region: null, descripcion: '', precioAlquiler: 3000, prefijo: 'PIR' })
    if (!r.ok) throw new Error(r.error)
  })
  await salir()
  await entrar('Trabajadores', TRAB)
  await expect(menu()).toContainText('Sesión: Trabajadores')
  for (const s of ['Inicio', 'Alquileres', 'Disfraces', 'Clientes']) await expect(menu().getByRole('link', { name: s })).toBeVisible()
  await expect(menu().getByRole('link', { name: 'Reportes' })).toHaveCount(0)
  await expect(menu().getByRole('link', { name: 'Configuración' })).toHaveCount(0)
  // Ni escribiendo la dirección
  await v.evaluate(() => (location.hash = '#/reportes'))
  await expect(v.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
  // Ni por la API
  const r = await v.evaluate(() =>
    (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api.reportes.deudas()
  )
  expect(r).toEqual({ ok: false, error: 'Solo la dueña puede ver los reportes.' })
  // Inicio sin el dinero de hoy
  await expect(v.getByLabel('Dinero de hoy')).toHaveCount(0)
})

test('dar de baja con la sesión de Trabajadores pide la contraseña de la dueña', async () => {
  await menu().getByRole('link', { name: 'Disfraces' }).click()
  await v.getByRole('link', { name: /Pirata/ }).first().click()
  await v.getByRole('button', { name: 'Dar de baja el disfraz' }).click()
  const dialogo = v.getByRole('dialog', { name: '¿Dar de baja "Pirata"?' })
  await expect(dialogo).toContainText('solo para la dueña')
  await dialogo.getByLabel('Contraseña de la dueña', { exact: true }).fill(TRAB)
  await dialogo.getByRole('button', { name: 'Sí, dar de baja' }).click()
  await expect(dialogo).toContainText('La contraseña de la dueña no es correcta.')
  await dialogo.getByLabel('Contraseña de la dueña', { exact: true }).fill(DUENA)
  await dialogo.getByRole('button', { name: 'Sí, dar de baja' }).click()
  await expect(dialogo).toHaveCount(0)
  await expect(v.getByText('"Pirata" fue dado de baja.')).toBeVisible()
  // La sesión sigue siendo de Trabajadores
  await expect(menu()).toContainText('Sesión: Trabajadores')
})

test('5 fallos bloquean Trabajadores, pero la dueña sigue entrando', async () => {
  await salir()
  for (let i = 0; i < 5; i++) await entrar('Trabajadores', 'no es la contraseña')
  await expect(v.getByRole('alert')).toContainText('Se equivocó 5 veces. Por seguridad, espere')
  await entrar('Trabajadores', TRAB)
  await expect(v.getByRole('alert')).toContainText('Por seguridad, espere')
  await entrar('Dueña', DUENA)
  await expect(menu()).toContainText('Sesión: Dueña')
})

test('Configuración: la dueña cambia la mora y la contraseña de Trabajadores', async () => {
  await menu().getByRole('link', { name: 'Configuración' }).click()
  const reglas = v.getByRole('region', { name: 'Reglas del negocio' })
  await reglas.getByLabel('Mora por día de retraso').fill('8')
  await reglas.getByLabel('Mora por día de retraso').press('Enter')
  await reglas.getByLabel('Una sola vez por pedido').check()
  await reglas.getByRole('button', { name: 'Guardar cambios' }).click()
  await v.getByRole('dialog', { name: '¿Guardar los cambios?' }).getByRole('button', { name: 'Sí, guardar' }).click()
  await expect(v.getByText('Configuración guardada.')).toBeVisible()
  await expect(reglas.getByLabel('Mora por día de retraso')).toHaveValue('8.00')

  const trab = v.getByRole('form', { name: 'Contraseña de Trabajadores' })
  await trab.getByLabel('Contraseña nueva', { exact: true }).fill('huaylas del centro')
  await trab.getByLabel('Repita la contraseña nueva', { exact: true }).fill('huaylas del centro')
  await trab.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(v.getByText('La contraseña de Trabajadores fue cambiada.')).toBeVisible()
  expect(await hayDesbordeHorizontal(v)).toBe(false)
})

test('la dueña recupera su contraseña con el código y recibe uno nuevo', async () => {
  await salir()
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByRole('button', { name: '¿Olvidó su contraseña?' }).click()
  await v.getByLabel('Código de recuperación (el que anotó en papel)').fill(codigoRecuperacion)
  await v.getByLabel('Contraseña nueva', { exact: true }).fill('diablada de puno')
  await v.getByLabel('Repita la contraseña nueva', { exact: true }).fill('diablada de puno')
  await v.getByRole('button', { name: 'Cambiar y entrar' }).click()
  const nuevo = v.getByLabel('Código de recuperación')
  await expect(nuevo).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  expect(await nuevo.textContent()).not.toBe(codigoRecuperacion)
  await v.getByRole('button', { name: 'Ya lo anoté, entrar' }).click()
  await expect(menu()).toContainText('Sesión: Dueña')

  // El código usado ya no sirve
  await salir()
  await v.getByRole('button', { name: 'Dueña', exact: true }).click()
  await v.getByRole('button', { name: '¿Olvidó su contraseña?' }).click()
  await v.getByLabel('Código de recuperación (el que anotó en papel)').fill(codigoRecuperacion)
  await v.getByLabel('Contraseña nueva', { exact: true }).fill('otra frase secreta')
  await v.getByLabel('Repita la contraseña nueva', { exact: true }).fill('otra frase secreta')
  await v.getByRole('button', { name: 'Cambiar y entrar' }).click()
  await expect(v.getByRole('alert')).toContainText('El código de recuperación no es correcto.')
})

test.describe('inactividad de la dueña', () => {
  let b: AppDePrueba

  test.beforeAll(async () => {
    b = await lanzarApp({ inactividadMs: 4000 })
  })
  test.afterAll(async () => {
    await b?.cerrar()
  })

  test('avisa antes, "Seguir en la sesión" la mantiene y luego vuelve al ingreso', async () => {
    const w = b.ventana
    await expect(w.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
    const aviso = w.getByRole('dialog', { name: '¿Sigue ahí?' })
    await expect(aviso).toBeVisible({ timeout: 5000 })
    await expect(aviso).toContainText('se cerrará en')
    await aviso.getByRole('button', { name: 'Seguir en la sesión' }).click()
    await expect(aviso).toHaveCount(0)
    await expect(w.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
    // Sin tocar nada: vuelve a la pantalla de ingreso
    await expect(w.getByRole('heading', { name: 'Ingresar al sistema' })).toBeVisible({ timeout: 8000 })
    await expect(w.getByText('se cerró sola porque no hubo actividad')).toBeVisible()
    const estado = await w.evaluate(() => (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api.acceso.estado())
    expect(estado.ok && estado.datos.sesion).toBe(null)
  })

  test('Trabajadores no se cierra sola', async () => {
    const w = b.ventana
    await w.getByRole('button', { name: 'Trabajadores', exact: true }).click()
    await w.getByLabel('Contraseña de Trabajadores', { exact: true }).fill('tienda de la esquina')
    await w.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(w.getByRole('navigation', { name: 'Menú principal' })).toContainText('Sesión: Trabajadores')
    await w.waitForTimeout(6000)
    await expect(w.getByRole('dialog', { name: '¿Sigue ahí?' })).toHaveCount(0)
    await expect(w.getByRole('navigation', { name: 'Menú principal' })).toContainText('Sesión: Trabajadores')
  })
})
