import { useEffect, useState } from 'react'
import type { Configuracion as DatosConfiguracion, InfoApp } from '../../../shared/ipc'
import { formatearSoles } from '../../../shared/formato'

interface Estado {
  config: DatosConfiguracion
  info: InfoApp
}

export default function Configuracion(): React.JSX.Element {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.all([window.api.config.obtener(), window.api.app.info()]).then(([config, info]) => {
      if (!vigente) return
      if (!config.ok) return setError(config.error)
      if (!info.ok) return setError(info.error)
      setEstado({ config: config.datos, info: info.datos })
    })
    return () => {
      vigente = false
    }
  }, [])

  return (
    <section>
      <h1 className="mb-6 text-3xl font-bold">Configuración</h1>

      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {error}
        </p>
      )}

      {!estado && !error && <p className="text-lg">Cargando…</p>}

      {estado && (
        <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-8 gap-y-4 rounded-lg bg-white p-6 text-lg shadow">
          <dt className="font-semibold">Nombre de la tienda</dt>
          <dd>{estado.config.nombreTienda}</dd>
          <dt className="font-semibold">Mora por día de retraso</dt>
          <dd>{formatearSoles(estado.config.moraPorDia)}</dd>
          <dt className="font-semibold">Días de margen para lavado</dt>
          <dd>{estado.config.diasMargenLavado}</dd>
          <dt className="font-semibold">Precio de alquiler</dt>
          <dd>{estado.config.precioPorDia ? 'Por día' : 'Por evento'}</dd>
          <dt className="font-semibold">Carpeta de datos</dt>
          <dd className="break-all">{estado.info.carpetaDatos}</dd>
          <dt className="font-semibold">Versión del programa</dt>
          <dd>{estado.info.version}</dd>
        </dl>
      )}
    </section>
  )
}
