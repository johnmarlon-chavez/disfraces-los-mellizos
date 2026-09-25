import { describe, expect, it } from 'vitest'
import {
  cambioRequiereDuena,
  generarPrefijo,
  siguientesCodigos,
  validarCambioEstado,
  validarCodigo,
  validarCodigosNuevos,
  validarNombreModelo,
  validarPiezas,
  validarPrecio,
  validarTalla
} from '../../src/main/logica/disfraces'
import { ErrorDeNegocio } from '../../src/main/errores'
import { exigirDuena } from '../../src/main/sesion'

describe('generarPrefijo', () => {
  it('usa las 3 primeras letras del nombre, sin tildes', () => {
    expect(generarPrefijo('Spiderman', [])).toBe('SPI')
    expect(generarPrefijo('Hombre Araña', [])).toBe('HOM')
    expect(generarPrefijo('Ángel', [])).toBe('ANG')
    expect(generarPrefijo('León', [])).toBe('LEO')
  })

  it('cada modelo recibe un prefijo único: "Spiderman Negro" no repite SPI', () => {
    const spiderman = generarPrefijo('Spiderman', [])
    const negro = generarPrefijo('Spiderman Negro', [spiderman])
    expect(spiderman).toBe('SPI')
    expect(negro).toBe('SPN')
    expect(negro).not.toBe(spiderman)
  })

  it('si todas las combinaciones están usadas, agrega un número', () => {
    expect(generarPrefijo('Spiderman', ['SPI'])).toBe('SPI2')
    expect(generarPrefijo('Spiderman', ['SPI', 'SPI2'])).toBe('SPI3')
    expect(generarPrefijo('Spiderman Negro', ['SPI', 'SPN'])).toBe('SPI2')
  })

  it('compara prefijos sin importar mayúsculas', () => {
    expect(generarPrefijo('Spiderman', ['spi'])).toBe('SPI2')
  })

  it('prueba las iniciales de tres palabras', () => {
    expect(generarPrefijo('Hombre Araña Negro', ['HOM', 'HOA', 'HON'])).toBe('HAN')
  })

  it('una serie de modelos parecidos nunca repite prefijo', () => {
    const nombres = ['Spiderman', 'Spiderman Negro', 'Spiderman Rojo', 'Spiderman Negro', 'Spider Gwen', 'Spiderman']
    const usados: string[] = []
    for (const n of nombres) usados.push(generarPrefijo(n, usados))
    expect(new Set(usados).size).toBe(nombres.length)
  })

  it('nombres cortos o sin letras también reciben prefijo de 3 caracteres', () => {
    expect(generarPrefijo('Oz', [])).toBe('OZX')
    expect(generarPrefijo('¡!', [])).toBe('DIS')
  })
})

describe('siguientesCodigos', () => {
  it('empieza en 001 si no hay unidades', () => {
    expect(siguientesCodigos('ARA', [], 3)).toEqual(['ARA-001', 'ARA-002', 'ARA-003'])
  })

  it('continúa desde el número más alto, sin rellenar huecos', () => {
    expect(siguientesCodigos('ARA', ['ARA-001', 'ARA-003'], 2)).toEqual(['ARA-004', 'ARA-005'])
  })

  it('ignora códigos de otros prefijos', () => {
    expect(siguientesCodigos('SPI', ['SPN-007', 'SPI-002', 'SPI2-009'], 1)).toEqual(['SPI-003'])
  })

  it('pasa de 999 sin problema', () => {
    expect(siguientesCodigos('ARA', ['ARA-999'], 1)).toEqual(['ARA-1000'])
  })
})

describe('validaciones', () => {
  it('limpia espacios y rechaza textos vacíos', () => {
    expect(validarNombreModelo('  Bruja   del  Oeste ')).toBe('Bruja del Oeste')
    expect(() => validarNombreModelo('   ')).toThrow('Escriba el nombre del disfraz.')
  })

  it('el precio debe ser mayor que cero', () => {
    expect(validarPrecio(2500)).toBe(2500)
    expect(() => validarPrecio(0)).toThrow(ErrorDeNegocio)
    expect(() => validarPrecio(-100)).toThrow(ErrorDeNegocio)
    expect(() => validarPrecio(25.5)).toThrow(ErrorDeNegocio)
  })

  it('la talla se guarda en mayúsculas', () => {
    expect(validarTalla(' m ')).toBe('M')
    expect(() => validarTalla('')).toThrow('Escriba la talla.')
  })

  it('los códigos se normalizan y se validan', () => {
    expect(validarCodigo(' ara-005 ')).toBe('ARA-005')
    expect(() => validarCodigo('ARA 005')).toThrow(/no es válido/)
    expect(() => validarCodigo('ARA--5')).toThrow(/no es válido/)
  })

  it('no permite códigos repetidos en la misma lista', () => {
    expect(() => validarCodigosNuevos(['ARA-001', 'ara-001'])).toThrow('El código ARA-001 está repetido en la lista.')
    expect(() => validarCodigosNuevos([])).toThrow(ErrorDeNegocio)
  })

  it('las piezas necesitan nombre y costo válido', () => {
    expect(validarPiezas([{ nombre: ' Máscara ', costoReposicion: 0 }])).toEqual([
      { nombre: 'Máscara', costoReposicion: 0 }
    ])
    expect(() => validarPiezas([{ nombre: '', costoReposicion: 100 }])).toThrow(ErrorDeNegocio)
    expect(() => validarPiezas([{ nombre: 'Capa', costoReposicion: -1 }])).toThrow(ErrorDeNegocio)
  })
})

describe('cambios de estado físico', () => {
  it('permite los cambios del día a día', () => {
    expect(() => validarCambioEstado('ARA-001', 'disponible', 'lavanderia')).not.toThrow()
    expect(() => validarCambioEstado('ARA-001', 'lavanderia', 'disponible')).not.toThrow()
    expect(() => validarCambioEstado('ARA-001', 'reparacion', 'disponible')).not.toThrow()
    expect(() => validarCambioEstado('ARA-001', 'disponible', 'baja')).not.toThrow()
    expect(() => validarCambioEstado('ARA-001', 'baja', 'disponible')).not.toThrow()
  })

  it('una unidad de baja solo puede reactivarse como disponible', () => {
    expect(() => validarCambioEstado('ARA-001', 'baja', 'lavanderia')).toThrow(
      'ARA-001 está "De baja" y no puede pasar a "En lavandería".'
    )
  })

  it('avisa si ya está en ese estado', () => {
    expect(() => validarCambioEstado('ARA-001', 'lavanderia', 'lavanderia')).toThrow(/ya está/)
  })

  it('dar de baja y reactivar son acciones de la dueña', () => {
    expect(cambioRequiereDuena('disponible', 'baja')).toBe(true)
    expect(cambioRequiereDuena('baja', 'disponible')).toBe(true)
    expect(cambioRequiereDuena('disponible', 'lavanderia')).toBe(false)
  })
})

describe('exigirDuena', () => {
  it('rechaza a la cuenta Trabajadores con un mensaje claro', () => {
    expect(() => exigirDuena({ usuarioId: 2, rol: 'empleado' }, 'dar de baja una unidad')).toThrow(
      'Solo la dueña puede dar de baja una unidad.'
    )
  })

  it('permite a la dueña', () => {
    expect(() => exigirDuena({ usuarioId: 1, rol: 'admin' }, 'dar de baja una unidad')).not.toThrow()
  })

  it('mientras no exista el login (sesión null) se permite; la fase 7 activa la regla', () => {
    expect(() => exigirDuena(null, 'dar de baja una unidad')).not.toThrow()
  })
})
