import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AVISO_INACTIVIDAD_MS, type EstadoAcceso, type SesionInfo } from '../../../../shared/contrasenas'
import Boton from '../ui/Boton'
import Dialogo from '../ui/Dialogo'
import AsistentePrimerUso from './AsistentePrimerUso'
import PantallaIngreso from './PantallaIngreso'

interface ContextoSesion {
  sesion: SesionInfo
  esDuena: boolean
  salir: () => Promise<void>
}

const Contexto = createContext<ContextoSesion | null>(null)

export function useSesion(): ContextoSesion {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useSesion requiere ProveedorSesion')
  return valor
}

/** Evento que el preload emite cuando el main responde que no hay sesión. */
const EVENTO_SESION_CERRADA = 'disfraces:sesion-cerrada'

export type MotivoSalida = 'inactividad' | 'cerrada' | null

/**
 * Decide qué se muestra: el asistente de primer uso, la pantalla de ingreso o la app.
 * La app solo se monta con una sesión abierta; al cerrarla se desmonta todo (diálogos incluidos).
 */
export function ProveedorSesion({ children }: { children: ReactNode }): React.JSX.Element {
  const navegar = useNavigate()
  const [estado, setEstado] = useState<EstadoAcceso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [motivo, setMotivo] = useState<MotivoSalida>(null)
  const [ingresos, setIngresos] = useState(0)

  const cargar = useCallback((): Promise<void> => {
    return window.api.acceso.estado().then((r) => {
      if (r.ok) {
        setEstado(r.datos)
        setError(null)
      } else setError(r.error)
    })
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    const alCerrar = (): void => {
      setMotivo('cerrada')
      void cargar()
    }
    window.addEventListener(EVENTO_SESION_CERRADA, alCerrar)
    return () => window.removeEventListener(EVENTO_SESION_CERRADA, alCerrar)
  }, [cargar])

  const alEntrar = useCallback(async (): Promise<void> => {
    setMotivo(null)
    setIngresos((n) => n + 1)
    navegar('/', { replace: true })
    await cargar()
  }, [cargar, navegar])

  const salir = useCallback(async (): Promise<void> => {
    await window.api.acceso.salir()
    setMotivo(null)
    await cargar()
  }, [cargar])

  const porInactividad = useCallback(async (): Promise<void> => {
    await window.api.acceso.salir()
    setMotivo('inactividad')
    await cargar()
  }, [cargar])

  if (!estado) {
    return (
      <div className="flex h-screen items-center justify-center">
        {error ? (
          <p role="alert" className="text-lg text-red-800">
            {error}
          </p>
        ) : (
          <p className="text-lg">Cargando…</p>
        )}
      </div>
    )
  }
  if (!estado.hayCuentas) return <AsistentePrimerUso onListo={alEntrar} />
  if (!estado.sesion) return <PantallaIngreso motivo={motivo} onIngreso={alEntrar} />

  const esDuena = estado.sesion.cuenta === 'duena'
  return (
    <Contexto.Provider value={{ sesion: estado.sesion, esDuena, salir }}>
      {/* La key reinicia toda la app al cambiar de usuario. */}
      <div key={`${estado.sesion.cuenta}-${ingresos}`} className="contents">
        {children}
      </div>
      {esDuena && <VigilanteInactividad key={ingresos} limiteMs={estado.inactividadMs} onVencida={porInactividad} />}
    </Contexto.Provider>
  )
}

const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const
// El main solo necesita saber de la actividad de vez en cuando (tiene un margen de 30 s).
const LATIDO_MS = 15_000

/**
 * Cierra la sesión de la dueña tras `limiteMs` sin actividad, avisando antes con la opción
 * "Seguir en la sesión". Usa performance.now() (reloj monótono), no la hora del sistema.
 */
function VigilanteInactividad({ limiteMs, onVencida }: { limiteMs: number; onVencida: () => void }): React.JSX.Element | null {
  const ultima = useRef(0)
  const ultimoLatido = useRef(0)
  const avisando = useRef(false)
  const [restante, setRestante] = useState<number | null>(null)

  useEffect(() => {
    ultima.current = performance.now()
    ultimoLatido.current = ultima.current
    const aviso = Math.min(AVISO_INACTIVIDAD_MS, limiteMs / 2)
    const alActuar = (): void => {
      // Con el aviso en pantalla, solo el botón "Seguir en la sesión" la mantiene abierta.
      if (avisando.current) return
      ultima.current = performance.now()
      if (ultima.current - ultimoLatido.current >= LATIDO_MS) {
        ultimoLatido.current = ultima.current
        void window.api.acceso.actividad()
      }
    }
    for (const e of EVENTOS_ACTIVIDAD) window.addEventListener(e, alActuar, { capture: true, passive: true })
    const reloj = window.setInterval(() => {
      const pasado = performance.now() - ultima.current
      if (pasado >= limiteMs) {
        window.clearInterval(reloj)
        onVencida()
      } else if (pasado >= limiteMs - aviso) {
        avisando.current = true
        setRestante(Math.ceil((limiteMs - pasado) / 1000))
      }
    }, 250)
    return () => {
      for (const e of EVENTOS_ACTIVIDAD) window.removeEventListener(e, alActuar, { capture: true })
      window.clearInterval(reloj)
    }
  }, [limiteMs, onVencida])

  const seguir = useCallback((): void => {
    avisando.current = false
    ultima.current = performance.now()
    ultimoLatido.current = ultima.current
    void window.api.acceso.actividad()
    setRestante(null)
  }, [])

  if (restante === null) return null
  return (
    <Dialogo
      titulo="¿Sigue ahí?"
      onCerrar={seguir}
      pie={
        <div className="flex justify-end">
          <Boton onClick={seguir} autoFocus>
            Seguir en la sesión
          </Boton>
        </div>
      }
    >
      <p className="text-lg" role="alert">
        Por seguridad, la sesión de la dueña se cerrará en <strong>{restante} segundos</strong> porque no hubo actividad.
      </p>
    </Dialogo>
  )
}
