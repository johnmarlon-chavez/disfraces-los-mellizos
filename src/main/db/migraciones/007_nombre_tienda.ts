import type { Migracion } from './index'

// La tienda cambió de nombre: "Disfraces Los Mellizos" -> "Librería AB".
// Solo se actualiza si todavía tiene el nombre anterior (no pisa un nombre puesto a mano).

export const migracion007: Migracion = {
  version: 7,
  nombre: 'nombre_tienda',
  aplicar(db) {
    db.prepare("UPDATE configuracion SET nombre_tienda = 'Librería AB' WHERE nombre_tienda = 'Disfraces Los Mellizos'").run()
  }
}
