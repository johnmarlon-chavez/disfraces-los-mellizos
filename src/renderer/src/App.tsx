import { Navigate, Route, Routes } from 'react-router'
import Layout from './componentes/Layout'
import Inicio from './paginas/Inicio'
import Alquileres from './paginas/Alquileres'
import FichaPedido from './paginas/FichaPedido'
import PantallaDevolucion from './paginas/PantallaDevolucion'
import PantallaPedido from './paginas/PantallaPedido'
import Disfraces from './paginas/Disfraces'
import FichaDisfraz from './paginas/FichaDisfraz'
import NuevoDisfraz from './paginas/NuevoDisfraz'
import Clientes from './paginas/Clientes'
import FichaCliente from './paginas/FichaCliente'
import NuevoCliente from './paginas/NuevoCliente'
import Reportes from './paginas/Reportes'
import Configuracion from './paginas/Configuracion'

export default function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="alquileres" element={<Alquileres />} />
        <Route path="alquileres/nuevo" element={<PantallaPedido />} />
        <Route path="alquileres/:id" element={<FichaPedido />} />
        <Route path="alquileres/:id/editar" element={<PantallaPedido />} />
        <Route path="alquileres/:id/devolucion" element={<PantallaDevolucion />} />
        <Route path="disfraces" element={<Disfraces />} />
        <Route path="disfraces/nuevo" element={<NuevoDisfraz />} />
        <Route path="disfraces/:id" element={<FichaDisfraz />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/nuevo" element={<NuevoCliente />} />
        <Route path="clientes/:id" element={<FichaCliente />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
