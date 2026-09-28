// Contrato tipado entre el renderer y el proceso main.
// Cada canal declara sus argumentos y su resultado; el preload y los handlers
// del main usan estos mismos tipos, así que cualquier desajuste falla al compilar.
import type { AutorizacionDuena } from './autorizacion'
import type { Cuenta, DatosPrimerUso, EstadoAcceso, ResumenSoporte } from './contrasenas'
import type { DatosClaveSoporte, EstadoSoporte } from './soporte'
import type { AvisosRespaldo, EstadoRespaldos, Manifiesto, ResultadoRespaldo, VistaRestauracion } from './respaldos'
import type {
  CalendarioOcupacion,
  DatosInicio,
  DeudaInicio,
  FilaAgrupada,
  FilaConfeccion,
  FilaMasAlquilado,
  MoraRebajada,
  PedidoConDescuento,
  PedidoFuera,
  PedidoInicio,
  Periodo,
  ReporteIngresos,
  ReporteMedios
} from './reportes'
import type {
  DatosDevolucion,
  DatosEntrega,
  DatosLiquidacion,
  PrevisualizacionDevolucion,
  ResultadoDevolucion,
  ResultadoEntrega
} from './entregas'
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
  Region,
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

/** Lo que la dueña puede cambiar desde Configuración. */
export type DatosConfiguracion = Pick<Configuracion, 'moraPorDia' | 'modoMora' | 'diasMargenLavado' | 'precioPorDia'>

/** sesionCerrada: no hay sesión (o se cerró por inactividad); el renderer vuelve a la pantalla de ingreso. */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; sesionCerrada?: true }

export interface CanalesIpc {
  'app:info': { args: []; resultado: InfoApp }
  'config:obtener': { args: []; resultado: Configuracion }
  'config:actualizar': { args: [datos: DatosConfiguracion]; resultado: void }

  'acceso:estado': { args: []; resultado: EstadoAcceso }
  'acceso:prepararCodigo': { args: []; resultado: string }
  'acceso:crearCuentas': { args: [datos: DatosPrimerUso]; resultado: void }
  'acceso:ingresar': { args: [cuenta: Cuenta, contrasena: string]; resultado: void }
  /** Devuelve el código de recuperación nuevo (el usado deja de servir). */
  'acceso:recuperar': { args: [codigo: string, nuevaContrasena: string]; resultado: string }
  'acceso:salir': { args: []; resultado: void }
  'acceso:actividad': { args: []; resultado: void }
  'acceso:verificarDuena': { args: [contrasena: string]; resultado: void }
  'acceso:cambiarMiContrasena': { args: [actual: string, nueva: string]; resultado: void }
  'acceso:cambiarContrasenaTrabajadores': { args: [nueva: string]; resultado: void }
  'acceso:nuevoCodigo': { args: [contrasena: string]; resultado: string }
  'acceso:avisoVisto': { args: []; resultado: void }
  'acceso:resumenSoporte': { args: []; resultado: ResumenSoporte }

  // Respaldos: solo la dueña.
  'respaldos:estado': { args: []; resultado: EstadoRespaldos }
  'respaldos:avisos': { args: []; resultado: AvisosRespaldo }
  'respaldos:hacerAhora': { args: []; resultado: ResultadoRespaldo }
  /** Abre el diálogo para elegir la carpeta; la valida y la guarda. null si se canceló. */
  'respaldos:elegirCarpeta': { args: []; resultado: string | null }
  'respaldos:usarCarpeta': { args: [carpeta: string]; resultado: void }
  'respaldos:abrirCarpeta': { args: [cual: 'nube' | 'local' | 'datos']; resultado: void }
  'respaldos:probar': { args: [ruta: string]; resultado: Manifiesto }
  'respaldos:elegirArchivo': { args: []; resultado: string | null }
  'respaldos:vistaRestauracion': { args: [ruta: string]; resultado: VistaRestauracion }
  /** Restaura y reinicia el programa. */
  'respaldos:restaurar': { args: [ruta: string, contrasenaDuena: string]; resultado: void }
  'respaldos:confirmarNube': { args: [archivo: string]; resultado: void }

