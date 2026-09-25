import { describe, expect, it } from 'vitest'
import { formatearFecha, formatearSoles, hoyEnLima, leerMonto } from '../../src/shared/formato'

describe('formatearSoles', () => {
  it.each([
    [0, 'S/ 0.00'],
    [5, 'S/ 0.05'],
    [2500, 'S/ 25.00'],
    [2550, 'S/ 25.50'],
    [125000, 'S/ 1250.00'],
    [123456789, 'S/ 1234567.89'],
    [-500, '-S/ 5.00']
  ])('%i céntimos -> %s', (centimos, esperado) => {
    expect(formatearSoles(centimos)).toBe(esperado)
  })

  it('lo que se muestra se puede volver a escribir y da el mismo monto', () => {
    for (const centimos of [0, 5, 2550, 125000, 123456789]) {
      expect(leerMonto(formatearSoles(centimos))).toEqual({ ok: true, centimos })
    }
  })

  it('rechaza montos que no son céntimos enteros', () => {
    expect(() => formatearSoles(25.5)).toThrow()
  })
})

describe('leerMonto', () => {
  it.each([
    ['25', 2500],
    ['25.5', 2550],
    ['25.50', 2550],
    ['25,5', 2550],
    ['25,50', 2550],
    ['0,05', 5],
    ['1250.00', 125000],
    ['1250,5', 125050],
    [' S/ 25,50 ', 2550],
    ['s/25', 2500],
    ['S/25.5', 2550]
  ])('"%s" -> %i céntimos', (texto, esperado) => {
    expect(leerMonto(texto)).toEqual({ ok: true, centimos: esperado })
  })

  it.each([
    ['1.250,00', /separador de miles/],
    ['1,250.00', /separador de miles/],
    ['25,555', /2 decimales/],
    ['25.505', /2 decimales/],
    ['1.2.3', /separador de miles/],
    ['1,2,3', /separador de miles/],
    ['', /Escriba un monto/],
    ['   ', /Escriba un monto/],
    ['S/', /Escriba un monto/],
    ['-5', /no puede ser negativo/],
    ['abc', /solo con números/],
    ['25 soles', /solo con números/],
    ['25.', /separador de miles/],
    [',50', /separador de miles/]
  ])('"%s" se rechaza con un mensaje claro', (texto, mensaje) => {
    const resultado = leerMonto(texto)
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(mensaje)
  })

  it('el mensaje de error repite lo que escribió la usuaria', () => {
    expect(leerMonto('1.250,00')).toEqual({
      ok: false,
      error: 'No se entiende el monto "1.250,00". Escríbalo sin separador de miles, por ejemplo 1250.50'
    })
  })

  it('no pierde céntimos por redondeo de punto flotante', () => {
    expect(leerMonto('0.29')).toEqual({ ok: true, centimos: 29 })
    expect(leerMonto('1,15')).toEqual({ ok: true, centimos: 115 })
  })
})

describe('fechas', () => {
  it('formatea fechas de calendario sin depender de la zona horaria', () => {
    expect(formatearFecha('2026-10-31')).toBe('31/10/2026')
    expect(formatearFecha('2026-01-05')).toBe('05/01/2026')
  })

  it('rechaza textos que no son fechas aaaa-mm-dd', () => {
    expect(() => formatearFecha('31/10/2026')).toThrow()
  })

  it('muestra los instantes según la hora de Lima (UTC-5)', () => {
    // 1 de noviembre 03:00 UTC = 31 de octubre 22:00 en Lima
    expect(formatearFecha(new Date('2026-11-01T03:00:00Z'))).toBe('31/10/2026')
    expect(formatearFecha(new Date('2026-11-01T05:00:00Z'))).toBe('01/11/2026')
  })

  it('hoyEnLima devuelve la fecha de Lima en formato aaaa-mm-dd', () => {
    expect(hoyEnLima(new Date('2026-01-01T04:59:00Z'))).toBe('2025-12-31')
    expect(hoyEnLima(new Date('2026-01-01T05:00:00Z'))).toBe('2026-01-01')
  })
})
