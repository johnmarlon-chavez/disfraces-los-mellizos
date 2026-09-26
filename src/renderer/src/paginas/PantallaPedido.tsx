import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { ResumenCliente } from '../../../shared/clientes'
import { mismaTalla } from '../../../shared/disfraces'
import { formatearSoles, hoyEnLima, leerMonto } from '../../../shared/formato'
import {
  MEDIOS_PAGO,
  NOMBRE_MEDIO,
  diasDeAlquiler,
  fechaLimiteSugerida,
  reajustarPorDias,
  totalDelPedido,
  type BorradorPedido,
  type FichaPedido,
  type MedioPago,
  type ModeloDisponible,
  type Rango,
  type TipoGarantia
} from '../../../shared/pedidos'
import { llamar, mensajeDe } from '../api'
import AgregarDisfraces from '../componentes/pedidos/AgregarDisfraces'
import Carrito from '../componentes/pedidos/Carrito'
import { carritoDesdeFicha, lineaDe, nuevaClave, type LineaCarrito, type PendienteCarrito } from '../componentes/pedidos/modeloCarrito'
import DialogoCambiarUnidad from '../componentes/pedidos/DialogoCambiarUnidad'
import DialogoFaltan, { type Faltante } from '../componentes/pedidos/DialogoFaltan'
import SelectorCliente from '../componentes/pedidos/SelectorCliente'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton from '../componentes/ui/Boton'
import { CampoTexto, Selector } from '../componentes/ui/Campos'

interface PorAgregar {
  faltante: Faltante
  modelo: ModeloDisponible
  talla: string
  asignadas: LineaCarrito[]
}

/** Nuevo pedido (/alquileres/nuevo) o edición de una reserva (/alquileres/:id/editar). */
export default function PantallaPedido(): React.JSX.Element {
  const parametro = useParams().id
  const pedidoId = parametro ? Number(parametro) : null
  return <FormularioPedido key={pedidoId ?? 'nuevo'} pedidoId={pedidoId} />
}

