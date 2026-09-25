import { useEffect, useState } from 'react'
import {
  NOMBRE_DOCUMENTO,
  TIPOS_DOCUMENTO,
  normalizarDistrito,
  type ColegioParecido,
  type DatosCliente,
  type DatosColegio,
  type DatosPersona,
  type TipoCliente,
  type TipoDocumento
} from '../../../../shared/clientes'
import { llamar, mensajeDe } from '../../api'
import Boton from '../ui/Boton'
import { CampoTexto, Selector } from '../ui/Campos'
import Dialogo from '../ui/Dialogo'

const PERSONA_VACIA: DatosPersona = {
  tipo: 'persona',
  tipoDocumento: 'dni',
  numeroDocumento: '',
  nombres: '',
  telefono: '',
  direccion: '',
  observaciones: ''
}

const COLEGIO_VACIO: DatosColegio = {
  tipo: 'colegio',
  nombres: '',
  distrito: '',
  responsable: '',
  dniResponsable: '',
  telefono: '',
  ruc: '',
  direccion: '',
  observaciones: ''
}

interface Props {
  /** Si se indica, el formulario edita ese cliente; si no, crea uno nuevo. */
  clienteId?: number
  inicial?: DatosCliente
  /** Solo al crear: permite elegir entre persona y colegio. */
  elegirTipo?: boolean
  textoGuardar: string
  onGuardado: (id: number) => void
  /** Cuando la usuaria elige un cliente que ya existía (documento repetido o colegio parecido). */
  onUsarExistente: (id: number) => void
  onCancelar?: () => void
}

/**
 * Formulario de persona o colegio. Reutilizable: pantalla Clientes y, en la fase 4,
 * la pantalla del pedido (crear el cliente sin salir de ella).
 */