  // Solo existen en la ventana de soporte (--restablecer-duena, --definir-clave-soporte).
  'soporte:estado': { args: []; resultado: EstadoSoporte }
  'soporte:definirClave': { args: [datos: DatosClaveSoporte]; resultado: void }
  'soporte:restablecer': { args: [clave: string]; resultado: string }

  'modelos:listar': { args: []; resultado: ResumenModelo[] }
  'modelos:obtener': { args: [id: number]; resultado: FichaModelo }
  'modelos:categorias': { args: []; resultado: string[] }
  'modelos:crear': { args: [datos: NuevoModelo]; resultado: number }
  'modelos:sugerirPrefijo': { args: [nombre: string]; resultado: string }
  'modelos:cambiarPrefijo': { args: [id: number, prefijo: string]; resultado: void }
  'modelos:actualizar': { args: [id: number, datos: DatosModelo]; resultado: void }
  'modelos:cambiarPrecio': { args: [id: number, precio: number]; resultado: void }
  'modelos:darDeBaja': { args: [id: number, autorizacion: AutorizacionDuena | null]; resultado: void }
  'modelos:reactivar': { args: [id: number, autorizacion: AutorizacionDuena | null]; resultado: void }
  'modelos:elegirFoto': { args: [id: number]; resultado: boolean }
  'modelos:quitarFoto': { args: [id: number]; resultado: void }

  'unidades:sugerirCodigos': { args: [modeloId: number, cantidad: number]; resultado: string[] }
  'unidades:piezasSugeridas': { args: [modeloId: number]; resultado: PiezaDatos[] }
  'unidades:crear': { args: [datos: NuevasUnidades]; resultado: void }
  'unidades:actualizar': { args: [id: number, datos: DatosUnidad]; resultado: void }
  'unidades:cambiarEstado': {
    args: [id: number, estado: EstadoFisico, autorizacion: AutorizacionDuena | null]
    resultado: void
  }

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

  'entregas:entregar': {
    args: [id: number, datos: DatosEntrega, autorizacion: AutorizacionDuena | null]
    resultado: ResultadoEntrega
  }
  'entregas:previsualizar': { args: [id: number, datos: DatosDevolucion]; resultado: PrevisualizacionDevolucion }
  'entregas:devolver': { args: [id: number, datos: DatosDevolucion]; resultado: ResultadoDevolucion }
  'entregas:liquidar': { args: [id: number, datos: DatosLiquidacion]; resultado: void }
  'entregas:pagarDeuda': { args: [id: number, monto: number, medio: MedioPago]; resultado: void }
  'entregas:devolverDocumento': { args: [id: number]; resultado: void }
  'entregas:rebajarMora': {
    args: [cargoId: number, nuevoMonto: number, motivo: string, autorizacion: AutorizacionDuena | null]
    resultado: void
  }
  'entregas:cancelarLoQueFalta': { args: [id: number, autorizacion: AutorizacionDuena | null]; resultado: void }
  'entregas:liberar': { args: [id: number]; resultado: string[] }

  'inicio:datos': { args: []; resultado: DatosInicio }
  'unidades:liberar': { args: [ids: number[]]; resultado: string[] }

  'reportes:ingresos': { args: [periodo: Periodo]; resultado: ReporteIngresos }
  'reportes:medios': { args: [periodo: Periodo]; resultado: ReporteMedios }
  'reportes:fuera': { args: []; resultado: PedidoFuera[] }
  'reportes:vencidos': { args: []; resultado: { vencidas: PedidoInicio[]; noRecogidas: PedidoInicio[] } }
  'reportes:masAlquilados': { args: [periodo: Periodo, region: Region | '', evento: string]; resultado: FilaMasAlquilado[] }
  'reportes:agrupados': { args: [periodo: Periodo, por: 'colegio' | 'evento']; resultado: FilaAgrupada[] }
  'reportes:confeccion': { args: []; resultado: FilaConfeccion[] }
  'reportes:calendario': { args: [modeloId: number, mes: string]; resultado: CalendarioOcupacion }
  'reportes:descuentos': { args: [periodo: Periodo]; resultado: { pedidos: PedidoConDescuento[]; moras: MoraRebajada[] } }
  'reportes:deudas': { args: []; resultado: DeudaInicio[] }
}

