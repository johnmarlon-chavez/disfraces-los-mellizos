// Contrato tipado entre el renderer y el proceso main.
// Cada canal declara sus argumentos y su resultado; el preload y los handlers
// del main usan estos mismos tipos, así que cualquier desajuste falla al compilar.

export interface InfoApp {
  nombreTienda: string
  version: string
  carpetaDatos: string
  esDesarrollo: boolean
}

/** Montos en céntimos. */
export interface Configuracion {
  moraPorDia: number
  diasMargenLavado: number
  precioPorDia: boolean
  carpetaRespaldo: string
  nombreTienda: string
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

export interface CanalesIpc {
  'app:info': { args: []; resultado: InfoApp }
  'config:obtener': { args: []; resultado: Configuracion }
}

export type NombreCanal = keyof CanalesIpc
export type ArgsDe<K extends NombreCanal> = CanalesIpc[K]['args']
export type ResultadoDe<K extends NombreCanal> = CanalesIpc[K]['resultado']

/** API expuesta en `window.api` por el preload. */
export interface ApiDisfraces {
  app: {
    info(): Promise<Resultado<InfoApp>>
  }
  config: {
    obtener(): Promise<Resultado<Configuracion>>
  }
}
