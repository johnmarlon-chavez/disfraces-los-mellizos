import { useEffect, useState } from 'react'

/** Al cerrar el programa, el main avisa que está guardando el respaldo: se cubre toda la ventana. */
export default function GuardandoRespaldo(): React.JSX.Element | null {
  const [guardando, setGuardando] = useState(false)
  useEffect(() => window.api.eventos.alGuardarRespaldo(() => setGuardando(true)), [])
  if (!guardando) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/90 p-4">
      <div role="status" className="rounded-xl bg-white p-8 text-center shadow-xl">
        <p className="text-2xl font-bold">Guardando respaldo…</p>
        <p className="mt-2 text-lg">El programa se cerrará solo. No apague la computadora.</p>
      </div>
    </div>
  )
}
