import { describe, expect, it } from 'vitest'
import { filtrarModelos, ordenarTallas, type FiltroModelos, type ResumenModelo } from '../../src/shared/disfraces'

function modelo(id: number, nombre: string, categoria: string, unidades: [string, string, string?, boolean?][]): ResumenModelo {
  return {
    id,
    nombre,
    categoria,
    precioAlquiler: 2500,
    foto: null,
    activo: true,
    unidades: unidades.map(([codigo, talla, estado = 'disponible', alquilada = false]) => ({
      codigo,
      talla,
      estadoFisico: estado as ResumenModelo['unidades'][number]['estadoFisico'],
      alquilada
    }))
  }
}

const MODELOS: ResumenModelo[] = [
  modelo(1, 'Hombre Araña', 'Superhéroes', [
    ['ARA-001', '6'],
    ['ARA-002', '8'],
    ['ARA-003', '8', 'lavanderia'],
    ['ARA-004', '8', 'disponible', true],
    ['ARA-005', '10', 'baja']
  ]),
  modelo(2, 'Bruja', 'Halloween', [
    ['BRU-001', 'M'],
    ['BRU-002', '8', 'reparacion']
  ]),
  modelo(3, 'Vampiro', 'Halloween', [['VAM-001', 'L']]),
  { ...modelo(4, 'Pirata viejo', 'Personajes', [['PIR-001', '8']]), activo: false }
]

const SIN_FILTRO: FiltroModelos = { texto: '', categoria: '', talla: '', incluirBaja: false }
const nombres = (f: Partial<FiltroModelos>) => filtrarModelos(MODELOS, { ...SIN_FILTRO, ...f }).map((r) => r.modelo.nombre)

describe('filtrarModelos', () => {
  it('sin filtro muestra los activos en orden alfabético', () => {
    expect(nombres({})).toEqual(['Bruja', 'Hombre Araña', 'Vampiro'])
  })

  it('busca sin importar tildes ni mayúsculas', () => {
    expect(nombres({ texto: 'arana' })).toEqual(['Hombre Araña'])
    expect(nombres({ texto: 'SUPERHEROES' })).toEqual(['Hombre Araña'])
  })

  it('busca por código de unidad', () => {
    expect(nombres({ texto: 'bru-002' })).toEqual(['Bruja'])
  })

  it('todas las palabras deben coincidir', () => {
    expect(nombres({ texto: 'hombre halloween' })).toEqual([])
  })

  it('filtra por categoría', () => {
    expect(nombres({ categoria: 'Halloween' })).toEqual(['Bruja', 'Vampiro'])
  })

  it('"¿tienes este disfraz en talla 8?": solo modelos con esa talla, contando solo esa talla', () => {
    const r = filtrarModelos(MODELOS, { ...SIN_FILTRO, talla: '8' })
    expect(r.map((x) => [x.modelo.nombre, x.disponibles, x.total])).toEqual([
      ['Bruja', 0, 1], // la única talla 8 está en reparación
      ['Hombre Araña', 1, 3] // una disponible, una en lavandería, una alquilada
    ])
  })

  it('la talla no distingue mayúsculas', () => {
    expect(nombres({ talla: 'm' })).toEqual(['Bruja'])
  })

  it('las unidades de baja no cuentan, ni para la talla', () => {
    expect(nombres({ talla: '10' })).toEqual([])
    const [arana] = filtrarModelos(MODELOS, { ...SIN_FILTRO, texto: 'arana' })
    expect(arana.total).toBe(4)
  })

  it('una unidad alquilada ahora no cuenta como disponible', () => {
    const [arana] = filtrarModelos(MODELOS, { ...SIN_FILTRO, texto: 'arana' })
    expect(arana.disponibles).toBe(2)
  })

  it('los modelos de baja aparecen solo si se pide', () => {
    expect(nombres({ incluirBaja: true })).toContain('Pirata viejo')
  })

  it('combina texto, categoría y talla', () => {
    expect(nombres({ texto: 'bruja', categoria: 'Halloween', talla: 'M' })).toEqual(['Bruja'])
    expect(nombres({ texto: 'vampiro', talla: '8' })).toEqual([])
  })
})

describe('ordenarTallas', () => {
  it('números en orden numérico, luego letras en orden de talla, sin repetir', () => {
    expect(ordenarTallas(['M', '10', '8', 's', '2', 'XL', 'Única', '8', 'm', 'L'])).toEqual([
      '2',
      '8',
      '10',
      's',
      'M',
      'L',
      'XL',
      'Única'
    ])
  })
})
