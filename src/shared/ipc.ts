// Contrato tipado entre el renderer y el proceso main.
// Cada canal declara sus argumentos y su resultado; el preload y los handlers
// del main usan estos mismos tipos, así que cualquier desajuste falla al compilar.
import type {
  ColegioParecido,
  DatosCliente,
  FichaCliente,
  ResumenCliente,
  TipoDocumento
} from './clientes'
import type {
  DatosModelo,
  DatosUnidad,
  EstadoFisico,
  FichaModelo,
  NuevasUnidades,
  NuevoModelo,
  PiezaDatos,
  ResumenModelo
} from './disfraces'
import type {
  BorradorPedido,
  ConflictoUnidad,
  FichaPedido,
  MedioPago,
  ModeloDisponible,
  OpcionAdelantoAlCancelar,
  PendienteAbierto,
  Rango,
  ResultadoAsignacion,
  ResumenPedido,
  UnidadParaPedido
} from './pedidos'

export interface InfoApp {
  nombreTienda: string
  version: string
  carpetaDatos: string
  esDesarrollo: boolean
}

/** por_unidad: la mora se cobra por cada unidad atrasada; por_pedido: una sola vez por pedido. */
export type ModoMora = 'por_unidad' | 'por_pedido'

/** Montos en céntimos. */
export interface Configuracion {
  moraPorDia: number
  modoMora: ModoMora
  diasMargenLavado: number
  precioPorDia: boolean
  carpetaRespaldo: string
  nombreTienda: string
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

export interface CanalesIpc {
  'app:info': { args: []; resultado: InfoApp }
  'config:obtener': { args: []; resultado: Configuracion }

  'modelos:listar': { args: []; resultado: ResumenModelo[] }
  'modelos:obtener': { args: [id: number]; resultado: FichaModelo }
  'modelos:categorias': { args: []; resultado: string[] }
  'modelos:crear': { args: [datos: NuevoModelo]; resultado: number }
  'modelos:sugerirPrefijo': { args: [nombre: string]; resultado: string }
  'modelos:cambiarPrefijo': { args: [id: number, prefijo: string]; resultado: void }
  'modelos:actualizar': { args: [id: number, datos: DatosModelo]; resultado: void }
  'modelos:cambiarPrecio': { args: [id: number, precio: number]; resultado: void }
  'modelos:darDeBaja': { args: [id: number]; resultado: void }
  'modelos:reactivar': { args: [id: number]; resultado: void }
  'modelos:elegirFoto': { args: [id: number]; resultado: boolean }
  'modelos:quitarFoto': { args: [id: number]; resultado: void }

  'unidades:sugerirCodigos': { args: [modeloId: number, cantidad: number]; resultado: string[] }
  'unidades:piezasSugeridas': { args: [modeloId: number]; resultado: PiezaDatos[] }
  'unidades:crear': { args: [datos: NuevasUnidades]; resultado: void }
  'unidades:actualizar': { args: [id: number, datos: DatosUnidad]; resultado: void }
  'unidades:cambiarEstado': { args: [id: number, estado: EstadoFisico]; resultado: void }

  'clientes:listar': { args: []; resultado: ResumenCliente[] }
  'clientes:obtener': { args: [id: number]; resultado: FichaCliente }
  'clientes:crear': { args: [datos: DatosCliente]; resultado: number }
  'clientes:actualizar': { args: [id: number, datos: DatosCliente]; resultado: void }
  'clientes:desactivar': { args: [id: number]; resultado: void }
  'clientes:reactivar': { args: [id: number]; resultado: void }
  'clientes:distritos': { args: []; resultado: string[] }
  'clientes:porDocumento': {
    args: [tipo: TipoDocumento, numero: string]
    resultado: { id: number; nombres: string } | null
  }
  'clientes:colegiosParecidos': {
    args: [nombre: string, distrito: string, excluirId: number | null]
    resultado: ColegioParecido[]
  }

