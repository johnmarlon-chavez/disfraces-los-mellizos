import { NavLink, Outlet } from 'react-router'
import { NOMBRE_TIENDA } from '../../../shared/constantes'

const OPCIONES_MENU = [
  { ruta: '/', texto: 'Inicio' },
  { ruta: '/alquileres', texto: 'Alquileres' },
  { ruta: '/disfraces', texto: 'Disfraces' },
  { ruta: '/clientes', texto: 'Clientes' },
  { ruta: '/reportes', texto: 'Reportes' },
  { ruta: '/configuracion', texto: 'Configuración' }
]

export default function Layout(): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden">
      <nav aria-label="Menú principal" className="flex w-60 shrink-0 flex-col bg-slate-900 text-white">
        <div className="border-b border-slate-700 px-5 py-6">
          <p className="text-xl leading-tight font-bold">{NOMBRE_TIENDA}</p>
        </div>
        <ul className="flex flex-col gap-1 p-3">
          {OPCIONES_MENU.map((opcion) => (
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
      </nav>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
