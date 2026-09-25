import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Region } from '../../../shared/disfraces'
import { leerMonto } from '../../../shared/formato'
import { llamar, mensajeDe } from '../api'
import SelectorRegion from '../componentes/disfraces/SelectorRegion'
import Boton, { clasesBoton } from '../componentes/ui/Boton'
import { CampoTexto } from '../componentes/ui/Campos'
import { useAvisos } from '../componentes/ui/Avisos'

export default function NuevoDisfraz(): React.JSX.Element {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [region, setRegion] = useState<Region | null>(null)
  const [precio, setPrecio] = useState('')
  const [prefijo, setPrefijo] = useState('')
  const [prefijoManual, setPrefijoManual] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    llamar(window.api.modelos.categorias()).then(setCategorias).catch(() => {})
  }, [])

  // Mientras la usuaria no lo cambie a mano, el prefijo se sugiere a partir del nombre.
  useEffect(() => {
    if (prefijoManual || !nombre.trim()) return
    let vigente = true
    llamar(window.api.modelos.sugerirPrefijo(nombre))
      .then((p) => vigente && setPrefijo(p))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [nombre, prefijoManual])

  const guardar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const monto = leerMonto(precio)
    setErrorPrecio(monto.ok ? null : monto.error)
    if (!monto.ok) return
    setGuardando(true)
    try {
      const id = await llamar(
        window.api.modelos.crear({ nombre, categoria, region, descripcion, precioAlquiler: monto.centimos, prefijo })
      )
      avisos.exito('Disfraz creado. Ahora agregue sus unidades por talla.')
      navegar(`/disfraces/${id}`, { replace: true })
    } catch (err) {
      setError(mensajeDe(err))
    } finally {
      setGuardando(false)
    }
  }

  const prefijoMostrado = prefijo.trim().toUpperCase()

  return (
    <section className="max-w-3xl">
      <Link to="/disfraces" className="text-lg font-semibold text-blue-800 hover:underline">
        ← Volver a Disfraces
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold">Nuevo disfraz</h1>
      <form onSubmit={guardar} className="grid grid-cols-2 gap-5 rounded-lg bg-white p-6 shadow">
        <div className="col-span-2">
          <CampoTexto
            etiqueta="Nombre"
            valor={nombre}
            onCambio={setNombre}
            ayuda='Si la danza tiene traje de varón y de mujer, regístrelos por separado: "Marinera varón" y "Marinera mujer".'
            entrada={{ autoFocus: true, placeholder: 'Ej. Huaylas mujer' }}
          />
        </div>
        <CampoTexto
          etiqueta="Categoría"
          valor={categoria}
          onCambio={setCategoria}
          sugerencias={categorias}
          entrada={{ placeholder: 'Ej. Danzas típicas' }}
        />
        <SelectorRegion valor={region} onCambio={setRegion} />
        <CampoTexto
          etiqueta="Precio de alquiler"
          prefijo="S/"
          valor={precio}
          onCambio={setPrecio}
          error={errorPrecio}
          entrada={{ inputMode: 'decimal', placeholder: '25.00' }}
        />
        <CampoTexto
          etiqueta="Prefijo de códigos"
          valor={prefijo}
          onCambio={(v) => {
            setPrefijo(v.toUpperCase())
            setPrefijoManual(true)
          }}
          ayuda={
            prefijoMostrado
              ? `Los códigos serán ${prefijoMostrado}-001, ${prefijoMostrado}-002…`
              : 'Se sugiere solo al escribir el nombre. Puede cambiarlo.'
          }
          entrada={{ maxLength: 5, className: 'w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 font-mono text-lg uppercase' }}
        />
        <div className="col-span-2">
          <CampoTexto etiqueta="Descripción (opcional)" valor={descripcion} onCambio={setDescripcion} multilinea />
        </div>
        {error && (
          <p role="alert" className="col-span-2 rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg font-semibold text-red-800">
            {error}
          </p>
        )}
        <div className="col-span-2 flex justify-end gap-3">
          <Link to="/disfraces" className={clasesBoton('secundario')}>
            Cancelar
          </Link>
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar disfraz'}
          </Boton>
        </div>
      </form>
    </section>
  )
}