  'pedidos:catalogo': { args: [rango: Rango, excluirAlquilerId: number | null]; resultado: ModeloDisponible[] }
  'pedidos:asignar': {
    args: [
      pedido: {
        modeloId: number
        talla: string
        cantidad: number
        rango: Rango
        excluirAlquilerId: number | null
        yaEnCarrito: number[]
      }
    ]
    resultado: ResultadoAsignacion
  }
  'pedidos:unidadesLibres': {
    args: [modeloId: number, talla: string, rango: Rango, excluirAlquilerId: number | null, yaEnCarrito: number[]]
    resultado: UnidadParaPedido[]
  }
  'pedidos:verificar': {
    args: [unidadIds: number[], rango: Rango, excluirAlquilerId: number | null]
    resultado: ConflictoUnidad[]
  }
  'pedidos:eventos': { args: []; resultado: string[] }
  'pedidos:crear': { args: [borrador: BorradorPedido]; resultado: number }
  'pedidos:actualizar': { args: [id: number, borrador: BorradorPedido]; resultado: void }
  'pedidos:obtener': { args: [id: number]; resultado: FichaPedido }
  'pedidos:listar': { args: []; resultado: ResumenPedido[] }
  'pedidos:registrarAdelanto': { args: [id: number, monto: number, medio: MedioPago]; resultado: void }
  'pedidos:cancelar': { args: [id: number, opcion: OpcionAdelantoAlCancelar]; resultado: void }

  'pendientes:cambiarEstado': { args: [id: number, estado: 'pendiente' | 'en_confeccion']; resultado: void }
  'pendientes:asignar': { args: [id: number, unidadIds: number[] | null]; resultado: string[] }
  'pendientes:abiertos': { args: [modeloId: number, talla: string]; resultado: PendienteAbierto[] }
}

export type NombreCanal = keyof CanalesIpc
export type ArgsDe<K extends NombreCanal> = CanalesIpc[K]['args']
export type ResultadoDe<K extends NombreCanal> = CanalesIpc[K]['resultado']

type Metodo<K extends NombreCanal> = (...args: ArgsDe<K>) => Promise<Resultado<ResultadoDe<K>>>

/** API expuesta en `window.api` por el preload. */
export interface ApiDisfraces {
  app: { info: Metodo<'app:info'> }
  config: { obtener: Metodo<'config:obtener'> }
  modelos: {
    listar: Metodo<'modelos:listar'>
    obtener: Metodo<'modelos:obtener'>
    categorias: Metodo<'modelos:categorias'>
    crear: Metodo<'modelos:crear'>
    sugerirPrefijo: Metodo<'modelos:sugerirPrefijo'>
    cambiarPrefijo: Metodo<'modelos:cambiarPrefijo'>
    actualizar: Metodo<'modelos:actualizar'>
    cambiarPrecio: Metodo<'modelos:cambiarPrecio'>
    darDeBaja: Metodo<'modelos:darDeBaja'>
    reactivar: Metodo<'modelos:reactivar'>
    elegirFoto: Metodo<'modelos:elegirFoto'>
    quitarFoto: Metodo<'modelos:quitarFoto'>
  }
  unidades: {
    sugerirCodigos: Metodo<'unidades:sugerirCodigos'>
    piezasSugeridas: Metodo<'unidades:piezasSugeridas'>
    crear: Metodo<'unidades:crear'>
    actualizar: Metodo<'unidades:actualizar'>
    cambiarEstado: Metodo<'unidades:cambiarEstado'>
  }
  clientes: {
    listar: Metodo<'clientes:listar'>
    obtener: Metodo<'clientes:obtener'>
    crear: Metodo<'clientes:crear'>
    actualizar: Metodo<'clientes:actualizar'>
    desactivar: Metodo<'clientes:desactivar'>
    reactivar: Metodo<'clientes:reactivar'>
    distritos: Metodo<'clientes:distritos'>
    porDocumento: Metodo<'clientes:porDocumento'>
    colegiosParecidos: Metodo<'clientes:colegiosParecidos'>
  }
  pedidos: {
    catalogo: Metodo<'pedidos:catalogo'>
    asignar: Metodo<'pedidos:asignar'>
    unidadesLibres: Metodo<'pedidos:unidadesLibres'>
    verificar: Metodo<'pedidos:verificar'>
    eventos: Metodo<'pedidos:eventos'>
    crear: Metodo<'pedidos:crear'>
    actualizar: Metodo<'pedidos:actualizar'>
    obtener: Metodo<'pedidos:obtener'>
    listar: Metodo<'pedidos:listar'>
    registrarAdelanto: Metodo<'pedidos:registrarAdelanto'>
    cancelar: Metodo<'pedidos:cancelar'>
  }
  pendientes: {
    cambiarEstado: Metodo<'pendientes:cambiarEstado'>
    asignar: Metodo<'pendientes:asignar'>
    abiertos: Metodo<'pendientes:abiertos'>
  }
}
