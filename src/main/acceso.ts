// Sesión de la app: primer uso, ingreso, salida y cierre por inactividad de la dueña.
import type Database from 'better-sqlite3'
import { INACTIVIDAD_DUENA_MS, NOMBRE_CUENTA, type Cuenta, type DatosPrimerUso, type EstadoAcceso } from '../shared/contrasenas'
import { registrarAuditoria } from './db/auditoria'
import * as usuarios from './db/usuarios'
import { ErrorDeNegocio } from './errores'
import { ControlInactividad, generarCodigoRecuperacion } from './logica/acceso'
import { establecerSesion, establecerVerificadorDuena, obtenerSesion, type Sesion } from './sesion'

/** Error de "no hay sesión": el renderer vuelve a la pantalla de ingreso. */
export class ErrorSinSesion extends ErrorDeNegocio {
  constructor(mensaje = 'Su sesión se cerró. Vuelva a ingresar.') {
    super(mensaje)
    this.name = 'ErrorSinSesion'
  }
}

// El renderer avisa la actividad con un latido limitado (cada 15 s como máximo), así que
// el main da un pequeño margen antes de cerrar por su cuenta.
const MARGEN_LATIDO_MS = 30_000

export interface OpcionesAcceso {
  /** Tiempo sin actividad tras el que se cierra la sesión de la dueña. */
  inactividadMs?: number
  /** Reloj monótono en milisegundos (inyectable en pruebas). */
  reloj?: () => number
}

export type ServicioAcceso = ReturnType<typeof crearServicioAcceso>

export function crearServicioAcceso(db: Database.Database, opciones: OpcionesAcceso = {}) {
  const inactividadMs = opciones.inactividadMs ?? INACTIVIDAD_DUENA_MS
  let codigoPendiente: string | null = null
  let control: ControlInactividad | null = null

  establecerVerificadorDuena((contrasena) => usuarios.verificarDuena(db, contrasena))

  function abrir(sesion: Sesion): void {
    establecerSesion(sesion)
    control = sesion.rol === 'admin' ? new ControlInactividad(inactividadMs + MARGEN_LATIDO_MS, opciones.reloj) : null
  }

  function cerrar(motivo: 'salida' | 'inactividad'): void {
    const sesion = obtenerSesion()
    if (sesion) {
      registrarAuditoria(db, sesion, motivo === 'salida' ? 'cierre_sesion' : 'sesion_cerrada_inactividad', 'usuarios', sesion.usuarioId, {})
    }
    establecerSesion(null)
    control = null
  }

  /** Sesión actual, cerrándola antes si la dueña pasó el tiempo sin actividad. */
  function vigente(): Sesion | null {
    if (control?.vencida()) cerrar('inactividad')
    return obtenerSesion()
  }

  function exigirSesion(): Sesion {
    const sesion = vigente()
    if (!sesion) throw new ErrorSinSesion()
    return sesion
  }

  return {
    inactividadMs,

    estado(): EstadoAcceso {
      const sesion = vigente()
      return {
        hayCuentas: usuarios.hayCuentas(db),
        sesion: sesion ? { cuenta: usuarios.cuentaDeSesion(sesion), nombre: NOMBRE_CUENTA[usuarios.cuentaDeSesion(sesion)] } : null,
        inactividadMs
      }
    },

    /** Exige una sesión abierta (nivel "sesion" del IPC). */
    exigirSesion,

    /** Primer uso: código de recuperación que se muestra una sola vez. */
    prepararCodigo(): string {
      if (usuarios.hayCuentas(db)) throw new ErrorDeNegocio('Las cuentas ya fueron creadas. Ingrese con su contraseña.')
      codigoPendiente = generarCodigoRecuperacion()
      return codigoPendiente
    },

    crearCuentas(datos: DatosPrimerUso): void {
      const sesion = usuarios.crearCuentas(db, datos, codigoPendiente)
      codigoPendiente = null
      abrir(sesion)
    },

    ingresar(cuenta: Cuenta, contrasena: string): void {
      if (obtenerSesion()) cerrar('salida')
      abrir(usuarios.iniciarSesion(db, cuenta, contrasena))
    },

    recuperar(codigo: string, nueva: string): string {
      const { sesion, codigoNuevo } = usuarios.recuperarDuena(db, codigo, nueva)
      abrir(sesion)
      return codigoNuevo
    },

    salir(): void {
      cerrar('salida')
    },

    /** Latido del renderer: hubo actividad de la usuaria. */
    actividad(): void {
      exigirSesion()
      control?.tocar()
    }
  }
}
