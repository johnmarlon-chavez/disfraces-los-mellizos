import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import { ProveedorAvisos } from './componentes/ui/Avisos'
import { ProveedorConfirmacion } from './componentes/ui/Confirmacion'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ProveedorAvisos>
        <ProveedorConfirmacion>
          <App />
        </ProveedorConfirmacion>
      </ProveedorAvisos>
    </HashRouter>
  </StrictMode>
)
