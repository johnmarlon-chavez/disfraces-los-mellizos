import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { leerMonto } from '../../../shared/formato'
import { llamar, mensajeDe } from '../api'
import Boton, { clasesBoton } from '../componentes/ui/Boton'
import { CampoTexto } from '../componentes/ui/Campos'
import { useAvisos } from '../componentes/ui/Avisos'

export default function NuevoDisfraz(): React.JSX.Element {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [precio, setPrecio] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    llamar(window.api.modelos.categorias()).then(setCategorias).catch(() => {})
  }, [])

  const guardar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const monto = leerMonto(precio)
    setErrorPrecio(monto.ok ? null : monto.error)
    if (!monto.ok) return
    setGuardando(true)
    try {
      const id = await llamar(
        window.api.modelos.crear({ nombre, categoria, descripcion, precioAlquiler: monto.centimos })
      )
      avisos.exito('Disfraz creado. Ahora agregue sus unidades por talla.')
      navegar(`/disfraces/${id}`, { replace: true })
    } catch (err) {
      setError(mensajeDe(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="max-w-2xl">
      <Link to="/disfraces" className="text-lg font-semibold text-blue-800 hover:underline">
        ← Volver a Disfraces
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold">Nuevo disfraz</h1>
      <form onSubmit={guardar} className="flex flex-col gap-5 rounded-lg bg-white p-6 shadow">
        <CampoTexto etiqueta="Nombre" valor={nombre} onCambio={setNombre} entrada={{ autoFocus: true, placeholder: 'Ej. Hombre Araña' }} />
        <CampoTexto
          etiqueta="Categoría"
          valor={categoria}
          onCambio={setCategoria}
          sugerencias={categorias}
          entrada={{ placeholder: 'Ej. Superhéroes' }}
        />
        <div className="max-w-xs">
          <CampoTexto
            etiqueta="Precio de alquiler"
            prefijo="S/"
            valor={precio}
            onCambio={setPrecio}
            error={errorPrecio}
            entrada={{ inputMode: 'decimal', placeholder: '25.00' }}
          />
        </div>
        <CampoTexto etiqueta="Descripción (opcional)" valor={descripcion} onCambio={setDescripcion} multilinea />
        {error && (
          <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-lg font-semibold text-red-800">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
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
