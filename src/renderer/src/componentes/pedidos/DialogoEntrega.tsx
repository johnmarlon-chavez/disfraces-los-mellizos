import { useState } from 'react'
import { formatearFecha, formatearSoles, hoyEnLima, leerMonto } from '../../../../shared/formato'
import { MEDIOS_PAGO, NOMBRE_MEDIO, type FichaPedido, type MedioPago, type TipoGarantia } from '../../../../shared/pedidos'
import type { DatosEntrega } from '../../../../shared/entregas'
import type { AutorizacionDuena } from '../../../../shared/autorizacion'
import { llamar, mensajeDe } from '../../api'
import { useAutorizacionDuena } from '../ui/AutorizacionDuena'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'
import { agrupar } from './modeloCarrito'

interface Props {
  pedido: FichaPedido
  onCerrar: () => void
  onEntregado: (mensaje: string) => void
}

const selectorMedio = (valor: MedioPago, onCambio: (m: MedioPago) => void, etiqueta: string): React.JSX.Element => (
  <select
    aria-label={etiqueta}
    value={valor}
    onChange={(e) => onCambio(e.target.value as MedioPago)}
    className="rounded-lg border-2 border-slate-400 px-2 py-1 text-lg"
  >
    {MEDIOS_PAGO.map((m) => (
      <option key={m} value={m}>
        {NOMBRE_MEDIO[m]}
      </option>
    ))}
  </select>
)

