import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import { ProveedorSesion } from './componentes/acceso/Sesion'
import { ProveedorAutorizacionDuena } from './componentes/ui/AutorizacionDuena'
import { ProveedorAvisos } from './componentes/ui/Avisos'
import { ProveedorConfirmacion } from './componentes/ui/Confirmacion'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ProveedorAvisos>
        {/* Sin sesión no se monta nada de lo de abajo: al cerrarla se cierran también los diálogos. */}
        <ProveedorSesion>
          <ProveedorConfirmacion>
            <ProveedorAutorizacionDuena>
              <App />
            </ProveedorAutorizacionDuena>
          </ProveedorConfirmacion>
        </ProveedorSesion>
      </ProveedorAvisos>
    </HashRouter>
  </StrictMode>
)
