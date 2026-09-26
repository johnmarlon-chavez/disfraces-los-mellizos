import { useState } from 'react'
import { formatearSoles, leerMonto } from '../../../../shared/formato'
import { MEDIOS_PAGO, NOMBRE_MEDIO, type MedioPago, type OpcionAdelantoAlCancelar } from '../../../../shared/pedidos'
import Boton from '../ui/Boton'
import { CampoTexto, Selector } from '../ui/Campos'
import Dialogo from '../ui/Dialogo'

const OPCIONES_MEDIO = MEDIOS_PAGO.map((m) => ({ valor: m, texto: NOMBRE_MEDIO[m] }))

export function DialogoAdelanto({
  saldo,
  onGuardar,
  onCerrar
}: {
  saldo: number
  onGuardar: (monto: number, medio: MedioPago) => Promise<void>
  onCerrar: () => void
}): React.JSX.Element {
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState<MedioPago>('efectivo')
  const [error, setError] = useState<string | null>(null)

  const guardar = async (): Promise<void> => {
    const r = leerMonto(monto)
    if (!r.ok) return setError(r.error)
    await onGuardar(r.centimos, medio)
  }

  return (
    <Dialogo
      titulo="Registrar adelanto"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>Registrar adelanto</Boton>
        </div>
      }
    >
      <p className="mb-4 text-lg">Saldo pendiente: {formatearSoles(saldo)}</p>
      <div className="grid grid-cols-2 gap-4">
        <CampoTexto etiqueta="Monto" prefijo="S/" valor={monto} onCambio={setMonto} error={error} entrada={{ inputMode: 'decimal', autoFocus: true }} />
        <Selector etiqueta="Medio de pago" valor={medio} onCambio={(v) => setMedio(v as MedioPago)} opciones={OPCIONES_MEDIO} />
      </div>
    </Dialogo>
  )
}

/** Cancelar el pedido: con adelanto pagado, pregunta si se devuelve todo, una parte o se retiene. */
export function DialogoCancelar({
  adelantoPagado,
  onCancelar,
  onCerrar
}: {
  adelantoPagado: number
  onCancelar: (opcion: OpcionAdelantoAlCancelar) => Promise<void>
  onCerrar: () => void
}): React.JSX.Element {
  const [tipo, setTipo] = useState<OpcionAdelantoAlCancelar['tipo']>('devolver_todo')
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState<MedioPago>('efectivo')
  const [error, setError] = useState<string | null>(null)

  const confirmar = async (): Promise<void> => {
    setError(null)
    if (adelantoPagado === 0 || tipo === 'retener') return onCancelar({ tipo: 'retener' })
    if (tipo === 'devolver_todo') return onCancelar({ tipo, medio })
    const r = leerMonto(monto)
    if (!r.ok) return setError(r.error)
    if (r.centimos <= 0) return setError('Escriba cuánto se devuelve.')
    if (r.centimos > adelantoPagado) return setError(`No puede devolver más del adelanto pagado (${formatearSoles(adelantoPagado)}).`)
    return onCancelar({ tipo, monto: r.centimos, medio })
  }

  const opciones: { valor: OpcionAdelantoAlCancelar['tipo']; texto: string }[] = [
    { valor: 'devolver_todo', texto: `Devolver todo (${formatearSoles(adelantoPagado)})` },
    { valor: 'devolver_parte', texto: 'Devolver una parte' },
    { valor: 'retener', texto: 'Retener el adelanto' }
  ]

  return (
    <Dialogo
      titulo="¿Cancelar el pedido?"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-3">
          <Boton variante="secundario" onClick={onCerrar}>
            No, volver
          </Boton>
          <Boton variante="peligro" onClick={confirmar}>
            Sí, cancelar pedido
          </Boton>
        </div>
      }
    >
      <p className="text-lg">Los disfraces quedarán libres para otros pedidos. El pedido no se borra: queda como cancelado.</p>
      {adelantoPagado > 0 && (
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="mb-1 text-lg font-semibold">
            El cliente pagó {formatearSoles(adelantoPagado)} de adelanto. ¿Qué se hace con ese dinero?
          </legend>
          {opciones.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 text-lg">
              <input type="radio" name="adelanto" checked={tipo === o.valor} onChange={() => setTipo(o.valor)} className="size-5" />
              {o.texto}
            </label>
          ))}
          {tipo === 'devolver_parte' && (
            <div className="w-48">
              <CampoTexto etiqueta="Monto a devolver" prefijo="S/" valor={monto} onCambio={setMonto} entrada={{ inputMode: 'decimal' }} />
            </div>
          )}
          {tipo !== 'retener' && (
            <div className="w-56">
              <Selector etiqueta="Se devuelve por" valor={medio} onCambio={(v) => setMedio(v as MedioPago)} opciones={OPCIONES_MEDIO} />
            </div>
          )}
          {tipo === 'retener' && <p className="text-base text-slate-700">Lo retenido cuenta como ingreso en los reportes.</p>}
          {tipo === 'devolver_parte' && <p className="text-base text-slate-700">Lo que no se devuelve queda retenido y cuenta como ingreso.</p>}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-2 font-semibold text-red-700">
          {error}
        </p>
      )}
    </Dialogo>
  )
}
