import { useEffect, useState } from 'react'
import type { Resultado } from '../../../../shared/ipc'
import { llamar, mensajeDe } from '../../api'

/** Carga un reporte y lo vuelve a cargar cuando cambia `clave` (período, filtros...). */
export function useReporte<T>(cargar: () => Promise<Resultado<T>>, clave: string): { datos: T | null; error: string | null } {
  const [estado, setEstado] = useState<{ clave: string; datos: T | null; error: string | null }>({ clave: '', datos: null, error: null })
  useEffect(() => {
    let vigente = true
    llamar(cargar())
      .then((datos) => vigente && setEstado({ clave, datos, error: null }))
      .catch((e) => vigente && setEstado({ clave, datos: null, error: mensajeDe(e) }))
    return () => {
      vigente = false
    }
    // `cargar` cambia en cada render; la consulta depende solo de `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return estado.clave === clave ? { datos: estado.datos, error: estado.error } : { datos: null, error: null }
}
