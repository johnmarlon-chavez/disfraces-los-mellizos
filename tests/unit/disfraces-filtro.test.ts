import { describe, expect, it } from 'vitest'
import {
  compararTallas,
  filtrarModelos,
  normalizarTalla,
  ordenarTallas,
  type FiltroModelos,
  type Region,
  type ResumenModelo
} from '../../src/shared/disfraces'

function modelo(
  id: number,
  nombre: string,
  categoria: string,
  unidades: [string, string, string?, boolean?][],
  region: Region | null = null
): ResumenModelo {
  return {
    id,
    nombre,
    categoria,
    region,
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
  { ...modelo(4, 'Pirata viejo', 'Personajes', [['PIR-001', '8']]), activo: false },
  modelo(5, 'Huaylas mujer', 'Danzas', [['HUA-001', '14']], 'sierra'),
  modelo(6, 'Marinera varón', 'Danzas', [['MAV-001', '12']], 'costa')
]

const SIN_FILTRO: FiltroModelos = { texto: '', categoria: '', region: '', talla: '', incluirBaja: false }
const nombres = (f: Partial<FiltroModelos>) => filtrarModelos(MODELOS, { ...SIN_FILTRO, ...f }).map((r) => r.modelo.nombre)

describe('filtrarModelos', () => {
  it('sin filtro muestra los activos en orden alfabético', () => {
    expect(nombres({})).toEqual(['Bruja', 'Hombre Araña', 'Huaylas mujer', 'Marinera varón', 'Vampiro'])
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

  it('filtra por región', () => {
    expect(nombres({ region: 'sierra' })).toEqual(['Huaylas mujer'])
    expect(nombres({ region: 'costa' })).toEqual(['Marinera varón'])
    expect(nombres({ region: 'selva' })).toEqual([])
  })

  it('"Sin región" muestra solo los que no tienen región', () => {
    expect(nombres({ region: 'ninguna' })).toEqual(['Bruja', 'Hombre Araña', 'Vampiro'])
  })

  it('el buscador también encuentra por región', () => {
    expect(nombres({ texto: 'sierra' })).toEqual(['Huaylas mujer'])
  })

  it('combina texto, categoría y talla', () => {
    expect(nombres({ texto: 'bruja', categoria: 'Halloween', talla: 'M' })).toEqual(['Bruja'])
    expect(nombres({ texto: 'vampiro', talla: '8' })).toEqual([])
  })
})

describe('tallas', () => {
  it('orden lógico, nunca alfabético: 4 < 6 < 8 < 10 < 12 < 14 < 16 < S < M < L < XL', () => {
    const desordenadas = ['XL', '10', 'M', '4', '16', 'S', '12', 'L', '8', '14', '6']
    expect(ordenarTallas(desordenadas)).toEqual(['4', '6', '8', '10', '12', '14', '16', 'S', 'M', 'L', 'XL'])
  })

  it('las tallas "Otra" van al final, en orden alfabético', () => {
    expect(ordenarTallas(['ÚNICA', 'M', 'XXL', '8', 'ADULTO'])).toEqual(['8', 'M', 'XXL', 'ADULTO', 'ÚNICA'])
  })

  it('no repite tallas que solo difieren en mayúsculas o espacios', () => {
    expect(ordenarTallas(['m', ' M ', 'M', '8', '8 '])).toEqual(['8', 'M'])
  })

  it('normaliza lo escrito en "Otra"', () => {
    expect(normalizarTalla('  xxl ')).toBe('XXL')
    expect(normalizarTalla(' talla   única ')).toBe('TALLA ÚNICA')
  })

  it('compararTallas sirve para ordenar cualquier lista', () => {
    expect(['10', '8', '12'].sort(compararTallas)).toEqual(['8', '10', '12'])
  })
})
