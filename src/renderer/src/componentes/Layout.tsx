import { NavLink, Outlet } from 'react-router'
import { NOMBRE_TIENDA } from '../../../shared/constantes'
import { useSesion } from './acceso/Sesion'

const OPCIONES_MENU = [
  { ruta: '/', texto: 'Inicio' },
  { ruta: '/alquileres', texto: 'Alquileres' },
  { ruta: '/disfraces', texto: 'Disfraces' },
  { ruta: '/clientes', texto: 'Clientes' },
  { ruta: '/reportes', texto: 'Reportes', soloDuena: true },
  { ruta: '/configuracion', texto: 'Configuración', soloDuena: true }
]

export default function Layout(): React.JSX.Element {
  const { sesion, esDuena, salir } = useSesion()
  return (
    <div className="flex h-screen overflow-hidden">
      <nav aria-label="Menú principal" className="flex w-60 shrink-0 flex-col bg-slate-900 text-white">
        <div className="border-b border-slate-700 px-5 py-6">
          <p className="text-xl leading-tight font-bold">{NOMBRE_TIENDA}</p>
        </div>
        <ul className="flex flex-col gap-1 p-3">
          {OPCIONES_MENU.filter((o) => esDuena || !o.soloDuena).map((opcion) => (
            <li key={opcion.ruta}>
              <NavLink
                to={opcion.ruta}
                end={opcion.ruta === '/'}
                className={({ isActive }) =>
                  `block rounded-lg px-4 py-3 text-lg font-semibold ${
                    isActive ? 'bg-amber-400 text-slate-900' : 'text-white hover:bg-slate-700'
                  }`
                }
              >
                {opcion.texto}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-2 border-t border-slate-700 p-3">
          <NavLink
            to="/ayuda"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-base font-semibold ${isActive ? 'bg-amber-400 text-slate-900' : 'text-amber-300 underline hover:bg-slate-700'}`
            }
          >
            ¿Cómo se hace?
          </NavLink>
          <p className="px-2 pb-2 text-base text-slate-300">
            Sesión: <strong className="text-white">{sesion.nombre}</strong>
          </p>
          <button
            type="button"
            onClick={() => void salir()}
            className="w-full rounded-lg border-2 border-slate-500 px-3 py-2 text-base font-semibold text-white hover:bg-slate-700"
          >
            Cerrar sesión / Cambiar de usuario
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