export default function FormularioCliente({
  clienteId,
  inicial,
  elegirTipo = false,
  textoGuardar,
  onGuardado,
  onUsarExistente,
  onCancelar
}: Props): React.JSX.Element {
  const [tipo, setTipo] = useState<TipoCliente>(inicial?.tipo ?? 'persona')
  const [persona, setPersona] = useState<DatosPersona>(inicial?.tipo === 'persona' ? inicial : PERSONA_VACIA)
  const [colegio, setColegio] = useState<DatosColegio>(inicial?.tipo === 'colegio' ? inicial : COLEGIO_VACIO)
  const [distritos, setDistritos] = useState<string[]>([])
  const [documentoRepetido, setDocumentoRepetido] = useState<{ id: number; nombres: string } | null>(null)
  const [parecidos, setParecidos] = useState<ColegioParecido[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    llamar(window.api.clientes.distritos()).then(setDistritos).catch(() => {})
  }, [])

  const revisarDocumento = async (): Promise<void> => {
    const encontrado = await llamar(
      window.api.clientes.porDocumento(persona.tipoDocumento, persona.numeroDocumento)
    ).catch(() => null)
    setDocumentoRepetido(encontrado && encontrado.id !== clienteId ? encontrado : null)
  }

  const guardarDe = async (datos: DatosCliente): Promise<void> => {
    setGuardando(true)
    try {
      if (clienteId !== undefined) {
        await llamar(window.api.clientes.actualizar(clienteId, datos))
        onGuardado(clienteId)
      } else {
        onGuardado(await llamar(window.api.clientes.crear(datos)))
      }
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  const guardar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const datos = tipo === 'persona' ? persona : colegio
    if (tipo === 'colegio') {
      // Antes de registrar un colegio (o cambiarle el nombre), avisar si ya existe uno parecido.
      const cambioNombre =
        inicial?.tipo !== 'colegio' || inicial.nombres !== colegio.nombres || inicial.distrito !== colegio.distrito
      if (cambioNombre) {
        try {
          const encontrados = await llamar(
            window.api.clientes.colegiosParecidos(colegio.nombres, colegio.distrito, clienteId ?? null)
          )
          if (encontrados.length > 0) return setParecidos(encontrados)
        } catch (err) {
          return setError(mensajeDe(err))
        }
      }
    }
    await guardarDe(datos)
  }

  const cambiarPersona = (cambio: Partial<DatosPersona>): void => setPersona({ ...persona, ...cambio })
  const cambiarColegio = (cambio: Partial<DatosColegio>): void => setColegio({ ...colegio, ...cambio })
  const mismoColegio = parecidos?.find((p) => p.mismo)

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5">
      {elegirTipo && (
        <div role="radiogroup" aria-label="Tipo de cliente" className="grid grid-cols-2 gap-3">
          {(['persona', 'colegio'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => {
                setTipo(t)
                setError(null)
              }}
              className={`rounded-lg border-2 px-4 py-4 text-left text-lg ${
                tipo === t ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700' : 'border-slate-400 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="block text-xl font-bold">{t === 'persona' ? 'Persona' : 'Colegio'}</span>
              <span className="text-base text-slate-700">
                {t === 'persona' ? 'Padre de familia, profesor…' : 'Pedido para un evento del colegio'}
              </span>
            </button>
          ))}
        </div>
      )}

      {tipo === 'persona' ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="grid grid-cols-[11rem_1fr] gap-3">
            <Selector
              etiqueta="Documento"
              valor={persona.tipoDocumento}
              onCambio={(v) => {
                cambiarPersona({ tipoDocumento: v as TipoDocumento })
                setDocumentoRepetido(null)
              }}
              opciones={TIPOS_DOCUMENTO.map((t) => ({ valor: t, texto: NOMBRE_DOCUMENTO[t] }))}
            />
            <CampoTexto
              etiqueta="Número"
              valor={persona.numeroDocumento}
              onCambio={(v) => {
                cambiarPersona({ numeroDocumento: v })
                setDocumentoRepetido(null)
              }}
              entrada={{
                onBlur: revisarDocumento,
                inputMode: persona.tipoDocumento === 'dni' ? 'numeric' : 'text',
                maxLength: persona.tipoDocumento === 'dni' ? 8 : 15,
                autoFocus: !elegirTipo && clienteId === undefined
              }}
            />
          </div>
          <CampoTexto etiqueta="Nombres y apellidos" valor={persona.nombres} onCambio={(v) => cambiarPersona({ nombres: v })} />
          {documentoRepetido && (
            <div role="alert" className="col-span-2 flex items-center justify-between gap-3 rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-lg">
              <span>
                Este documento ya está registrado a nombre de <strong>{documentoRepetido.nombres}</strong>.
              </span>
              <Boton variante="secundario" compacto onClick={() => onUsarExistente(documentoRepetido.id)}>
                Usar ese cliente
              </Boton>
            </div>
          )}
          <CampoTexto
            etiqueta="Teléfono"
            valor={persona.telefono}
            onCambio={(v) => cambiarPersona({ telefono: v })}
            ayuda="Celular (987 654 321) o fijo con código (044 123456)."
            entrada={{ inputMode: 'tel' }}
          />
          <CampoTexto
            etiqueta="Dirección (opcional)"
            valor={persona.direccion}
            onCambio={(v) => cambiarPersona({ direccion: v })}
          />
          <div className="col-span-2">
            <CampoTexto
              etiqueta="Observaciones (opcional)"
              valor={persona.observaciones}
              onCambio={(v) => cambiarPersona({ observaciones: v })}
              multilinea
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <CampoTexto
            etiqueta="Nombre del colegio"
            valor={colegio.nombres}
            onCambio={(v) => cambiarColegio({ nombres: v })}
            entrada={{ placeholder: 'Ej. I.E. N.° 80001 San Juan' }}
          />
          <CampoTexto
            etiqueta="Distrito"
            valor={colegio.distrito}
            onCambio={(v) => cambiarColegio({ distrito: v })}
            sugerencias={distritos}
            entrada={{ onBlur: () => cambiarColegio({ distrito: normalizarDistrito(colegio.distrito) }) }}
          />
          <CampoTexto
            etiqueta="Responsable (profesora o coordinadora)"
            valor={colegio.responsable}
            onCambio={(v) => cambiarColegio({ responsable: v })}
          />
          <CampoTexto
            etiqueta="DNI de la responsable"
            valor={colegio.dniResponsable}
            onCambio={(v) => cambiarColegio({ dniResponsable: v })}
            entrada={{ inputMode: 'numeric', maxLength: 8 }}
          />
          <CampoTexto
            etiqueta="Teléfono"
            valor={colegio.telefono}
            onCambio={(v) => cambiarColegio({ telefono: v })}
            ayuda="Celular (987 654 321) o fijo con código (044 123456)."
            entrada={{ inputMode: 'tel' }}
          />
          <CampoTexto
            etiqueta="RUC (opcional)"
            valor={colegio.ruc}
            onCambio={(v) => cambiarColegio({ ruc: v })}
            entrada={{ inputMode: 'numeric', maxLength: 11 }}
          />
          <CampoTexto
            etiqueta="Dirección (opcional)"
            valor={colegio.direccion}
            onCambio={(v) => cambiarColegio({ direccion: v })}
          />
          <CampoTexto
            etiqueta="Observaciones (opcional)"
            valor={colegio.observaciones}
            onCambio={(v) => cambiarColegio({ observaciones: v })}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        {onCancelar && (
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
        )}
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : textoGuardar}
        </Boton>
      </div>

      {parecidos && (
        <Dialogo
          titulo={mismoColegio ? 'Este colegio ya está registrado' : '¿Es alguno de estos colegios?'}
          onCerrar={() => setParecidos(null)}
          ancho="amplio"
          pie={
            <div className="flex justify-end gap-3">
              <Boton variante="secundario" onClick={() => setParecidos(null)}>
                Volver al formulario
              </Boton>
              {!mismoColegio && (
                <Boton
                  onClick={() => {
                    setParecidos(null)
                    void guardarDe(colegio)
                  }}
                >
                  No, es otro colegio: guardar
                </Boton>
              )}
            </div>
          }
        >
          <p className="mb-4 text-lg">
            {mismoColegio
              ? `Ya existe «${mismoColegio.nombres}» en ${mismoColegio.distrito}. Use ese colegio en lugar de registrarlo otra vez.`
              : 'Hay colegios registrados con un nombre parecido. Si es uno de ellos, úselo para no tener el mismo colegio dos veces.'}
          </p>
          <ul className="flex flex-col gap-2">
            {parecidos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-slate-300 p-3">
                <span className="text-lg">
                  <strong>{p.nombres}</strong> · {p.distrito}
                  {!p.activo && <span className="ml-2 text-slate-600">(desactivado)</span>}
                </span>
                <Boton variante={p.mismo ? 'primario' : 'secundario'} compacto onClick={() => onUsarExistente(p.id)}>
                  Usar este colegio
                </Boton>
              </li>
            ))}
          </ul>
        </Dialogo>
      )}
    </form>
  )
}
