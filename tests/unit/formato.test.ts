import { describe, expect, it } from 'vitest'
import { formatearFecha, formatearSoles, hoyEnLima, solesACentimos } from '../../src/shared/formato'

describe('formatearSoles', () => {
  it.each([
    [0, 'S/ 0.00'],
    [5, 'S/ 0.05'],
    [2500, 'S/ 25.00'],
    [2550, 'S/ 25.50'],
    [125000, 'S/ 1,250.00'],
    [123456789, 'S/ 1,234,567.89'],
    [-500, '-S/ 5.00']
  ])('%i céntimos -> %s', (centimos, esperado) => {
    expect(formatearSoles(centimos)).toBe(esperado)
  })

  it('rechaza montos que no son céntimos enteros', () => {
    expect(() => formatearSoles(25.5)).toThrow()
  })
})

describe('solesACentimos', () => {
  it.each([
    ['25', 2500],
    ['25.5', 2550],
    ['25.50', 2550],
    ['0.05', 5],
    [' S/ 1,250.00 ', 125000],
    ['s/25', 2500]
  ])('"%s" -> %i', (texto, esperado) => {
    expect(solesACentimos(texto)).toBe(esperado)
  })

  it.each(['', 'abc', '-5', '25.505', '25,5', '25,50', '1,25', '1.2.3'])('"%s" no es válido', (texto) => {
    expect(solesACentimos(texto)).toBeNull()
  })

  it('no pierde céntimos por redondeo de punto flotante', () => {
    expect(solesACentimos('0.29')).toBe(29)
    expect(solesACentimos('1.15')).toBe(115)
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
