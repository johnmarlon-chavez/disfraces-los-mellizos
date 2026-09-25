import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, dialog, nativeImage, net, protocol } from 'electron'
import { ErrorDeNegocio } from './errores'
import { nombreFotoModelo, resolverRutaFoto, tamanoReducido } from './logica/fotos'

/** Debe llamarse antes de que la app esté lista. */
export function registrarEsquemaFotos(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'fotos', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Sirve fotos://archivo/<nombre> solo desde la carpeta de fotos. */
export function atenderProtocoloFotos(carpetaFotos: string): void {
  protocol.handle('fotos', (solicitud) => {
    const ruta = resolverRutaFoto(carpetaFotos, solicitud.url)
    if (!ruta) return new Response('No encontrado', { status: 404 })
    return net.fetch(pathToFileURL(ruta).toString())
  })
}

/**
 * Abre el diálogo para elegir una imagen, la reduce a máximo 1200 px y la guarda como JPEG
 * en la carpeta de fotos. Devuelve el nombre del archivo, o null si la usuaria canceló.
 */
export async function elegirYGuardarFoto(carpetaFotos: string, modeloId: number): Promise<string | null> {
  const ventana = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const opciones: Electron.OpenDialogOptions = {
    title: 'Elegir foto del disfraz',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png'] }]
  }
  const eleccion = ventana ? await dialog.showOpenDialog(ventana, opciones) : await dialog.showOpenDialog(opciones)
  if (eleccion.canceled || eleccion.filePaths.length === 0) return null

  let imagen = nativeImage.createFromPath(eleccion.filePaths[0])
  if (imagen.isEmpty()) {
    throw new ErrorDeNegocio('No se pudo abrir esa imagen. Elija una foto en formato JPG o PNG.')
  }
  const { width, height } = imagen.getSize()
  const reducido = tamanoReducido(width, height)
  if (reducido) imagen = imagen.resize({ width: reducido.ancho, height: reducido.alto, quality: 'best' })

  const nombre = nombreFotoModelo(modeloId)
  writeFileSync(join(carpetaFotos, nombre), imagen.toJPEG(85))
  return nombre
}