/** Entrega: elegir qué sale, cobrar el saldo y registrar la garantía (solo la primera vez). */
export default function DialogoEntrega({ pedido, onCerrar, onEntregado }: Props): React.JSX.Element {
  const autorizarDuena = useAutorizacionDuena()
  const hoy = hoyEnLima()
  const primera = pedido.estado === 'reservado'
  const porEntregar = pedido.lineas.filter((l) => !l.fechaEntregaReal)
  const porConfeccionar = pedido.pendientes.reduce((s, x) => s + x.cantidad - x.cantidadAsignada, 0)
  const adelantar = primera && pedido.fechaSalida > hoy

  const [elegidas, setElegidas] = useState<Set<number>>(() => new Set(porEntregar.map((l) => l.detalleId)))
  const [pagos, setPagos] = useState<{ monto: string; medio: MedioPago }[]>([
    { monto: pedido.totales.saldo > 0 ? formatearSoles(pedido.totales.saldo).replace('S/ ', '') : '', medio: 'efectivo' }
  ])
  const [saldoPendiente, setSaldoPendiente] = useState(false)
  const esColegio = pedido.cliente.tipo === 'colegio'
  const [garantiaTipo, setGarantiaTipo] = useState<TipoGarantia>(pedido.garantiaTipo ?? (esColegio ? 'dni' : 'efectivo'))
  const [garantiaMonto, setGarantiaMonto] = useState(
    pedido.garantiaMonto ? formatearSoles(pedido.garantiaMonto).replace('S/ ', '') : ''
  )
  const [garantiaMedio, setGarantiaMedio] = useState<MedioPago>('efectivo')
  const [documento, setDocumento] = useState(esColegio ? (pedido.cliente.dniResponsable ?? '') : '')
  const [lavanderia, setLavanderia] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const seleccion = porEntregar.filter((l) => elegidas.has(l.detalleId))
  const enLavanderia = seleccion.filter((l) => l.estadoFisico === 'lavanderia')
  const lecturas = pagos.map((x) => (x.monto.trim() ? leerMonto(x.monto) : ({ ok: true, centimos: 0 } as const)))
  const cobrado = lecturas.reduce((s, r) => s + (r.ok ? r.centimos : 0), 0)
  const faltaSaldo = primera ? pedido.totales.saldo - cobrado : 0

  const entregar = async (): Promise<void> => {
    setError(null)
    if (seleccion.length === 0) return setError('Elija los disfraces que se entregan.')
    const malo = lecturas.find((r) => !r.ok)
    if (malo && !malo.ok) return setError(`Pago: ${malo.error}`)
    let garantia: DatosEntrega['garantia'] = null
    if (primera) {
      if (garantiaTipo === 'efectivo') {
        const g = leerMonto(garantiaMonto)
        if (!g.ok) return setError(`Garantía: ${g.error}`)
        garantia = { tipo: 'efectivo', monto: g.centimos, medio: garantiaMedio, documento: '' }
      } else {
        garantia = { tipo: 'dni', monto: 0, medio: 'efectivo', documento }
      }
      if (faltaSaldo > 0 && !saldoPendiente) {
        return setError(`Falta cobrar ${formatearSoles(faltaSaldo)} del saldo. Si la dueña lo autoriza, marque "Entregar con saldo pendiente".`)
      }
    }

    // Acciones de la dueña: saldo pendiente o disfraces por confeccionar
    let autorizacion: AutorizacionDuena | null = null
    const motivos = [
      primera && faltaSaldo > 0 ? `entregar con ${formatearSoles(faltaSaldo)} de saldo pendiente (quedará como deuda)` : null,
      primera && porConfeccionar > 0 ? `entregar sin los ${porConfeccionar} disfraces que faltan confeccionar (se entregarán después)` : null
    ].filter(Boolean)
    if (motivos.length > 0) {
      const r = await autorizarDuena({
        titulo: 'Autorización de la dueña',
        mensaje: `Se necesita autorización para ${motivos.join(' y ')}.`,
        textoConfirmar: 'Autorizar'
      })
      if (!r) return
      autorizacion = r.autorizacion
    }

    setGuardando(true)
    try {
      const r = await llamar(
        window.api.entregas.entregar(
          pedido.id,
          {
            detalleIds: seleccion.map((l) => l.detalleId),
            adelantarSalida: adelantar,
            lavanderiaConfirmada: lavanderia,
            pagos: primera
              ? pagos.flatMap((x, i) => {
                  const r = lecturas[i]
                  return r.ok && r.centimos > 0 ? [{ monto: r.centimos, medio: x.medio }] : []
                })
              : [],
            saldoPendienteAutorizado: saldoPendiente,
            garantia
          },
          autorizacion
        )
      )
      onEntregado(
        `Entregados: ${r.entregadas.length}.` + (r.faltanEntregar > 0 ? ` Faltan entregar ${r.faltanEntregar}.` : '')
      )
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      titulo={adelantar ? 'Entregar hoy (adelantar la salida)' : primera ? 'Entregar pedido' : 'Entregar los que faltan'}
      onCerrar={onCerrar}
      ancho="amplio"
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="exito" onClick={entregar} disabled={guardando}>
            {guardando ? 'Guardando…' : `Entregar ${seleccion.length} ${seleccion.length === 1 ? 'disfraz' : 'disfraces'}`}
          </Boton>
        </div>
      }
    >
      <div className="flex flex-col gap-5 text-lg">
        {adelantar && (
          <p className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3">
            La salida estaba para el {formatearFecha(pedido.fechaSalida)}. Al entregar hoy, la salida pasa a hoy (se verifica que
            los disfraces estén libres desde hoy).
          </p>
        )}
        {primera && porConfeccionar > 0 && (
          <p className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3">
            Faltan {porConfeccionar} por confeccionar. Se puede entregar lo que hay (autoriza la dueña) y entregar el resto después
            en este mismo pedido.
          </p>
        )}

        <fieldset>
          <legend className="mb-2 font-bold">Disfraces que salen ahora</legend>
          <div className="flex flex-col gap-2">
            {agrupar(porEntregar).map((g) => (
              <div key={g.clave} className="rounded-lg border-2 border-slate-200 p-2">
                <p className="font-semibold">
                  {g.modeloNombre} · T{g.talla}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {g.lineas.map((l) => {
                    const linea = porEntregar.find((x) => x.unidadId === l.unidadId)!
                    return (
                      <label key={l.unidadId} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 font-mono">
                        <input
                          type="checkbox"
                          className="size-5"
                          checked={elegidas.has(linea.detalleId)}
                          onChange={(e) => {
                            const s = new Set(elegidas)
                            if (e.target.checked) s.add(linea.detalleId)
                            else s.delete(linea.detalleId)
                            setElegidas(s)
                          }}
                        />
                        {l.codigo}
                        {l.estadoFisico === 'lavanderia' && <span className="font-sans text-sm text-amber-800">(lavandería)</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {enLavanderia.length > 0 && (
            <label className="mt-2 flex items-center gap-2 font-semibold text-amber-900">
              <input type="checkbox" className="size-5" checked={lavanderia} onChange={(e) => setLavanderia(e.target.checked)} />
              {enLavanderia.map((l) => l.codigo).join(', ')} {enLavanderia.length === 1 ? 'figura' : 'figuran'} en lavandería:
              confirmo que ya {enLavanderia.length === 1 ? 'está limpio' : 'están limpios'}
            </label>
          )}
        </fieldset>

        {primera && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-bold">Cobro del saldo: {formatearSoles(pedido.totales.saldo)}</legend>
            {pagos.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                S/
                <input
                  aria-label={`Monto del pago ${i + 1}`}
                  value={x.monto}
                  inputMode="decimal"
                  onChange={(e) => setPagos(pagos.map((y, j) => (j === i ? { ...y, monto: e.target.value } : y)))}
                  className="w-32 rounded-lg border-2 border-slate-400 px-2 py-1 text-right"
                />
                {selectorMedio(x.medio, (m) => setPagos(pagos.map((y, j) => (j === i ? { ...y, medio: m } : y))), `Medio del pago ${i + 1}`)}
                {pagos.length > 1 && (
                  <Boton compacto variante="secundario" onClick={() => setPagos(pagos.filter((_, j) => j !== i))}>
                    Quitar
                  </Boton>
                )}
              </div>
            ))}
            <div>
              <Boton compacto variante="secundario" onClick={() => setPagos([...pagos, { monto: '', medio: 'yape' }])}>
                + Otro medio de pago
              </Boton>
            </div>
            {faltaSaldo > 0 && (
              <label className="flex items-center gap-2 font-semibold text-amber-900">
                <input type="checkbox" className="size-5" checked={saldoPendiente} onChange={(e) => setSaldoPendiente(e.target.checked)} />
                Entregar con {formatearSoles(faltaSaldo)} de saldo pendiente (autoriza la dueña; queda como deuda)
              </label>
            )}
            {faltaSaldo < 0 && <p className="font-semibold text-red-700">Está cobrando más que el saldo.</p>}
          </fieldset>
        )}

        {primera && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-bold">Garantía</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="garantia" className="size-5" checked={garantiaTipo === 'efectivo'} onChange={() => setGarantiaTipo('efectivo')} />
                Dinero
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="garantia" className="size-5" checked={garantiaTipo === 'dni'} onChange={() => setGarantiaTipo('dni')} />
                DNI en prenda
              </label>
            </div>
            {garantiaTipo === 'efectivo' ? (
              <div className="flex items-center gap-2">
                S/
                <input
                  aria-label="Monto de la garantía"
                  value={garantiaMonto}
                  inputMode="decimal"
                  onChange={(e) => setGarantiaMonto(e.target.value)}
                  className="w-32 rounded-lg border-2 border-slate-400 px-2 py-1 text-right"
                />
                {selectorMedio(garantiaMedio, setGarantiaMedio, 'Medio de la garantía')}
              </div>
            ) : (
              <label className="flex items-center gap-2">
                N.° de documento
                <input
                  aria-label="Documento en prenda"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  className="w-40 rounded-lg border-2 border-slate-400 px-2 py-1"
                />
                {esColegio && <span className="text-base text-slate-700">(de la responsable: {pedido.cliente.responsable})</span>}
              </label>
            )}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 font-semibold whitespace-pre-line text-red-800">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  )
}
