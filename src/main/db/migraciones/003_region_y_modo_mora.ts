import type { Migracion } from './index'

// - modelos.region: costa, sierra, selva o NULL (no aplica: personajes, superhéroes...).
// - configuracion.modo_mora: la mora se cobra por unidad (por defecto) o una vez por pedido.

export const migracion003: Migracion = {
  version: 3,
  nombre: 'region_y_modo_mora',
  aplicar(db) {
    db.exec(`
      ALTER TABLE modelos ADD COLUMN region TEXT CHECK (region IN ('costa', 'sierra', 'selva'));
      ALTER TABLE configuracion ADD COLUMN modo_mora TEXT NOT NULL DEFAULT 'por_unidad'
        CHECK (modo_mora IN ('por_unidad', 'por_pedido'));
    `)
  }
}
