import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import PantallaSoporte, { type ModoSoporte } from './componentes/acceso/PantallaSoporte'
import GuardandoRespaldo from './componentes/respaldos/GuardandoRespaldo'
import GuiaDeUso from './guia/GuiaDeUso'
import { ProveedorSesion } from './componentes/acceso/Sesion'
import { ProveedorAutorizacionDuena } from './componentes/ui/AutorizacionDuena'
import { ProveedorAvisos } from './componentes/ui/Avisos'
import { ProveedorConfirmacion } from './componentes/ui/Confirmacion'
import './index.css'

// Ventana de las herramientas de soporte (--restablecer-duena, --definir-clave-soporte):
// solo esa pantalla; el main no registra ningún otro canal en ese modo.
const soporte = /^#\/soporte\/(restablecer|definir-clave|version-nueva)$/.exec(window.location.hash)

// Versión para imprimir de la guía de uso (la usa npm run guia:pdf; no necesita la API).
const impresion = window.location.hash === '#/guia-impresion'

createRoot(document.getElementById('root')!).render(
  impresion ? (
    <StrictMode>
      <main className="guia-impresion bg-slate-100 p-8">
        <GuiaDeUso impresion />
      </main>
    </StrictMode>
  ) : soporte ? (
    <StrictMode>
      <PantallaSoporte modo={soporte[1] as ModoSoporte} />
    </StrictMode>
  ) : (
    <StrictMode>
      <GuardandoRespaldo />
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
