import { useState } from 'react'
import { formatearSoles, leerMonto } from '../../../../shared/formato'
import { MEDIOS_PAGO, NOMBRE_MEDIO, type FichaPedido, type MedioPago } from '../../../../shared/pedidos'
import type { CargoPedido } from '../../../../shared/entregas'
import { llamar, mensajeDe } from '../../api'
import { useAutorizacionDuena } from '../ui/AutorizacionDuena'
import Boton from '../ui/Boton'
import { CampoTexto, Selector } from '../ui/Campos'
import Dialogo from '../ui/Dialogo'
import ResumenLiquidacion from './ResumenLiquidacion'

const OPCIONES_MEDIO = MEDIOS_PAGO.map((m) => ({ valor: m, texto: NOMBRE_MEDIO[m] }))
const sinSoles = (c: number): string => formatearSoles(c).replace('S/ ', '')

/** Cierre del pedido: muestra la liquidación y registra lo que se cobra y lo que se devuelve. */
export function DialogoLiquidar({
  pedido,
  onCerrar,
  onListo
}: {
  pedido: FichaPedido
  onCerrar: () => void
  onListo: (mensaje: string) => void
}): React.JSX.Element {
  const plan = pedido.cuenta.plan
  const [cobro, setCobro] = useState(plan.faltaCobrar.total > 0 ? sinSoles(plan.faltaCobrar.total) : '')
  const [medioCobro, setMedioCobro] = useState<MedioPago>('efectivo')
  const [medioDevolucion, setMedioDevolucion] = useState<MedioPago>('efectivo')
  const [error, setError] = useState<string | null>(null)

  const confirmar = async (): Promise<void> => {
    setError(null)
    const r = cobro.trim() ? leerMonto(cobro) : ({ ok: true, centimos: 0 } as const)
    if (!r.ok) return setError(r.error)
    if (r.centimos > plan.faltaCobrar.total) return setError(`No puede cobrar más de ${formatearSoles(plan.faltaCobrar.total)}.`)
    try {
      await llamar(
        window.api.entregas.liquidar(pedido.id, {
          cobros: r.centimos > 0 ? [{ monto: r.centimos, medio: medioCobro }] : [],
          medioDevolucion
        })
      )
      const debe = plan.faltaCobrar.total - r.centimos
      onListo(debe > 0 ? `Pedido cerrado. Queda debiendo ${formatearSoles(debe)}.` : 'Pedido cerrado.')
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  return (
    <Dialogo
      titulo="Cerrar el pedido"
      onCerrar={onCerrar}
      ancho="amplio"
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            Volver
          </Boton>
          <Boton variante="exito" onClick={confirmar}>
            Confirmar y cerrar el pedido
          </Boton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ResumenLiquidacion plan={plan} documento={pedido.cuenta.garantiaDocumento} />
        {plan.faltaCobrar.total > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <CampoTexto
              etiqueta="Cobrar ahora"
              prefijo="S/"
              valor={cobro}
              onCambio={setCobro}
              ayuda="Si no paga todo, el pedido se cierra con deuda."
              entrada={{ inputMode: 'decimal' }}
            />
            <Selector etiqueta="Medio de pago" valor={medioCobro} onCambio={(v) => setMedioCobro(v as MedioPago)} opciones={OPCIONES_MEDIO} />
          </div>
        )}
        {(plan.devolverGarantia > 0 || plan.aFavor > 0) && (
          <div className="w-72">
            <Selector
              etiqueta="Se devuelve por"
              valor={medioDevolucion}
              onCambio={(v) => setMedioDevolucion(v as MedioPago)}
              opciones={OPCIONES_MEDIO}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  )
}

/** Solo la dueña rebaja o perdona la mora; el motivo queda registrado. */
export function DialogoRebajarMora({
  cargo,
  onCerrar,
  onListo
}: {
  cargo: CargoPedido
  onCerrar: () => void
  onListo: (mensaje: string) => void
}): React.JSX.Element {
  const autorizarDuena = useAutorizacionDuena()
  const [monto, setMonto] = useState('0')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const confirmar = async (): Promise<void> => {
    setError(null)
    const r = leerMonto(monto.trim() || '0')
    if (!r.ok) return setError(r.error)
    if (motivo.trim().length < 5) return setError('Escriba el motivo (queda registrado).')
    const aut = await autorizarDuena({
      titulo: 'Autorización de la dueña',
      mensaje: `¿${r.centimos === 0 ? 'Perdonar' : 'Rebajar'} la mora de ${formatearSoles(cargo.monto)}${r.centimos > 0 ? ` a ${formatearSoles(r.centimos)}` : ''}?`,
      textoConfirmar: 'Autorizar'
    })
    if (!aut) return
    try {
      await llamar(window.api.entregas.rebajarMora(cargo.id, r.centimos, motivo, aut.autorizacion))
      onListo(r.centimos === 0 ? 'Mora perdonada.' : `Mora rebajada a ${formatearSoles(r.centimos)}.`)
    } catch (e) {
      setError(mensajeDe(e))
    }
  }

  return (
    <Dialogo
      titulo="Rebajar o perdonar la mora"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={confirmar}>Guardar</Boton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-lg">
          {cargo.descripcion}: {formatearSoles(cargo.monto)}
        </p>
        <CampoTexto etiqueta="Nuevo monto (0 para perdonarla)" prefijo="S/" valor={monto} onCambio={setMonto} entrada={{ inputMode: 'decimal' }} />
        <CampoTexto etiqueta="Motivo" valor={motivo} onCambio={setMotivo} entrada={{ placeholder: 'Ej. cliente frecuente, avisó con tiempo' }} />
        {error && (
          <p role="alert" className="font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  )
}

/** Cobrar lo que el cliente debe (saldo autorizado o deuda al cerrar). */
export function DialogoPagoDeuda({
  debe,
  onGuardar,
  onCerrar
}: {
  debe: number
  onGuardar: (monto: number, medio: MedioPago) => Promise<void>
  onCerrar: () => void
}): React.JSX.Element {
  const [monto, setMonto] = useState(sinSoles(debe))
  const [medio, setMedio] = useState<MedioPago>('efectivo')
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialogo
      titulo="Registrar pago de la deuda"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            onClick={async () => {
              const r = leerMonto(monto)
              if (!r.ok) return setError(r.error)
              await onGuardar(r.centimos, medio)
            }}
          >
            Registrar pago
          </Boton>
        </div>
      }
    >
      <p className="mb-4 text-lg">Debe {formatearSoles(debe)}.</p>
      <div className="grid grid-cols-2 gap-4">
        <CampoTexto etiqueta="Monto" prefijo="S/" valor={monto} onCambio={setMonto} error={error} entrada={{ inputMode: 'decimal' }} />
        <Selector etiqueta="Medio de pago" valor={medio} onCambio={(v) => setMedio(v as MedioPago)} opciones={OPCIONES_MEDIO} />
      </div>
    </Dialogo>
  )
}
