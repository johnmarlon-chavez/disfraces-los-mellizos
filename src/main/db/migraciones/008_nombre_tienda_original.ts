import type { Migracion } from './index'

// Devuelve el nombre original ("Disfraces Los Mellizos") a una base que haya quedado con
// "Librería AB" por la versión anterior de la 007 (solo la base de desarrollo).
// Cambia el nombre únicamente si es exactamente "Librería AB": nunca pisa otro nombre.

export const migracion008: Migracion = {
  version: 8,
  nombre: 'nombre_tienda_original',
  aplicar(db) {
    db.prepare("UPDATE configuracion SET nombre_tienda = 'Disfraces Los Mellizos' WHERE nombre_tienda = 'Librería AB'").run()
  }
}
