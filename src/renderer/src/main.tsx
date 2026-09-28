import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import PantallaSoporte from './componentes/acceso/PantallaSoporte'
import { ProveedorSesion } from './componentes/acceso/Sesion'
import { ProveedorAutorizacionDuena } from './componentes/ui/AutorizacionDuena'
import { ProveedorAvisos } from './componentes/ui/Avisos'
import { ProveedorConfirmacion } from './componentes/ui/Confirmacion'
import './index.css'

// Ventana de las herramientas de soporte (--restablecer-duena, --definir-clave-soporte):
// solo esa pantalla; el main no registra ningún otro canal en ese modo.
const soporte = /^#\/soporte\/(restablecer|definir-clave)$/.exec(window.location.hash)

createRoot(document.getElementById('root')!).render(
  soporte ? (
    <StrictMode>
      <PantallaSoporte modo={soporte[1] as 'restablecer' | 'definir-clave'} />
    </StrictMode>
  ) : (
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
)
