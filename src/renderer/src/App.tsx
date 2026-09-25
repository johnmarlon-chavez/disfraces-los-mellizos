import { Navigate, Route, Routes } from 'react-router'
import Layout from './componentes/Layout'
import Inicio from './paginas/Inicio'
import Alquileres from './paginas/Alquileres'
import Disfraces from './paginas/Disfraces'
import Clientes from './paginas/Clientes'
import Reportes from './paginas/Reportes'
import Configuracion from './paginas/Configuracion'

export default function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="alquileres" element={<Alquileres />} />
        <Route path="disfraces" element={<Disfraces />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
