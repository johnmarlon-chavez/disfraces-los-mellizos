import type { FiltroClientes } from '../../shared/clientes'
import type { FiltroModelos } from '../../shared/disfraces'

// Últimos filtros de cada lista, para restaurarlos al volver desde una ficha.
// Entrar desde el menú lateral muestra la lista sin filtros.

/** Estado de navegación que pide a la lista restaurar los últimos filtros. */
export const VOLVER_CON_FILTROS = { conservarFiltros: true }

interface MemoriaFiltros<T> {
  recordar: (filtro: T) => void
  inicial: (estadoNavegacion: unknown) => T
}

function crearMemoria<T>(vacio: T): MemoriaFiltros<T> {
  let ultimo = vacio
  return {
    recordar: (filtro) => {
      ultimo = filtro
    },
    inicial: (estado) => ((estado as { conservarFiltros?: boolean } | null)?.conservarFiltros ? ultimo : vacio)
  }
}

export const memoriaDisfraces = crearMemoria<FiltroModelos>({
  texto: '',
  talla: '',
  region: '',
  categoria: '',
  incluirBaja: false
})

export const memoriaClientes = crearMemoria<FiltroClientes>({ texto: '', tipo: '', incluirInactivos: false })
