import type { Migracion } from './index'

// Sin efecto a propósito. Esta migración cambiaba el nombre de la tienda a "Librería AB" por un
// error de pedido que se deshizo enseguida (ver 008). Solo llegó a correr en la base de
// desarrollo, que ya pasó por la 008; la app todavía no estaba instalada en la laptop de la dueña.
// Se vació para que ninguna base nueva reciba ese nombre, ni siquiera de paso. Se conserva el
// número 7 para no alterar la numeración de las migraciones.

export const migracion007: Migracion = {
  version: 7,
  nombre: 'nombre_tienda',
  aplicar() {}
}
