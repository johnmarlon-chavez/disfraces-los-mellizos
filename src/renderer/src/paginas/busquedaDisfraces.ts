import type { FiltroModelos } from '../../../shared/disfraces'

// Últimos filtros de la lista de disfraces, para restaurarlos al volver desde una ficha.
// Entrar desde el menú lateral muestra la lista sin filtros.

export const FILTRO_VACIO: FiltroModelos = { texto: '', talla: '', categoria: '', incluirBaja: false }

/** Estado de navegación que pide a la lista restaurar los últimos filtros. */
export const VOLVER_CON_FILTROS = { conservarFiltros: true }

let ultimo: FiltroModelos = FILTRO_VACIO

export function recordarFiltro(filtro: FiltroModelos): void {
  ultimo = filtro
}

export function filtroInicial(estadoNavegacion: unknown): FiltroModelos {
  const conservar = (estadoNavegacion as { conservarFiltros?: boolean } | null)?.conservarFiltros
  return conservar ? ultimo : FILTRO_VACIO
}
