import { mismaTalla, normalizarTalla, type EstadoFisico } from '../../../../shared/disfraces'
import type { FichaPedido, UnidadParaPedido } from '../../../../shared/pedidos'

export interface LineaCarrito {
  unidadId: number
  codigo: string
  modeloId: number
  modeloNombre: string
  talla: string
  estadoFisico: EstadoFisico
  precioCobrado: number
}

export interface PendienteCarrito {
  clave: number
  id?: number
  modeloId: number
  modeloNombre: string
  talla: string
  cantidad: number
  cantidadAsignada: number
  fechaLimite: string
  precioCobrado: number
  observaciones: string
}

export interface GrupoCarrito {
  clave: string
  modeloId: number
  modeloNombre: string
  talla: string
  lineas: LineaCarrito[]
}

let siguienteClave = 1
export const nuevaClave = (): number => siguienteClave++

export function lineaDe(u: UnidadParaPedido): LineaCarrito {
  return {
    unidadId: u.unidadId,
    codigo: u.codigo,
    modeloId: u.modeloId,
    modeloNombre: u.modeloNombre,
    talla: normalizarTalla(u.talla),
    estadoFisico: u.estadoFisico,
    precioCobrado: u.precioSugerido
  }
}

/** Agrupa por modelo y talla, en el orden en que se agregaron. */
export function agrupar(lineas: LineaCarrito[]): GrupoCarrito[] {
  const grupos: GrupoCarrito[] = []
  for (const l of lineas) {
    let g = grupos.find((x) => x.modeloId === l.modeloId && mismaTalla(x.talla, l.talla))
    if (!g) {
      g = { clave: `${l.modeloId}-${normalizarTalla(l.talla)}`, modeloId: l.modeloId, modeloNombre: l.modeloNombre, talla: l.talla, lineas: [] }
      grupos.push(g)
    }
    g.lineas.push(l)
  }
  for (const g of grupos) g.lineas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))
  return grupos
}

export function carritoDesdeFicha(f: FichaPedido): { lineas: LineaCarrito[]; pendientes: PendienteCarrito[] } {
  return {
    lineas: f.lineas.map((l) => ({
      unidadId: l.unidadId,
      codigo: l.codigo,
      modeloId: l.modeloId,
      modeloNombre: l.modeloNombre,
      talla: l.talla,
      estadoFisico: l.estadoFisico,
      precioCobrado: l.precioCobrado
    })),
    pendientes: f.pendientes.map((p) => ({
      clave: nuevaClave(),
      id: p.id,
      modeloId: p.modeloId,
      modeloNombre: p.modeloNombre,
      talla: p.talla,
      cantidad: p.cantidad,
      cantidadAsignada: p.cantidadAsignada,
      fechaLimite: p.fechaLimite,
      precioCobrado: p.precioCobrado,
      observaciones: p.observaciones
    }))
  }
}
