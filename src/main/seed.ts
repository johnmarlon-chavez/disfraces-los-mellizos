// Carga datos de prueba en la base de DESARROLLO. Uso: npm run seed
// Nunca se ejecuta en la app instalada.
import { app } from 'electron'
import type Database from 'better-sqlite3'
import { abrirBaseDeDatos } from './db/conexion'
import { obtenerRutas } from './rutas'

interface ModeloSemilla {
  nombre: string
  categoria: string
  descripcion: string
  precio: number
  prefijo: string
  tallas: string[]
  piezas: [string, number][]
}

const MODELOS: ModeloSemilla[] = [
  {
    nombre: 'Hombre Araña',
    categoria: 'Superhéroes',
    descripcion: 'Traje completo rojo y azul con máscara.',
    precio: 3500,
    prefijo: 'ARA',
    tallas: ['4', '6', '8', '10'],
    piezas: [['Traje', 6000], ['Máscara', 2000], ['Guantes', 1500]]
  },
  {
    nombre: 'Princesa de las Nieves',
    categoria: 'Princesas',
    descripcion: 'Vestido celeste con capa y corona.',
    precio: 3000,
    prefijo: 'NIE',
    tallas: ['4', '6', '8'],
    piezas: [['Vestido', 5000], ['Capa', 2000], ['Corona', 1200]]
  },
  {
    nombre: 'Bruja',
    categoria: 'Halloween',
    descripcion: 'Vestido negro, sombrero y escoba.',
    precio: 2500,
    prefijo: 'BRU',
    tallas: ['6', '10', 'S', 'M'],
    piezas: [['Vestido', 4000], ['Sombrero', 1500], ['Escoba', 1000]]
  },
  {
    nombre: 'Vampiro',
    categoria: 'Halloween',
    descripcion: 'Capa con cuello alto, chaleco y colmillos.',
    precio: 2500,
    prefijo: 'VAM',
    tallas: ['8', 'M', 'L'],
    piezas: [['Capa', 3500], ['Chaleco', 2500], ['Colmillos', 500]]
  },
  {
    nombre: 'Pirata',
    categoria: 'Personajes',
    descripcion: 'Camisa, chaleco, pañuelo, parche y sombrero.',
    precio: 3000,
    prefijo: 'PIR',
    tallas: ['6', '8', 'M'],
    piezas: [['Camisa', 3000], ['Chaleco', 2500], ['Sombrero', 1500], ['Parche', 300]]
  },
  {
    nombre: 'Marinera norteña (dama)',
    categoria: 'Danzas típicas',
    descripcion: 'Vestido con falda amplia y pañuelo.',
    precio: 4000,
    prefijo: 'MAR',
    tallas: ['8', '12', 'S', 'M'],
    piezas: [['Vestido', 12000], ['Pañuelo', 1000]]
  },
  {
    nombre: 'León',
    categoria: 'Animales',
    descripcion: 'Enterizo con capucha de melena.',
    precio: 2500,
    prefijo: 'LEO',
    tallas: ['2', '4', '6'],
    piezas: [['Enterizo', 5000], ['Capucha', 2000]]
  },
  {
    nombre: 'Bombero',
    categoria: 'Profesiones',
    descripcion: 'Casaca, pantalón y casco.',
    precio: 2500,
    prefijo: 'BOM',
    tallas: ['4', '6', '8'],
    piezas: [['Casaca', 3500], ['Pantalón', 2500], ['Casco', 1500]]
  }
]

// Datos ficticios.
const CLIENTES: [string, string, string, string][] = [
  ['40123456', 'María Quispe Huamán', '987654321', 'Av. Los Olivos 123, SMP'],
  ['41234567', 'José Ramírez Flores', '976543210', 'Jr. Las Flores 456, Comas'],
  ['42345678', 'Rosa Mendoza Torres', '965432109', 'Calle Los Pinos 789, Los Olivos'],
  ['43456789', 'Carlos Vargas Chávez', '954321098', 'Av. Universitaria 1020, SMP'],
  ['44567890', 'Lucía Paredes Rojas', '943210987', 'Mz. B Lt. 5, Independencia']
]

function sembrar(db: Database.Database): void {
  const insModelo = db.prepare(
    'INSERT INTO modelos (nombre, categoria, descripcion, precio_alquiler) VALUES (?, ?, ?, ?)'
  )
  const insUnidad = db.prepare(
    'INSERT INTO unidades (modelo_id, codigo, talla, estado_fisico) VALUES (?, ?, ?, ?)'
  )
  const insPieza = db.prepare('INSERT INTO piezas (unidad_id, nombre, costo_reposicion) VALUES (?, ?, ?)')
  const insCliente = db.prepare('INSERT INTO clientes (dni, nombres, telefono, direccion) VALUES (?, ?, ?, ?)')

  db.transaction(() => {
    let n = 0
    for (const m of MODELOS) {
      const modeloId = insModelo.run(m.nombre, m.categoria, m.descripcion, m.precio).lastInsertRowid
      m.tallas.forEach((talla, i) => {
        n++
        // Algunas unidades en lavandería o reparación para ver esos estados en pantalla.
        const estado = n % 7 === 0 ? 'lavanderia' : n % 11 === 0 ? 'reparacion' : 'disponible'
        const codigo = `${m.prefijo}-${String(i + 1).padStart(3, '0')}`
        const unidadId = insUnidad.run(modeloId, codigo, talla, estado).lastInsertRowid
        for (const [nombre, costo] of m.piezas) insPieza.run(unidadId, nombre, costo)
      })
    }
    for (const c of CLIENTES) insCliente.run(...c)
  })()
}

app.whenReady().then(() => {
  if (app.isPackaged) {
    console.error('El seed solo se usa en desarrollo.')
    app.exit(1)
    return
  }
  const rutas = obtenerRutas()
  const db = abrirBaseDeDatos(rutas.baseDeDatos)
  try {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM modelos').get() as { total: number }
    if (total > 0) {
      console.log(`La base ya tiene datos (${rutas.baseDeDatos}). Para empezar de cero, borre esa carpeta.`)
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
