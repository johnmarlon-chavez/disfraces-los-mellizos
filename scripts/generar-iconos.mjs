// Convierte los SVG de build/iconos/ en PNG (16 a 256 px) y en .ico, usando Chromium de Electron.
//   npm run iconos -- <opción>   (antifaces, antifaz-lm o sombrero; por defecto antifaces)
// La opción elegida pasa a build/icon.ico (instalador y programa) y a src/renderer/src/assets/icono.svg.
// Sin programas de diseño: el .ico se arma a mano (formato con imágenes PNG, válido desde Windows Vista).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { app, BrowserWindow } from 'electron'

const TAMANOS = [16, 24, 32, 48, 64, 128, 256]
const CARPETA = join(process.cwd(), 'build', 'iconos')
const elegida = process.argv.find((a) => a.endsWith('.svg') === false && /^[a-z-]+$/.test(a)) ?? 'antifaces'

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

let ventana = null

/**
 * Dibuja el SVG a cada tamaño (nítido en tamaños chicos) y captura esa zona. Una sola ventana
 * para todo: abrir una segunda ventana con una URL data: falla a veces en Windows.
 */
async function rasterizar(svg) {
  if (!ventana) {
    ventana = new BrowserWindow({ show: false, width: 256, height: 256, useContentSize: true, frame: false, transparent: true, webPreferences: { offscreen: true } })
    await ventana.loadURL('data:text/html,<html><body style="margin:0;background:transparent;overflow:hidden"><img id="i" style="display:block"></body></html>')
  }
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const pngs = []
  for (const tamano of TAMANOS) {
    await ventana.webContents.executeJavaScript(
      `new Promise((listo) => { const i = document.getElementById('i'); i.onload = () => listo(); i.width = ${tamano}; i.height = ${tamano}; i.src = '${src}#' + ${tamano} })`
    )
    await new Promise((r) => setTimeout(r, 200))
    let imagen = await ventana.webContents.capturePage({ x: 0, y: 0, width: tamano, height: tamano })
    if (imagen.getSize().width !== tamano) imagen = imagen.resize({ width: tamano, height: tamano, quality: 'best' })
    pngs.push({ tamano, png: imagen.toPNG() })
  }
  return pngs
}

function armarIco(pngs) {
  const cabecera = Buffer.alloc(6 + 16 * pngs.length)
  cabecera.writeUInt16LE(0, 0)
  cabecera.writeUInt16LE(1, 2) // 1 = ícono
  cabecera.writeUInt16LE(pngs.length, 4)
  let desplazamiento = cabecera.length
  pngs.forEach(({ tamano, png }, i) => {
    const e = 6 + 16 * i
    cabecera.writeUInt8(tamano >= 256 ? 0 : tamano, e)
    cabecera.writeUInt8(tamano >= 256 ? 0 : tamano, e + 1)
    cabecera.writeUInt16LE(1, e + 4) // planos
    cabecera.writeUInt16LE(32, e + 6) // bits por píxel
    cabecera.writeUInt32LE(png.length, e + 8)
    cabecera.writeUInt32LE(desplazamiento, e + 12)
    desplazamiento += png.length
  })
  return Buffer.concat([cabecera, ...pngs.map((p) => p.png)])
}

app.whenReady().then(async () => {
  try {
    const salida = join(CARPETA, 'generados')
    mkdirSync(salida, { recursive: true })
    for (const archivo of readdirSync(CARPETA).filter((f) => f.endsWith('.svg'))) {
      const nombre = basename(archivo, '.svg')
      const svg = readFileSync(join(CARPETA, archivo), 'utf8')
      const pngs = await rasterizar(svg)
      for (const { tamano, png } of pngs) writeFileSync(join(salida, `${nombre}-${tamano}.png`), png)
      const ico = armarIco(pngs)
      writeFileSync(join(salida, `${nombre}.ico`), ico)
      if (nombre === elegida) {
        // El elegido: ícono del instalador y del programa, y el de la pantalla de ingreso.
        writeFileSync(join(process.cwd(), 'build', 'icon.ico'), ico)
        mkdirSync(join(process.cwd(), 'src', 'renderer', 'src', 'assets'), { recursive: true })
        writeFileSync(join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'icono.svg'), svg)
      }
      console.log(`${nombre}: ${TAMANOS.join(', ')} px${nombre === elegida ? ' → build/icon.ico' : ''}`)
    }
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
