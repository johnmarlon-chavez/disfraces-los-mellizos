import { expect, test, type Page } from '@playwright/test'
import { sumarDias } from '../../src/shared/fechas'
import { formatearFecha, hoyEnLima } from '../../src/shared/formato'
import { hayDesbordeHorizontal, lanzarApp, ventanaMinima, type AppDePrueba } from './ayudante'

let a: AppDePrueba
let v: Page
const HOY = hoyEnLima()
const dia = (n: number): string => sumarDias(HOY, n)

test.describe.configure({ mode: 'serial' })

/** Adelanta el reloj de la app (main y ventana) `dias` días. */
async function adelantarReloj(dias: number): Promise<void> {
  const t = Date.now() + dias * 86_400_000
  const parche = (ms: number): void => {
    const Real = Date
    class Falso extends Real {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(ms)
        else super(...(args as [number]))
      }
      static now(): number {
        return ms
      }
    }
    ;(globalThis as unknown as { Date: DateConstructor }).Date = Falso as unknown as DateConstructor
  }
  await a.app.evaluate((_electron, [codigo, ms]) => new Function('ms', `(${codigo})(ms)`)(ms), [parche.toString(), t] as const)
  await v.evaluate(([codigo, ms]) => new Function('ms', `(${codigo})(ms)`)(ms), [parche.toString(), t] as const)
}

