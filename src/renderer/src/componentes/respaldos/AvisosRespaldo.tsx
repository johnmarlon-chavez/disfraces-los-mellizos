import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatearFecha, formatearHora } from '../../../../shared/formato'
import { NOMBRE_NUBE, type AvisosRespaldo as Avisos } from '../../../../shared/respaldos'
import { llamar, mensajeDe } from '../../api'
import { useAvisos } from '../ui/Avisos'
import Boton from '../ui/Boton'

const fechaHora = (iso: string): string => `${formatearFecha(new Date(iso))} a las ${formatearHora(new Date(iso))}`

/** Avisos de respaldo en Inicio (solo la dueña). Una línea cada uno, y solo si hay algo que decir. */
export default function AvisosRespaldo(): React.JSX.Element | null {
  const avisos = useAvisos()
  const [a, setA] = useState<Avisos | null>(null)

  const cargar = useCallback(() => {
    window.api.respaldos.avisos().then((r) => r.ok && setA(r.datos))
  }, [])
  useEffect(() => cargar(), [cargar])

  if (!a) return null
  const lineas: React.JSX.Element[] = []
  const irA = (
    <Link to="/configuracion" className="ml-auto font-semibold whitespace-nowrap text-blue-800 underline">
      Ver respaldos
    </Link>
  )

  if (a.datosEnNube) {
    lineas.push(
      <p key="datos" role="alert" className="flex items-center gap-2 rounded-lg border-2 border-red-700 bg-red-50 px-4 py-2 text-lg text-red-900">
        ⚠ Los datos del programa están en una carpeta que se sincroniza con {NOMBRE_NUBE[a.datosEnNube]}. Pida ayuda a su técnico.
      </p>
    )
  }
  if (a.problema) {
    lineas.push(
      <p key="problema" role="alert" className="flex items-center gap-2 rounded-lg border-2 border-red-700 bg-red-50 px-4 py-2 text-lg text-red-900">
        <span>
          ⚠{' '}
          {a.problema === 'fallo'
            ? `El último respaldo falló: ${a.error}.`
            : `Hace más de 2 días que no se guarda un respaldo${a.ultimoOk ? ` (el último: ${fechaHora(a.ultimoOk)})` : ''}.`}
        </span>
        {irA}
      </p>
    )
  } else if (a.sinCarpetaNube) {
    lineas.push(
      <p key="nube" className="flex items-center gap-2 rounded-lg border-2 border-amber-600 bg-amber-50 px-4 py-2 text-lg">
        <span>Los respaldos solo se guardan en esta computadora. Elija una carpeta de Google Drive u OneDrive.</span>
        {irA}
      </p>
    )
  }
  if (a.recordatorioNube) {
    const archivo = a.recordatorioNube.archivo
    const confirmar = async (): Promise<void> => {
      try {
        await llamar(window.api.respaldos.confirmarNube(archivo))
        avisos.exito('¡Gracias! Sus respaldos están llegando a la nube.')
        cargar()
      } catch (e) {
        avisos.error(mensajeDe(e))
      }
    }
    lineas.push(
      <div key="recordatorio" role="region" aria-label="Revisar respaldo en el celular" className="flex items-center gap-3 rounded-lg border-2 border-blue-700 bg-blue-50 px-4 py-2 text-lg">
        <span className="min-w-0">
          📱 Revise en su celular (Google Drive u OneDrive) que llegó el archivo <strong className="break-all">{archivo}</strong>.
        </span>
        <Boton compacto variante="exito" onClick={() => void confirmar()} className="ml-auto">
          Sí, lo vi en mi celular
        </Boton>
      </div>
    )
  }
  if (lineas.length === 0) return null
  return (
    <div aria-label="Respaldos" className="flex flex-col gap-2">
      {lineas}
    </div>
  )
}