export type NombreCanal = keyof CanalesIpc
export type ArgsDe<K extends NombreCanal> = CanalesIpc[K]['args']
export type ResultadoDe<K extends NombreCanal> = CanalesIpc[K]['resultado']

type Metodo<K extends NombreCanal> = (...args: ArgsDe<K>) => Promise<Resultado<ResultadoDe<K>>>

/** API expuesta en `window.api` por el preload. */
export interface ApiDisfraces {
  app: { info: Metodo<'app:info'> }
  config: { obtener: Metodo<'config:obtener'>; actualizar: Metodo<'config:actualizar'> }
  acceso: {
    estado: Metodo<'acceso:estado'>
    prepararCodigo: Metodo<'acceso:prepararCodigo'>
    crearCuentas: Metodo<'acceso:crearCuentas'>
    ingresar: Metodo<'acceso:ingresar'>
    recuperar: Metodo<'acceso:recuperar'>
    salir: Metodo<'acceso:salir'>
    actividad: Metodo<'acceso:actividad'>
    verificarDuena: Metodo<'acceso:verificarDuena'>
    cambiarMiContrasena: Metodo<'acceso:cambiarMiContrasena'>
    cambiarContrasenaTrabajadores: Metodo<'acceso:cambiarContrasenaTrabajadores'>
    nuevoCodigo: Metodo<'acceso:nuevoCodigo'>
    avisoVisto: Metodo<'acceso:avisoVisto'>
    resumenSoporte: Metodo<'acceso:resumenSoporte'>
  }
  respaldos: {
    estado: Metodo<'respaldos:estado'>
    avisos: Metodo<'respaldos:avisos'>
    hacerAhora: Metodo<'respaldos:hacerAhora'>
    elegirCarpeta: Metodo<'respaldos:elegirCarpeta'>
    usarCarpeta: Metodo<'respaldos:usarCarpeta'>
    abrirCarpeta: Metodo<'respaldos:abrirCarpeta'>
    probar: Metodo<'respaldos:probar'>
    elegirArchivo: Metodo<'respaldos:elegirArchivo'>
    vistaRestauracion: Metodo<'respaldos:vistaRestauracion'>
    restaurar: Metodo<'respaldos:restaurar'>
    confirmarNube: Metodo<'respaldos:confirmarNube'>
  }
  /** Avisos del main a la ventana. Devuelven la función para dejar de escuchar. */
  eventos: {
    /** Al cerrar el programa: se está guardando el respaldo. */
    alGuardarRespaldo: (fn: () => void) => () => void
  }
  soporte: {
    estado: Metodo<'soporte:estado'>
    definirClave: Metodo<'soporte:definirClave'>
    restablecer: Metodo<'soporte:restablecer'>
  }
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
  entregas: {
    entregar: Metodo<'entregas:entregar'>
    previsualizar: Metodo<'entregas:previsualizar'>
    devolver: Metodo<'entregas:devolver'>
    liquidar: Metodo<'entregas:liquidar'>
    pagarDeuda: Metodo<'entregas:pagarDeuda'>
    devolverDocumento: Metodo<'entregas:devolverDocumento'>
    rebajarMora: Metodo<'entregas:rebajarMora'>
    cancelarLoQueFalta: Metodo<'entregas:cancelarLoQueFalta'>
    liberar: Metodo<'entregas:liberar'>
  }
  inicio: {
    datos: Metodo<'inicio:datos'>
    liberarUnidades: Metodo<'unidades:liberar'>
  }
  reportes: {
    ingresos: Metodo<'reportes:ingresos'>
    medios: Metodo<'reportes:medios'>
    fuera: Metodo<'reportes:fuera'>
    vencidos: Metodo<'reportes:vencidos'>
    masAlquilados: Metodo<'reportes:masAlquilados'>
    agrupados: Metodo<'reportes:agrupados'>
    confeccion: Metodo<'reportes:confeccion'>
    calendario: Metodo<'reportes:calendario'>
    descuentos: Metodo<'reportes:descuentos'>
    deudas: Metodo<'reportes:deudas'>
  }
}
