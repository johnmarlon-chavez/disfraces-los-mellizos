import { describe, expect, it } from 'vitest'
import {
  esMismoColegio,
  palabrasClaveColegio,
  sonColegiosParecidos,
  validarCliente,
  validarDniResponsable,
  validarDocumento,
  validarRuc,
  validarTelefono
} from '../../src/main/logica/clientes'
import { ErrorDeNegocio } from '../../src/main/errores'
import {
  filtrarClientes,
  formatearTelefono,
  normalizarDistrito,
  type FiltroClientes,
  type ResumenCliente
} from '../../src/shared/clientes'

describe('documentos de personas', () => {
  it('DNI: 8 dígitos, sin espacios ni guiones', () => {
    expect(validarDocumento('dni', ' 40 123-456 ')).toBe('40123456')
    expect(() => validarDocumento('dni', '4012345')).toThrow('El DNI debe tener 8 dígitos.')
    expect(() => validarDocumento('dni', '4012345A')).toThrow('El DNI debe tener 8 dígitos.')
  })

  it('carné de extranjería y pasaporte: 6 a 12 letras o números, en mayúsculas', () => {
    expect(validarDocumento('ce', '001234567')).toBe('001234567')
    expect(validarDocumento('pasaporte', 'ab-12 3456')).toBe('AB123456')
    expect(() => validarDocumento('ce', '12345')).toThrow(/carné de extranjería debe tener de 6 a 12/)
    expect(() => validarDocumento('pasaporte', 'ABC#12345')).toThrow(/pasaporte debe tener de 6 a 12/)
  })

  it('pide el número si está vacío', () => {
    expect(() => validarDocumento('dni', '  ')).toThrow('Escriba el número de DNI.')
  })
})

describe('teléfono', () => {
  it('acepta celulares de 9 dígitos que empiezan con 9, con o sin +51 y espacios', () => {
    expect(validarTelefono('987 654 321')).toBe('987654321')
    expect(validarTelefono('+51 987-654-321')).toBe('987654321')
  })

  it('acepta fijos con código de ciudad o solo el número local', () => {
    expect(validarTelefono('044 234567')).toBe('044234567')
    expect(validarTelefono('(044) 23-4567')).toBe('044234567')
    expect(validarTelefono('01 2345678')).toBe('012345678')
    expect(validarTelefono('234567')).toBe('234567')
  })

  it('rechaza celulares incompletos con un mensaje claro', () => {
    expect(() => validarTelefono('98765432')).toThrow('El celular debe tener 9 dígitos y empezar con 9, por ejemplo 987 654 321.')
    expect(() => validarTelefono('9876543210')).toThrow(/celular debe tener 9 dígitos/)
  })

  it('rechaza números inválidos y vacíos', () => {
    expect(() => validarTelefono('12345')).toThrow(/no es válido/)
    expect(() => validarTelefono('')).toThrow('Escriba un teléfono de contacto.')
  })

  it('se muestra con espacios', () => {
    expect(formatearTelefono('987654321')).toBe('987 654 321')
    expect(formatearTelefono('044234567')).toBe('044 234567')
    expect(formatearTelefono('234567')).toBe('234567')
  })
})

describe('RUC y DNI de la responsable', () => {
  it('RUC opcional de 11 dígitos que empieza con 10, 15, 17 o 20', () => {
    expect(validarRuc('')).toBeNull()
    expect(validarRuc('20481234567')).toBe('20481234567')
    expect(() => validarRuc('30481234567')).toThrow(/empezar con 10, 15, 17 o 20/)
    expect(() => validarRuc('2048123456')).toThrow(/11 dígitos/)
  })

  it('DNI de la responsable obligatorio de 8 dígitos', () => {
    expect(validarDniResponsable('45678901')).toBe('45678901')
    expect(() => validarDniResponsable('')).toThrow('Escriba el DNI de la responsable.')
    expect(() => validarDniResponsable('4567890')).toThrow(/8 dígitos/)
  })
})

describe('validarCliente', () => {
  const colegio = {
    tipo: 'colegio' as const,
    nombres: '  I.E.  Los Girasoles ',
    distrito: 'la esperanza',
    responsable: 'Carmen Rojas',
    dniResponsable: '45678901',
    telefono: '949 111 222',
    ruc: '',
    direccion: '',
    observaciones: ''
  }

  it('normaliza un colegio: espacios, distrito conocido, teléfono', () => {
    expect(validarCliente(colegio)).toMatchObject({
      tipo: 'colegio',
      nombres: 'I.E. Los Girasoles',
      distrito: 'La Esperanza',
      telefono: '949111222',
      tipoDocumento: null,
      numeroDocumento: null,
      ruc: null
    })
  })

  it('un colegio necesita distrito, responsable y su DNI', () => {
    expect(() => validarCliente({ ...colegio, distrito: '' })).toThrow('Escriba el distrito del colegio.')
    expect(() => validarCliente({ ...colegio, responsable: '' })).toThrow(/nombre de la responsable/)
    expect(() => validarCliente({ ...colegio, dniResponsable: '' })).toThrow(/DNI de la responsable/)
  })

  it('una persona necesita documento, nombre y teléfono', () => {
    const persona = {
      tipo: 'persona' as const,
      tipoDocumento: 'dni' as const,
      numeroDocumento: '40123456',
      nombres: 'María Quispe',
      telefono: '987654321',
      direccion: '',
      observaciones: ''
    }
    expect(validarCliente(persona).numeroDocumento).toBe('40123456')
    expect(() => validarCliente({ ...persona, nombres: ' ' })).toThrow('Escriba los nombres y apellidos.')
    expect(() => validarCliente({ ...persona, telefono: '' })).toThrow(ErrorDeNegocio)
  })
})

