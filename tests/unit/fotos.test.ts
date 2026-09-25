import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nombreFotoModelo, resolverRutaFoto, tamanoReducido } from '../../src/main/logica/fotos'
import { urlFoto } from '../../src/shared/disfraces'

const CARPETA = join('C:', 'Datos', 'fotos')

describe('resolverRutaFoto', () => {
  it('resuelve las fotos generadas por el sistema', () => {
    const nombre = nombreFotoModelo(3, 1700000000000)
    expect(nombre).toBe('modelo-3-1700000000000.jpg')
    expect(resolverRutaFoto(CARPETA, urlFoto(nombre))).toBe(join(CARPETA, nombre))
  })

  it.each([
    'fotos://archivo/..%2Fdatos.db',
    'fotos://archivo/../datos.db',
    'fotos://archivo/..%5C..%5Cdatos.db',
    'fotos://archivo/C%3A%5CWindows%5Cwin.ini',
    'fotos://otro/modelo-1-1.jpg',
    'file:///C:/Windows/win.ini',
    'fotos://archivo/modelo-1-1.png',
    'fotos://archivo/',
    'no es una url'
  ])('rechaza %s', (url) => {
    expect(resolverRutaFoto(CARPETA, url)).toBeNull()
  })
})

describe('tamanoReducido', () => {
  it('no cambia imágenes pequeñas', () => {
    expect(tamanoReducido(800, 600)).toBeNull()
    expect(tamanoReducido(1200, 1200)).toBeNull()
  })

  it('reduce el lado mayor a 1200 conservando la proporción', () => {
    expect(tamanoReducido(4000, 3000)).toEqual({ ancho: 1200, alto: 900 })
    expect(tamanoReducido(3000, 4000)).toEqual({ ancho: 900, alto: 1200 })
  })
})
