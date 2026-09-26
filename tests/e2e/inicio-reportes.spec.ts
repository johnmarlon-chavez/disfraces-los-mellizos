import { expect, test, type Page } from '@playwright/test'
import { sumarDias } from '../../src/shared/fechas'
import { hoyEnLima } from '../../src/shared/formato'
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

async function ir(seccion: string): Promise<void> {
  await v.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: seccion }).click()
  await expect(v.getByRole('heading', { level: 1, name: seccion })).toBeVisible()
}

test.beforeAll(async () => {
  a = await lanzarApp()
  v = a.ventana
  await ventanaMinima(a.app, v)
  await v.evaluate(
    async ([hoy, manana, pasado]) => {
      const api = (window as unknown as { api: import('../../src/shared/ipc').ApiDisfraces }).api
      const ok = async <T,>(r: Promise<import('../../src/shared/ipc').Resultado<T>>): Promise<T> => {
        const x = await r
        if (!x.ok) throw new Error(x.error)
        return x.datos
      }
      const pirata = await ok(api.modelos.crear({ nombre: 'Pirata', categoria: 'Personajes', region: null, descripcion: '', precioAlquiler: 3000, prefijo: 'PIR' }))
      await ok(api.unidades.crear({ modeloId: pirata, talla: 'M', codigos: ['PIR-001', 'PIR-002', 'PIR-003', 'PIR-004'], piezas: [] }))
      const persona = await ok(
        api.clientes.crear({ tipo: 'persona', tipoDocumento: 'dni', numeroDocumento: '40123456', nombres: 'María Quispe', telefono: '987654321', direccion: '', observaciones: '' })
      )
      const reservar = async (codigo: string, salida: string, dev: string, adelanto: number): Promise<number> => {
        const libres = await ok(api.pedidos.unidadesLibres(pirata, 'M', { inicio: salida, fin: dev }, null, []))
        return ok(
          api.pedidos.crear({
            clienteId: persona,
            fechaSalida: salida,
            fechaDevolucionPactada: dev,
            evento: 'Otro',
            gradoSeccion: '',
            observaciones: '',
            garantiaTipo: null,
            garantiaMonto: 0,
            lineas: [{ unidadId: libres.find((u) => u.codigo === codigo)!.unidadId, precioCobrado: 3000 }],
            pendientes: [],
            adelanto: adelanto ? { monto: adelanto, medio: 'yape' } : null
          })
        )
      }
      // 1) Sale hoy y vuelve mañana: se entrega con garantía en efectivo (quedará vencido)
      const p1 = await reservar('PIR-001', hoy, manana, 1000)
      const f1 = await ok(api.pedidos.obtener(p1))
      await ok(
        api.entregas.entregar(
          p1,
          {
            detalleIds: f1.lineas.map((l) => l.detalleId),
            adelantarSalida: false,
            lavanderiaConfirmada: false,
            pagos: [{ monto: 2000, medio: 'efectivo' }],
            saldoPendienteAutorizado: false,
            garantia: { tipo: 'efectivo', monto: 5000, medio: 'efectivo', documento: '' }
          },
          null
        )
      )
      // 2) Cancelado reteniendo el adelanto de 15
      const p2 = await reservar('PIR-002', manana, pasado, 1500)
      await ok(api.pedidos.cancelar(p2, { tipo: 'retener' }))
      // 3) Reserva para mañana (quedará no recogida)
      await reservar('PIR-003', manana, pasado, 0)
      // 4) Dos unidades en lavandería
      const ficha = await ok(api.modelos.obtener(pirata))
      await ok(api.unidades.cambiarEstado(ficha.unidades.find((u) => u.codigo === 'PIR-004')!.id, 'lavanderia', null))
    },
    [HOY, dia(1), dia(2)] as const
  )
})

test.afterAll(async () => {
  await a?.cerrar()
})

test('ingresos de hoy: alquiler y adelanto retenido; la garantía no es ingreso', async () => {
  await ir('Reportes')
  await v.getByRole('button', { name: 'Hoy', exact: true }).click()
  const panel = v.getByRole('tabpanel', { name: 'Ingresos' })
  await expect(panel.getByText('Adelantos retenidos').first()).toBeVisible()
  await expect(panel).toContainText('S/ 15.00') // retenido
  await expect(panel).toContainText('S/ 30.00') // alquiler: adelanto 10 + saldo 20
  await expect(panel).toContainText('S/ 45.00') // total (sin la garantía de 50)
})

test('caja: garantías en custodia con el detalle por pedido', async () => {
  await v.getByRole('tab', { name: 'Caja y garantías' }).click()
  const panel = v.getByRole('tabpanel', { name: 'Caja y garantías' })
  await expect(panel).toContainText('Garantías en custodia: S/ 50.00')
  await expect(panel).toContainText('N.° 1 · María Quispe')
})

test('Inicio muestra a la dueña el dinero de hoy y las garantías en custodia', async () => {
  await ir('Inicio')
  const dinero = v.getByLabel('Dinero de hoy')
  await expect(dinero).toContainText('Ingresos de hoy: S/ 45.00')
  await expect(dinero).toContainText('Garantías en custodia: S/ 50.00')
})

test('días después: vencida en rojo arriba, reserva no recogida, y lavandería liberable', async () => {
  await adelantarReloj(4)
  await ir('Alquileres')
  await ir('Inicio')
  const vencidas = v.getByRole('region', { name: 'Devoluciones vencidas' })
  await expect(vencidas).toContainText('María Quispe')
  await expect(vencidas).toContainText('3 días')
  await expect(vencidas).toBeInViewport()
  await expect(v.getByRole('region', { name: 'Reservas no recogidas' })).toContainText('N.° 3')
  await expect(v.getByRole('region', { name: 'Entregas de hoy' })).toContainText('Sin entregas para hoy')
  expect(await hayDesbordeHorizontal(v)).toBe(false)

  const limpieza = v.getByRole('region', { name: 'En lavandería y reparación' })
  await limpieza.getByRole('button', { name: 'Elegir toda la lavandería' }).click()
  await limpieza.getByRole('button', { name: 'Marcar como disponibles (1)' }).click()
  await expect(v.getByRole('region', { name: 'En lavandería y reparación' })).toContainText('Nada en lavandería ni en reparación')
})

test('reporte de ocupación y de fuera/vencidos', async () => {
  await ir('Reportes')
  await v.getByRole('tab', { name: 'Fuera y vencidos' }).click()
  await expect(v.getByRole('tabpanel', { name: 'Fuera y vencidos' })).toContainText('Alquileres vencidos (1)')
  await v.getByRole('tab', { name: 'Ocupación' }).click()
  await expect(v.getByRole('tabpanel', { name: 'Ocupación' }).getByText('TM', { exact: false }).first()).toBeVisible()
  expect(await hayDesbordeHorizontal(v)).toBe(false)
})