test.beforeAll(async () => {
  a = await lanzarApp()
  v = a.ventana
  await ventanaMinima(a.app, v)
  await v.evaluate(
    async ([salida, devolucion]) => {
      const api = (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api
      const ok = async <T,>(r: Promise<import('../../src/shared/ipc').Resultado<T>>): Promise<T> => {
        const x = await r
        if (!x.ok) throw new Error(x.error)
        return x.datos
      }
      const huaylas = await ok(
        api.modelos.crear({ nombre: 'Huaylas mujer', categoria: 'Danzas típicas', region: 'sierra', descripcion: '', precioAlquiler: 4500, prefijo: 'HUM' })
      )
      const codigos = await ok(api.unidades.sugerirCodigos(huaylas, 5))
      await ok(
        api.unidades.crear({
          modeloId: huaylas,
          talla: '10',
          codigos,
          piezas: [
            { nombre: 'Sombrero', costoReposicion: 3000 },
            { nombre: 'Lliclla', costoReposicion: 2000 }
          ]
        })
      )
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
      const r = await ok(
        api.pedidos.asignar({ modeloId: huaylas, talla: '10', cantidad: 5, rango: { inicio: salida, fin: devolucion }, excluirAlquilerId: null, yaEnCarrito: [] })
      )
      await ok(
        api.pedidos.crear({
          clienteId: colegio,
          fechaSalida: salida,
          fechaDevolucionPactada: devolucion,
          evento: 'Día de la Madre',
          gradoSeccion: '2.° A',
          observaciones: '',
          garantiaTipo: 'dni',
          garantiaMonto: 0,
          lineas: r.asignadas.map((u) => ({ unidadId: u.unidadId, precioCobrado: 4000 })),
          pendientes: [],
          adelanto: { monto: 5000, medio: 'efectivo' }
        })
      )
    },
    [dia(2), dia(4)] as const
  )
})

test.afterAll(async () => {
  await a?.cerrar()
})

async function abrirPedido(): Promise<void> {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Alquileres' }).click()
  await v.getByRole('list', { name: 'Lista de pedidos' }).getByRole('link', { name: /N\.° 1/ }).click()
  await expect(v.getByRole('heading', { level: 1, name: /Pedido N\.° 1/ })).toBeVisible()
}

test('entregar hoy adelantando la salida: cobra el saldo y retiene el DNI de la responsable', async () => {
  await abrirPedido()
  await v.getByRole('button', { name: 'Entregar hoy (adelantar la salida)' }).click()
  const dialogo = v.getByRole('dialog', { name: 'Entregar hoy (adelantar la salida)' })
  await expect(dialogo.getByLabel('Monto del pago 1')).toHaveValue('150.00') // 5 × 40 − 50
  await expect(dialogo.getByLabel('Documento en prenda')).toHaveValue('45678901')
  await dialogo.getByRole('button', { name: 'Entregar 5 disfraces' }).click()

  await expect(v.getByText('Faltan 5 de 5 por devolver')).toBeVisible()
  await expect(v.getByText(`Salida: ${formatearFecha(HOY)}`)).toBeVisible()
})

test('devolución parcial a tiempo: faltan 2 de 5', async () => {
  await v.getByRole('link', { name: 'Registrar devolución' }).click()
  for (const c of ['HUM-001', 'HUM-002', 'HUM-003']) await v.getByLabel(c, { exact: true }).check()
  await expect(v.getByRole('complementary', { name: 'Resumen de la devolución' })).toContainText('Sin cargos.')
  await v.getByRole('button', { name: 'Registrar devolución de 3' }).click()
  await expect(v.getByText('Faltan 2 de 5 por devolver')).toBeVisible()
})

test('3 días tarde y sin un sombrero: mora por unidad, faltante y "Falta cobrar" con DNI retenido', async () => {
  await adelantarReloj(7) // la devolución pactada era hoy + 4
  await v.getByRole('link', { name: 'Registrar devolución' }).click()
  await v.getByLabel('Seleccionar todos (2)').check()
  const hum4 = v.getByRole('listitem').filter({ hasText: 'HUM-004' })
  await hum4.getByRole('button', { name: 'Revisar piezas y daños' }).click()
  await hum4.getByLabel('Sombrero').uncheck()
  await expect(hum4.getByLabel('Cobro por Sombrero de HUM-004')).toHaveValue('30.00')

  const resumen = v.getByRole('complementary', { name: 'Resumen de la devolución' })
  await expect(resumen).toContainText('HUM-004: 3 días de retraso')
  await expect(resumen).toContainText('HUM-005: 3 días de retraso')
  await expect(resumen).toContainText('HUM-004: falta Sombrero')
  await expect(resumen).toContainText('Falta cobrar S/ 60.00') // 2 × 15 de mora + 30
  await expect(resumen).toContainText('Retener el documento (45678901) hasta que pague')
  expect(await hayDesbordeHorizontal(v)).toBe(false)
  await v.getByRole('button', { name: 'Registrar devolución de 2' }).click()

  // Se abre el cierre del pedido
  const cierre = v.getByRole('dialog', { name: 'Cerrar el pedido' })
  await cierre.getByLabel('Cobrar ahora').fill('')
  await cierre.getByRole('button', { name: 'Confirmar y cerrar el pedido' }).click()
  await expect(v.getByText('Debe S/ 60.00')).toBeVisible()
  await expect(v.getByText('Se retiene el documento 45678901 hasta que pague S/ 60.00.')).toBeVisible()
})

test('la dueña perdona una mora con motivo; el cliente paga el resto y se le devuelve el DNI', async () => {
  await v.getByRole('button', { name: 'Rebajar' }).first().click()
  const dialogo = v.getByRole('dialog', { name: 'Rebajar o perdonar la mora' })
  await dialogo.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialogo.getByRole('alert')).toContainText('Escriba el motivo')
  await dialogo.getByLabel('Motivo').fill('avisó que llegaba tarde')
  await dialogo.getByRole('button', { name: 'Guardar' }).click()
  await v.getByRole('dialog', { name: 'Autorización de la dueña' }).getByRole('button', { name: 'Autorizar' }).click()
  await expect(v.getByText('Debe S/ 45.00')).toBeVisible()
  await expect(v.getByText(/perdonada: avisó que llegaba tarde/)).toBeVisible()

  await v.getByRole('button', { name: 'Registrar pago (S/ 45.00)' }).click()
  await v.getByRole('dialog', { name: 'Registrar pago de la deuda' }).getByRole('button', { name: 'Registrar pago' }).click()
  await v.getByRole('button', { name: 'Devolver el documento' }).click()
  await expect(v.getByText('devuelta / liquidada')).toBeVisible()
})

test('marcar todo como limpio y antecedentes del cliente', async () => {
  await v.getByRole('button', { name: 'Marcar todo como limpio' }).click()
  await expect(v.getByRole('status').filter({ hasText: '5 marcados como limpios' })).toBeVisible()
  await v.getByRole('link', { name: 'I.E. Los Girasoles' }).click()
  await expect(v.getByText('devoluciones tardías', { exact: true })).toBeVisible()
  await expect(v.getByText('Este cliente tiene antecedentes')).toBeVisible()
})