describe('distritos', () => {
  it('reconoce los distritos de Trujillo aunque se escriban sin tildes o en minúsculas', () => {
    expect(normalizarDistrito('victor larco herrera')).toBe('Víctor Larco Herrera')
    expect(normalizarDistrito('  EL PORVENIR ')).toBe('El Porvenir')
  })

  it('permite otros distritos, en formato título', () => {
    expect(normalizarDistrito('chicama')).toBe('Chicama')
    expect(normalizarDistrito('san pedro de lloc')).toBe('San Pedro de Lloc')
  })
})

describe('colegios parecidos', () => {
  it('ignora "I.E.", "N.°", "Colegio", tildes y signos', () => {
    expect(palabrasClaveColegio('I.E. N.° 80001 San Juan')).toEqual(['80001', 'san', 'juan'])
    expect(palabrasClaveColegio('Colegio Nacional San Juan')).toEqual(['nacional', 'san', 'juan'])
  })

  it.each([
    ['I.E. Los Girasoles', 'IE Los Girasoles'],
    ['I.E. N.° 80001 San Juan', 'IE Nro 80001 San Juan'],
    ['Colegio Santa Rosa', 'Santa Rossa'],
    ['Institución Educativa Nuevo Amanecer', 'I.E.P. Nuevo Amanecer'],
    ['San Martín de Porres', 'I.E. San Martin de Porres del Norte']
  ])('"%s" y "%s" son parecidos', (a, b) => {
    expect(sonColegiosParecidos(a, b)).toBe(true)
  })

  it.each([
    ['I.E. N.° 80001 San Juan', 'I.E. N.° 80002 San Juan'],
    ['San Juan', 'San José'],
    ['Los Girasoles', 'Los Pinos'],
    ['I.E.', 'Colegio']
  ])('"%s" y "%s" NO son parecidos', (a, b) => {
    expect(sonColegiosParecidos(a, b)).toBe(false)
  })

  it('mismo colegio = mismas palabras clave y mismo distrito', () => {
    expect(esMismoColegio({ nombres: 'I.E. Los Girasoles', distrito: 'La Esperanza' }, { nombres: 'IE Los Girasoles', distrito: 'la esperanza' })).toBe(true)
    expect(esMismoColegio({ nombres: 'I.E. Los Girasoles', distrito: 'La Esperanza' }, { nombres: 'IE Los Girasoles', distrito: 'El Porvenir' })).toBe(false)
  })
})

describe('filtrarClientes', () => {
  function cliente(parcial: Partial<ResumenCliente>): ResumenCliente {
    return {
      id: 1,
      tipo: 'persona',
      tipoDocumento: 'dni',
      numeroDocumento: '40123456',
      nombres: 'María Quispe',
      responsable: '',
      dniResponsable: null,
      distrito: '',
      ruc: null,
      telefono: '987654321',
      activo: true,
      conAntecedentes: false,
      ...parcial
    }
  }
  const CLIENTES = [
    cliente({ id: 1 }),
    cliente({
      id: 2,
      tipo: 'colegio',
      tipoDocumento: null,
      numeroDocumento: null,
      nombres: 'I.E. Los Girasoles',
      responsable: 'Carmen Rojas',
      dniResponsable: '45678901',
      distrito: 'La Esperanza',
      ruc: '20481234567',
      telefono: '949111222'
    }),
    cliente({ id: 3, nombres: 'José Ramírez', numeroDocumento: '41234567', telefono: '976543210', activo: false })
  ]
  const VACIO: FiltroClientes = { texto: '', tipo: '', incluirInactivos: false }
  const buscar = (f: Partial<FiltroClientes>) => filtrarClientes(CLIENTES, { ...VACIO, ...f }).map((c) => c.id)

  it('busca por DNI, responsable, su DNI, distrito, RUC y teléfono (con espacios)', () => {
    expect(buscar({ texto: '40123456' })).toEqual([1])
    expect(buscar({ texto: 'carmen' })).toEqual([2])
    expect(buscar({ texto: '45678901' })).toEqual([2])
    expect(buscar({ texto: 'esperanza' })).toEqual([2])
    expect(buscar({ texto: '2048123' })).toEqual([2])
    expect(buscar({ texto: '949 111' })).toEqual([2])
  })

  it('filtra por tipo y oculta los desactivados salvo que se pidan', () => {
    expect(buscar({ tipo: 'colegio' })).toEqual([2])
    expect(buscar({ tipo: 'persona' })).toEqual([1])
    expect(buscar({ incluirInactivos: true, tipo: 'persona' })).toEqual([3, 1])
  })
})
