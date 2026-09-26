import type { Migracion } from './index'

// Se vuelve al nombre original de la tienda: "Librería AB" -> "Disfraces Los Mellizos"
// (la migración 007 lo había cambiado). Solo si todavía tiene el nombre de la 007.

export const migracion008: Migracion = {
  version: 8,
  nombre: 'nombre_tienda_original',
  aplicar(db) {
    db.prepare("UPDATE configuracion SET nombre_tienda = 'Disfraces Los Mellizos' WHERE nombre_tienda = 'Librería AB'").run()
  }
}