function FormularioPedido({ pedidoId }: { pedidoId: number | null }): React.JSX.Element {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const estadoNavegacion = useLocation().state as { clienteId?: number } | null
  const hoy = hoyEnLima()

  const [cargado, setCargado] = useState(pedidoId === null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [precioPorDia, setPrecioPorDia] = useState(false)
  const [eventos, setEventos] = useState<string[]>([])

  const [cliente, setCliente] = useState<ResumenCliente | null>(null)
  const [clienteId, setClienteId] = useState<number | null>(estadoNavegacion?.clienteId ?? null)
  const [fechaSalida, setFechaSalida] = useState('')
  const [fechaDevolucion, setFechaDevolucion] = useState('')
  const [evento, setEvento] = useState('')
  const [gradoSeccion, setGradoSeccion] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [garantiaTipo, setGarantiaTipo] = useState<TipoGarantia | null>(null)
  const [garantiaMonto, setGarantiaMonto] = useState('')
  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  const [pendientes, setPendientes] = useState<PendienteCarrito[]>([])
  const [adelanto, setAdelanto] = useState('')
  const [medio, setMedio] = useState<MedioPago>('efectivo')
  const [adelantoPagado, setAdelantoPagado] = useState(0)
  const [salidaOriginal, setSalidaOriginal] = useState<string | null>(null)

  const [catalogo, setCatalogo] = useState<ModeloDisponible[] | null>(null)
  const [conflictos, setConflictos] = useState<Map<number, string>>(new Map())
  const [porAgregar, setPorAgregar] = useState<PorAgregar | null>(null)
  const [cambiando, setCambiando] = useState<LineaCarrito | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Configuración, eventos y, si se edita, el pedido
  useEffect(() => {
    llamar(window.api.config.obtener()).then((c) => setPrecioPorDia(c.precioPorDia)).catch(() => {})
    llamar(window.api.pedidos.eventos()).then(setEventos).catch(() => {})
    if (pedidoId === null) return
    llamar(window.api.pedidos.obtener(pedidoId))
      .then((f: FichaPedido) => {
        if (f.estado !== 'reservado') {
          setErrorCarga('Solo se pueden editar los pedidos reservados.')
          return
        }
        const c = carritoDesdeFicha(f)
        setClienteId(f.cliente.id)
        setFechaSalida(f.fechaSalida)
        setFechaDevolucion(f.fechaDevolucionPactada)
        setSalidaOriginal(f.fechaSalida)
        setEvento(f.evento)
        setGradoSeccion(f.gradoSeccion)
        setObservaciones(f.observaciones)
        setGarantiaTipo(f.garantiaTipo)
        setGarantiaMonto(f.garantiaMonto ? formatearSoles(f.garantiaMonto).replace('S/ ', '') : '')
        setLineas(c.lineas)
        setPendientes(c.pendientes)
        setAdelantoPagado(f.totales.adelantoNeto)
        setCargado(true)
      })
      .catch((e) => setErrorCarga(mensajeDe(e)))
  }, [pedidoId])

  const fechasListas = fechaSalida !== '' && fechaDevolucion !== '' && fechaDevolucion >= fechaSalida
  const rango = useMemo<Rango>(() => ({ inicio: fechaSalida, fin: fechaDevolucion }), [fechaSalida, fechaDevolucion])
  const fechaPasada = fechaSalida !== '' && fechaSalida < hoy && fechaSalida !== salidaOriginal

  // Al cambiar las fechas o el carrito: catálogo con libres y revisión de lo que ya está en el carrito
  const idsCarrito = lineas.map((l) => l.unidadId).join(',')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!cargado || !fechasListas) return
    let vigente = true
    const ids = idsCarrito ? idsCarrito.split(',').map(Number) : []
    Promise.all([llamar(window.api.pedidos.catalogo(rango, pedidoId)), llamar(window.api.pedidos.verificar(ids, rango, pedidoId))])
      .then(([cat, confl]) => {
        if (!vigente) return
        setCatalogo(cat)
        setConflictos(new Map(confl.map((c) => [c.unidadId, c.mensaje])))
      })
      .catch((e) => vigente && setError(mensajeDe(e)))
    return () => {
      vigente = false
    }
  }, [cargado, fechasListas, rango, pedidoId, idsCarrito, revision])

  /** Cambio de fechas: si el precio es por día, los precios se reajustan a los días nuevos. */
  const cambiarFechas = (salida: string, devolucion: string): void => {
    if (precioPorDia && fechaSalida && fechaDevolucion && salida && devolucion && devolucion >= salida) {
      const antes = diasDeAlquiler(fechaSalida, fechaDevolucion)
      const ahora = diasDeAlquiler(salida, devolucion)
      setLineas((ls) => ls.map((l) => ({ ...l, precioCobrado: reajustarPorDias(l.precioCobrado, antes, ahora) })))
      setPendientes((ps) => ps.map((x) => ({ ...x, precioCobrado: reajustarPorDias(x.precioCobrado, antes, ahora) })))
    }
    setFechaSalida(salida)
    setFechaDevolucion(devolucion)
  }

  const enCarrito = (modeloId: number, talla: string): number =>
    lineas.filter((l) => l.modeloId === modeloId && mismaTalla(l.talla, talla)).length

  const agregarPendiente = (modelo: ModeloDisponible, talla: string, cantidad: number, fechaLimite: string): void => {
    setPendientes((ps) => {
      const existente = ps.find((x) => x.modeloId === modelo.id && mismaTalla(x.talla, talla))
      if (existente) return ps.map((x) => (x === existente ? { ...x, cantidad: Math.min(200, x.cantidad + cantidad), fechaLimite } : x))
      return [
        ...ps,
        {
          clave: nuevaClave(),
          modeloId: modelo.id,
          modeloNombre: modelo.nombre,
          talla,
          cantidad,
          cantidadAsignada: 0,
          fechaLimite,
          precioCobrado: modelo.precioSugerido,
          observaciones: ''
        }
      ]
    })
  }

  const agregar = async (modelo: ModeloDisponible, talla: string, cantidad: number): Promise<void> => {
    setError(null)
    try {
      const r = await llamar(
        window.api.pedidos.asignar({
          modeloId: modelo.id,
          talla,
          cantidad,
          rango,
          excluirAlquilerId: pedidoId,
          yaEnCarrito: lineas.map((l) => l.unidadId)
        })
      )
      const nuevas = r.asignadas.map(lineaDe)
      if (r.faltan === 0) {
        setLineas((ls) => [...ls, ...nuevas])
        avisos.exito(`${nuevas.length} × ${modelo.nombre} talla ${talla} agregados: ${nuevas.map((l) => l.codigo).join(', ')}.`)
        return
      }
      setPorAgregar({
        faltante: { modeloNombre: modelo.nombre, talla, pedidas: cantidad, libres: nuevas.length, faltan: r.faltan },
        modelo,
        talla,
        asignadas: nuevas
      })
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  // Precios
  const precioLinea = (unidadId: number, precio: number): void =>
    setLineas((ls) => ls.map((l) => (l.unidadId === unidadId ? { ...l, precioCobrado: precio } : l)))
  const precioGrupo = (modeloId: number, talla: string, precio: number): void =>
    setLineas((ls) => ls.map((l) => (l.modeloId === modeloId && mismaTalla(l.talla, talla) ? { ...l, precioCobrado: precio } : l)))
  const precioModelo = (modeloId: number, precio: number): void => {
    setLineas((ls) => ls.map((l) => (l.modeloId === modeloId ? { ...l, precioCobrado: precio } : l)))
    setPendientes((ps) => ps.map((x) => (x.modeloId === modeloId ? { ...x, precioCobrado: precio } : x)))
    avisos.exito(`Precio ${formatearSoles(precio)} aplicado a todos los de ese disfraz.`)
  }

  const total = totalDelPedido(lineas, pendientes)
  const lecturaAdelanto = adelanto.trim() ? leerMonto(adelanto) : ({ ok: true, centimos: 0 } as const)
  const montoAdelanto = lecturaAdelanto.ok ? lecturaAdelanto.centimos : 0
  const pagado = pedidoId === null ? montoAdelanto : adelantoPagado
  const lecturaGarantia = garantiaTipo === 'efectivo' && garantiaMonto.trim() ? leerMonto(garantiaMonto) : null

  const guardar = async (): Promise<void> => {
    setError(null)
    if (!clienteId) return setError('Elija el cliente del pedido.')
    if (!fechasListas) return setError('Elija las fechas de salida y devolución.')
    if (conflictos.size > 0) return setError('Hay disfraces que ya no están libres en estas fechas. Cámbielos o quítelos.')
    if (!lecturaAdelanto.ok) return setError(`Adelanto: ${lecturaAdelanto.error}`)
    if (lecturaGarantia && !lecturaGarantia.ok) return setError(`Garantía: ${lecturaGarantia.error}`)

    const borrador: BorradorPedido = {
      clienteId,
      fechaSalida,
      fechaDevolucionPactada: fechaDevolucion,
      evento,
      gradoSeccion,
      observaciones,
      garantiaTipo,
      garantiaMonto: lecturaGarantia?.ok ? lecturaGarantia.centimos : 0,
      lineas: lineas.map((l) => ({ unidadId: l.unidadId, precioCobrado: l.precioCobrado })),
      pendientes: pendientes.map((x) => ({
        id: x.id,
        modeloId: x.modeloId,
        talla: x.talla,
        cantidad: x.cantidad,
        fechaLimite: x.fechaLimite,
        precioCobrado: x.precioCobrado,
        observaciones: x.observaciones
      })),
      adelanto: pedidoId === null && montoAdelanto > 0 ? { monto: montoAdelanto, medio } : null
    }
    setGuardando(true)
    try {
      if (pedidoId === null) {
        const id = await llamar(window.api.pedidos.crear(borrador))
        avisos.exito('Reserva guardada.')
        navegar(`/alquileres/${id}`, { replace: true })
      } else {
        await llamar(window.api.pedidos.actualizar(pedidoId, borrador))
        avisos.exito('Cambios guardados.')
        navegar(`/alquileres/${pedidoId}`, { replace: true })
      }
    } catch (e) {
      setError(mensajeDe(e))
      setRevision((r) => r + 1) // vuelve a consultar disponibilidad: algo pudo cambiar
    } finally {
      setGuardando(false)
    }
  }

  if (errorCarga) {
    return (
      <section>
        <Link to="/alquileres" className="text-lg font-semibold text-blue-800 hover:underline">
          ← Volver a Alquileres
        </Link>
        <p role="alert" className="mt-4 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {errorCarga}
        </p>
      </section>
    )
  }
  if (!cargado) return <p className="text-lg">Cargando…</p>

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link
          to={pedidoId === null ? '/alquileres' : `/alquileres/${pedidoId}`}
          className="text-lg font-semibold text-blue-800 hover:underline"
        >
          ← {pedidoId === null ? 'Volver a Alquileres' : 'Volver al pedido'}
        </Link>
        <h1 className="mt-1 text-3xl font-bold">{pedidoId === null ? 'Nuevo pedido' : `Editar pedido N.° ${pedidoId}`}</h1>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_25rem] items-start gap-5">
        {/* Columna izquierda: datos y agregar disfraces */}
        <div className="flex flex-col gap-5">
          <div className="rounded-lg bg-white p-4 shadow">
            <SelectorCliente
              clienteId={clienteId}
              onElegir={(c) => {
                setCliente(c)
                setClienteId(c?.id ?? null)
                if (c?.tipo === 'colegio' && garantiaTipo === null) setGarantiaTipo('dni')
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-white p-4 shadow">
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Salida</span>
              <input
                type="date"
                value={fechaSalida}
                min={salidaOriginal && salidaOriginal < hoy ? salidaOriginal : hoy}
                onChange={(e) => {
                  const salida = e.target.value
                  cambiarFechas(salida, fechaDevolucion && fechaDevolucion >= salida ? fechaDevolucion : salida)
                }}
                className="rounded-lg border-2 border-slate-400 px-3 py-2 text-lg"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Devolución</span>
              <input
                type="date"
                value={fechaDevolucion}
                min={fechaSalida || hoy}
                onChange={(e) => cambiarFechas(fechaSalida, e.target.value)}
                className="rounded-lg border-2 border-slate-400 px-3 py-2 text-lg"
              />
            </label>
            {fechaPasada && <p className="col-span-2 font-semibold text-red-700">La fecha de salida ya pasó.</p>}
            <CampoTexto
              etiqueta="Evento"
              valor={evento}
              onCambio={setEvento}
              sugerencias={eventos}
              entrada={{ placeholder: 'Ej. Día de la Madre' }}
            />
            <CampoTexto
              etiqueta="Grado y sección (opcional)"
              valor={gradoSeccion}
              onCambio={setGradoSeccion}
              entrada={{ placeholder: cliente?.tipo === 'colegio' ? 'Ej. 3.° B' : '' }}
            />
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <h2 className="mb-3 text-2xl font-bold">Agregar disfraces</h2>
            <AgregarDisfraces
              catalogo={catalogo}
              enCarrito={enCarrito}
              onAgregar={agregar}
              deshabilitado={fechasListas ? null : 'Elija primero las fechas de salida y devolución para ver qué disfraces están libres.'}
            />
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <CampoTexto etiqueta="Observaciones (opcional)" valor={observaciones} onCambio={setObservaciones} multilinea />
          </div>
        </div>

        {/* Columna derecha: carrito y montos, siempre visibles */}
        <aside aria-label="Pedido" className="sticky top-0 flex max-h-[calc(100vh-4rem)] flex-col gap-3 rounded-lg bg-white p-4 shadow">
          <h2 className="text-2xl font-bold">Pedido</h2>
          <div className="min-h-24 flex-1 overflow-y-auto pr-1">
            <Carrito
              lineas={lineas}
              pendientes={pendientes}
              conflictos={conflictos}
              fechaSalida={fechaSalida}
              hoy={hoy}
              onPrecioLinea={precioLinea}
              onPrecioGrupo={precioGrupo}
              onPrecioModelo={precioModelo}
              onQuitarLinea={(id) => {
                setError(null)
                setLineas((ls) => ls.filter((l) => l.unidadId !== id))
                setConflictos((c) => {
                  const n = new Map(c)
                  n.delete(id)
                  return n
                })
              }}
              onCambiarLinea={setCambiando}
              onPendiente={(clave, cambio) => setPendientes((ps) => ps.map((x) => (x.clave === clave ? { ...x, ...cambio } : x)))}
              onQuitarPendiente={(clave) => setPendientes((ps) => ps.filter((x) => x.clave !== clave))}
            />
          </div>

          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t-2 border-slate-300 pt-3 text-lg">
            <dt className="font-semibold">Total del alquiler</dt>
            <dd className="text-right text-xl font-bold">{formatearSoles(total)}</dd>
            {pedidoId === null ? (
              <>
                <dt className="flex items-center gap-2 font-semibold">
                  Adelanto
                  <select
                    aria-label="Medio de pago del adelanto"
                    value={medio}
                    onChange={(e) => setMedio(e.target.value as MedioPago)}
                    className="rounded border-2 border-slate-400 px-1 text-base"
                  >
                    {MEDIOS_PAGO.map((m) => (
                      <option key={m} value={m}>
                        {NOMBRE_MEDIO[m]}
                      </option>
                    ))}
                  </select>
                </dt>
                <dd className="flex items-center justify-end gap-1">
                  S/
                  <input
                    aria-label="Adelanto"
                    value={adelanto}
                    onChange={(e) => setAdelanto(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={`w-24 rounded-lg border-2 px-2 py-1 text-right ${lecturaAdelanto.ok ? 'border-slate-400' : 'border-red-700'}`}
                  />
                </dd>
                {!lecturaAdelanto.ok && <dd className="col-span-2 text-base font-semibold text-red-700">{lecturaAdelanto.error}</dd>}
              </>
            ) : (
              <>
                <dt className="font-semibold">Adelanto pagado</dt>
                <dd className="text-right">{formatearSoles(adelantoPagado)}</dd>
              </>
            )}
            <dt className="font-semibold">Saldo pendiente</dt>
            <dd className={`text-right text-xl font-bold ${total - pagado < 0 ? 'text-red-700' : ''}`}>{formatearSoles(total - pagado)}</dd>
          </dl>

          <div className="rounded-lg border-2 border-slate-200 p-2">
            <p className="font-semibold">Garantía (aparte, se devuelve al final)</p>
            <div className="mt-1 flex items-center gap-2">
              <Selector
                etiqueta="Tipo de garantía"
                valor={garantiaTipo ?? ''}
                onCambio={(v) => setGarantiaTipo(v === '' ? null : (v as TipoGarantia))}
                opciones={[
                  { valor: '', texto: 'Por definir' },
                  { valor: 'efectivo', texto: 'Efectivo' },
                  { valor: 'dni', texto: 'DNI en prenda' }
                ]}
              />
              {garantiaTipo === 'efectivo' && (
                <label className="flex items-center gap-1 self-end pb-2">
                  S/
                  <input
                    aria-label="Monto de la garantía"
                    value={garantiaMonto}
                    onChange={(e) => setGarantiaMonto(e.target.value)}
                    inputMode="decimal"
                    className="w-24 rounded-lg border-2 border-slate-400 px-2 py-1 text-right text-lg"
                  />
                </label>
              )}
            </div>
            {garantiaTipo === 'dni' && cliente?.tipo === 'colegio' && cliente.dniResponsable && (
              <p className="text-base text-slate-700">
                DNI de la responsable ({cliente.responsable}): {cliente.dniResponsable}
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-2 text-lg font-semibold whitespace-pre-line text-red-800">
              {error}
            </p>
          )}
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : pedidoId === null ? 'Guardar reserva' : 'Guardar cambios'}
          </Boton>
        </aside>
      </div>

      {porAgregar && (
        <DialogoFaltan
          faltante={porAgregar.faltante}
          fechaLimiteSugerida={fechaLimiteSugerida(fechaSalida, hoy)}
          fechaSalida={fechaSalida}
          hoy={hoy}
          onCancelar={() => setPorAgregar(null)}
          onSoloLibres={() => {
            setLineas((ls) => [...ls, ...porAgregar.asignadas])
            setPorAgregar(null)
          }}
          onAgregarYConfeccionar={(fechaLimite) => {
            setLineas((ls) => [...ls, ...porAgregar.asignadas])
            agregarPendiente(porAgregar.modelo, porAgregar.talla, porAgregar.faltante.faltan, fechaLimite)
            avisos.exito(`${porAgregar.faltante.faltan} × ${porAgregar.modelo.nombre} talla ${porAgregar.talla} por confeccionar.`)
            setPorAgregar(null)
          }}
        />
      )}

      {cambiando && (
        <DialogoCambiarUnidad
          linea={cambiando}
          rango={rango}
          excluirAlquilerId={pedidoId}
          yaEnCarrito={lineas.map((l) => l.unidadId)}
          onCerrar={() => setCambiando(null)}
          onElegir={(u) => {
            setError(null)
            const nueva = { ...lineaDe(u), precioCobrado: cambiando.precioCobrado }
            setLineas((ls) => ls.map((l) => (l.unidadId === cambiando.unidadId ? nueva : l)))
            setConflictos((c) => {
              const n = new Map(c)
              n.delete(cambiando.unidadId)
              return n
            })
            setCambiando(null)
          }}
        />
      )}
    </section>
  )
}
