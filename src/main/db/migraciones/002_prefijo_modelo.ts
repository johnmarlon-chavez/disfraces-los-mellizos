import { generarPrefijo } from '../../logica/disfraces'
import type { Migracion } from './index'

// Cada modelo tiene un prefijo único para los códigos de sus unidades (ARA-001, ARA-002...).
// Para modelos existentes se toma el prefijo de sus códigos actuales; si no tienen unidades
// o el prefijo ya está usado por otro modelo, se genera uno nuevo a partir del nombre.

export const migracion002: Migracion = {
  version: 2,
  nombre: 'prefijo_modelo',
  aplicar(db) {
    db.exec('ALTER TABLE modelos ADD COLUMN prefijo TEXT')

    const modelos = db.prepare('SELECT id, nombre FROM modelos ORDER BY id').all() as { id: number; nombre: string }[]
    const primerCodigo = db.prepare('SELECT codigo FROM unidades WHERE modelo_id = ? ORDER BY id LIMIT 1')
    const guardar = db.prepare('UPDATE modelos SET prefijo = ? WHERE id = ?')
    const usados: string[] = []

    for (const m of modelos) {
      const fila = primerCodigo.get(m.id) as { codigo: string } | undefined
      const desdeCodigo = fila ? /^([A-Z0-9]+)-\d+$/i.exec(fila.codigo)?.[1]?.toUpperCase() : undefined
      const prefijo =
        desdeCodigo && !usados.includes(desdeCodigo) ? desdeCodigo : generarPrefijo(m.nombre, usados)
      usados.push(prefijo)
      guardar.run(prefijo, m.id)
    }

    db.exec('CREATE UNIQUE INDEX idx_modelos_prefijo ON modelos (prefijo COLLATE NOCASE)')
  }
}
