/**
 * Contraseña de la dueña pedida en el momento para una acción reservada a ella,
 * sin cerrar la sesión de Trabajadores. Se verifica en el proceso main con bcrypt.
 */
export interface AutorizacionDuena {
  contrasena: string
}
