// Carga datos de prueba en la base de DESARROLLO. Uso:
//   npm run seed            -> solo si la base está vacía
//   npm run seed:reiniciar  -> guarda la base actual como datos-anterior-<fecha>.db y carga de nuevo
// Nunca se ejecuta en la app instalada.
import { existsSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import type Database from 'better-sqlite3'
import type { Region } from '../shared/disfraces'
import { sumarDias } from '../shared/fechas'
import { hoyEnLima } from '../shared/formato'
import { abrirBaseDeDatos } from './db/conexion'
import { asignarUnidades, crearPedido } from './db/pedidos'
import { obtenerRutas } from './rutas'

interface ModeloSemilla {
  nombre: string
  categoria: string
  region: Region | null
  descripcion: string
  precio: number
  prefijo: string
  /** [talla, cantidad] */
  tallas: [string, number][]
  piezas: [string, number][]
}

const DANZAS = 'Danzas típicas'

const MODELOS: ModeloSemilla[] = [
  // Costa
  {
    nombre: 'Marinera norteña mujer',
    categoria: DANZAS,
    region: 'costa',
    descripcion: 'Vestido de falda amplia con bordados y pañuelo.',
    precio: 4000,
    prefijo: 'MAM',
    tallas: [['8', 3], ['10', 4], ['12', 4], ['14', 2], ['S', 2], ['M', 2]],
    piezas: [['Vestido', 12000], ['Pañuelo', 1000]]
  },
  {
    nombre: 'Marinera norteña varón',
    categoria: DANZAS,
    region: 'costa',
    descripcion: 'Terno con camisa blanca, sombrero de paja y pañuelo.',
    precio: 4000,
    prefijo: 'MAV',
    tallas: [['8', 3], ['10', 4], ['12', 4], ['14', 2], ['M', 2]],
    piezas: [['Saco', 6000], ['Pantalón', 4000], ['Sombrero', 2500], ['Pañuelo', 1000]]
  },
  {
    nombre: 'Festejo mujer',
    categoria: DANZAS,
    region: 'costa',
    descripcion: 'Blusa y falda de colores con vuelos.',
    precio: 3500,
    prefijo: 'FEM',
    tallas: [['6', 3], ['8', 4], ['10', 4], ['12', 3]],
    piezas: [['Blusa', 3000], ['Falda', 4000], ['Pañuelo', 800]]
  },
  {
    nombre: 'Festejo varón',
    categoria: DANZAS,
    region: 'costa',
    descripcion: 'Camisa y pantalón remangado con faja.',
    precio: 3500,
    prefijo: 'FEV',
    tallas: [['6', 3], ['8', 4], ['10', 4], ['12', 3]],
    piezas: [['Camisa', 3000], ['Pantalón', 3000], ['Faja', 1000]]
  },
  {
    nombre: 'Tondero mujer',
    categoria: DANZAS,
    region: 'costa',
    descripcion: 'Vestido amplio de colores vivos.',
    precio: 3500,
    prefijo: 'TOM',
    tallas: [['10', 3], ['12', 3], ['14', 2]],
    piezas: [['Vestido', 9000], ['Pañuelo', 800]]
  },
  // Sierra
  {
    nombre: 'Huaylas mujer',
    categoria: DANZAS,
    region: 'sierra',
    descripcion: 'Pollera, blusa bordada, lliclla y sombrero.',
    precio: 4500,
    prefijo: 'HUM',
    tallas: [['8', 6], ['10', 8], ['12', 8], ['14', 4], ['S', 2]],
    piezas: [['Pollera', 7000], ['Blusa', 4000], ['Lliclla', 3000], ['Sombrero', 3000]]
  },
  {
    nombre: 'Huaylas varón',
    categoria: DANZAS,
    region: 'sierra',
    descripcion: 'Pantalón negro, camisa blanca, chaleco y sombrero.',
    precio: 4500,
    prefijo: 'HUV',
    tallas: [['8', 6], ['10', 8], ['12', 8], ['14', 4]],
    piezas: [['Chaleco', 4000], ['Pantalón', 3500], ['Camisa', 3000], ['Sombrero', 3000]]
  },
  {
    nombre: 'Caporales mujer',
    categoria: DANZAS,
    region: 'sierra',
    descripcion: 'Vestido corto con blusa de mangas amplias y sombrero.',
    precio: 5000,
    prefijo: 'CAM',
    tallas: [['10', 4], ['12', 4], ['14', 4], ['S', 3], ['M', 3]],
    piezas: [['Vestido', 9000], ['Sombrero', 3000]]
  },
  {
    nombre: 'Caporales varón',
    categoria: DANZAS,
    region: 'sierra',
    descripcion: 'Traje bordado con botas y cascabeles.',
    precio: 5500,
    prefijo: 'CAV',
    tallas: [['10', 4], ['12', 4], ['14', 4], ['M', 3], ['L', 2]],
    piezas: [['Chaqueta', 8000], ['Pantalón', 5000], ['Cascabeles', 4000], ['Sombrero', 3000]]
  },
  {
    nombre: 'Diablada',
    categoria: DANZAS,
    region: 'sierra',
    descripcion: 'Traje con capa bordada y máscara de diablo.',
    precio: 6000,
    prefijo: 'DIA',
    tallas: [['12', 3], ['14', 3], ['M', 2], ['L', 2]],
    piezas: [['Traje', 10000], ['Capa', 6000], ['Máscara', 12000]]
  },
  // Selva
  {
    nombre: 'Pandilla mujer',
    categoria: DANZAS,
    region: 'selva',
    descripcion: 'Falda corta y blusa con estampados amazónicos.',
    precio: 3500,
    prefijo: 'PAM',
    tallas: [['8', 4], ['10', 6], ['12', 6], ['14', 3]],
    piezas: [['Blusa', 3000], ['Falda', 3500], ['Corona de plumas', 2000]]
  },
  {
    nombre: 'Pandilla varón',
    categoria: DANZAS,
    region: 'selva',
    descripcion: 'Camisa estampada, pantalón y sombrero.',
    precio: 3500,
    prefijo: 'PAV',
    tallas: [['8', 4], ['10', 6], ['12', 6], ['14', 3]],
    piezas: [['Camisa', 3000], ['Pantalón', 3000], ['Sombrero', 2000]]
  },
  {
    nombre: 'Danza de la anaconda',
    categoria: DANZAS,
    region: 'selva',
    descripcion: 'Traje de corteza con penacho y collares de semillas.',
    precio: 4000,
    prefijo: 'ANA',
    tallas: [['8', 3], ['10', 4], ['12', 4]],
    piezas: [['Traje', 5000], ['Penacho', 3000], ['Collares', 1500]]
  },
  // Personajes para actuaciones (sin región)
  {
    nombre: 'Hombre Araña',
    categoria: 'Personajes',
    region: null,
    descripcion: 'Traje completo rojo y azul con máscara.',
    precio: 3500,
    prefijo: 'ARA',
    tallas: [['4', 1], ['6', 2], ['8', 2], ['10', 1]],
    piezas: [['Traje', 6000], ['Máscara', 2000], ['Guantes', 1500]]
  },
  {
    nombre: 'Princesa',
    categoria: 'Personajes',
    region: null,
    descripcion: 'Vestido largo con corona.',
    precio: 3000,
    prefijo: 'PRI',
    tallas: [['4', 2], ['6', 2], ['8', 2]],
    piezas: [['Vestido', 5000], ['Corona', 1200]]
  },
  {
    nombre: 'Pirata',
    categoria: 'Personajes',
    region: null,
    descripcion: 'Camisa, chaleco, pañuelo, parche y sombrero.',
    precio: 3000,
    prefijo: 'PIR',
    tallas: [['6', 2], ['8', 2], ['10', 1], ['M', 1]],
    piezas: [['Camisa', 3000], ['Chaleco', 2500], ['Sombrero', 1500], ['Parche', 300]]
  }
]

// Datos ficticios (Trujillo).
const PERSONAS: [string, string, string, string, string][] = [
  ['dni', '40123456', 'María Quispe Huamán', '987654321', 'Av. España 1234, Trujillo'],
  ['dni', '41234567', 'José Ramírez Flores', '976543210', 'Jr. Pizarro 456, Trujillo'],
  ['dni', '42345678', 'Rosa Mendoza Torres', '965432109', 'Calle Los Pinos 789, La Esperanza'],
  ['dni', '43456789', 'Carlos Vargas Chávez', '044234567', 'Av. Larco 1020, Víctor Larco Herrera'],
  ['ce', '001234567', 'Ana Lucía Pérez Rojas', '943210987', 'Mz. B Lt. 5, El Porvenir']
]

// Dos colegios con nombres parecidos a propósito, para probar el aviso de duplicados.
const COLEGIOS: [string, string, string, string, string, string | null][] = [
  ['I.E. Los Girasoles', 'La Esperanza', 'Carmen Rojas Vega', '45678901', '949111222', null],
  ['IE Los Girasoles', 'El Porvenir', 'Julia Sánchez Mori', '46789012', '949333444', null],
  ['Colegio Santa Rosita', 'Trujillo', 'Patricia Díaz León', '47890123', '044345678', '20481234567'],
  ['I.E.P. Nuevo Amanecer', 'Víctor Larco Herrera', 'Rocío Castillo Paz', '48901234', '958555666', '20487654321']
]

function sembrar(db: Database.Database): void {
  const insModelo = db.prepare(
    'INSERT INTO modelos (nombre, categoria, region, descripcion, precio_alquiler, prefijo) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insUnidad = db.prepare('INSERT INTO unidades (modelo_id, codigo, talla, estado_fisico) VALUES (?, ?, ?, ?)')
  const insPieza = db.prepare('INSERT INTO piezas (unidad_id, nombre, costo_reposicion) VALUES (?, ?, ?)')
  const insPersona = db.prepare(
    "INSERT INTO clientes (tipo, tipo_documento, numero_documento, nombres, telefono, direccion) VALUES ('persona', ?, ?, ?, ?, ?)"
  )
  const insColegio = db.prepare(
    "INSERT INTO clientes (tipo, nombres, distrito, responsable, dni_responsable, telefono, ruc) VALUES ('colegio', ?, ?, ?, ?, ?, ?)"
  )

  db.transaction(() => {
    let n = 0
    for (const m of MODELOS) {
      const modeloId = insModelo.run(m.nombre, m.categoria, m.region, m.descripcion, m.precio, m.prefijo).lastInsertRowid
      let numero = 0
      for (const [talla, cantidad] of m.tallas) {
        for (let i = 0; i < cantidad; i++) {
          n++
          numero++
          // Algunas unidades en lavandería o reparación para ver esos estados en pantalla.
          const estado = n % 13 === 0 ? 'lavanderia' : n % 29 === 0 ? 'reparacion' : 'disponible'
          const codigo = `${m.prefijo}-${String(numero).padStart(3, '0')}`
          const unidadId = insUnidad.run(modeloId, codigo, talla, estado).lastInsertRowid
          for (const [nombre, costo] of m.piezas) insPieza.run(unidadId, nombre, costo)
        }
      }
    }
    for (const p of PERSONAS) insPersona.run(...p)
    for (const c of COLEGIOS) insColegio.run(...c)
  })()
  sembrarPedidos(db)
}

/** Dos reservas de ejemplo, con fechas relativas a hoy, creadas con la lógica real de pedidos. */
function sembrarPedidos(db: Database.Database): void {
  const hoy = hoyEnLima()
  const idCliente = (nombre: string): number =>
    (db.prepare('SELECT id FROM clientes WHERE nombres = ?').get(nombre) as { id: number }).id
  const idModelo = (prefijo: string): number =>
    (db.prepare('SELECT id FROM modelos WHERE prefijo = ?').get(prefijo) as { id: number }).id

  // Colegio: 10 Huaylas mujer talla 10 (hay 8) -> 2 por confeccionar
  const rangoColegio = { inicio: sumarDias(hoy, 12), fin: sumarDias(hoy, 14) }
  const huaylas = asignarUnidades(
    db,
    { modeloId: idModelo('HUM'), talla: '10', cantidad: 10, rango: rangoColegio, excluirAlquilerId: null, yaEnCarrito: [] },
    hoy
  )
  crearPedido(
    db,
    {
      clienteId: idCliente('I.E. Los Girasoles'),
      fechaSalida: rangoColegio.inicio,
      fechaDevolucionPactada: rangoColegio.fin,
      evento: 'Aniversario del colegio',
      gradoSeccion: '4.° A',
      observaciones: '',
      garantiaTipo: 'dni',
      garantiaMonto: 0,
      lineas: huaylas.asignadas.map((u) => ({ unidadId: u.unidadId, precioCobrado: 4000 })),
      pendientes: [
        {
          modeloId: idModelo('HUM'),
          talla: '10',
          cantidad: huaylas.faltan,
          fechaLimite: sumarDias(hoy, 5),
          precioCobrado: 4000,
          observaciones: ''
        }
      ],
      adelanto: { monto: 20000, medio: 'transferencia' }
    },
    null,
    hoy
  )

  // Persona: un Pirata para una actuación
  const rangoPersona = { inicio: sumarDias(hoy, 3), fin: sumarDias(hoy, 4) }
  const pirata = asignarUnidades(
    db,
    { modeloId: idModelo('PIR'), talla: 'M', cantidad: 1, rango: rangoPersona, excluirAlquilerId: null, yaEnCarrito: [] },
    hoy
  )
  crearPedido(
    db,
    {
      clienteId: idCliente('María Quispe Huamán'),
      fechaSalida: rangoPersona.inicio,
      fechaDevolucionPactada: rangoPersona.fin,
      evento: 'Otro',
      gradoSeccion: '',
      observaciones: 'Actuación de fin de bimestre',
      garantiaTipo: 'efectivo',
      garantiaMonto: 5000,
      lineas: pirata.asignadas.map((u) => ({ unidadId: u.unidadId, precioCobrado: u.precioSugerido })),
      pendientes: [],
      adelanto: { monto: 1500, medio: 'yape' }
    },
    null,
    hoy
  )
}

/** Guarda la base actual con otro nombre (no la borra) para empezar de cero. */
function apartarBaseActual(rutaBase: string): string | null {
  if (!existsSync(rutaBase)) return null
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const destino = join(rutaBase, '..', `datos-anterior-${sello}.db`)
  for (const sufijo of ['', '-wal', '-shm']) {
    if (existsSync(rutaBase + sufijo)) renameSync(rutaBase + sufijo, destino + sufijo)
  }
  return destino
}

app.whenReady().then(() => {
  const rutas = obtenerRutas()
  if (app.isPackaged || !basename(rutas.carpetaDatos).endsWith('-dev')) {
    console.error('El seed solo se usa con la base de desarrollo (carpeta SistemaDisfraces-dev).')
    app.exit(1)
    return
  }

  if (process.argv.includes('--reiniciar')) {
    const apartada = apartarBaseActual(rutas.baseDeDatos)
    if (apartada) console.log(`Base anterior guardada como ${apartada}`)
  }

  const db = abrirBaseDeDatos(rutas.baseDeDatos)
  try {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM modelos').get() as { total: number }
    if (total > 0) {
      console.log(`La base ya tiene datos (${rutas.baseDeDatos}). Use "npm run seed:reiniciar" para empezar de cero.`)
    } else {
      sembrar(db)
      console.log(`Datos de prueba cargados en ${rutas.baseDeDatos}`)
    }
    db.close()
    app.exit(0)
  } catch (error) {
    console.error(error)
    db.close()
    app.exit(1)
  }
})
