// Genera el PDF de la guía de uso a partir de la misma guía que se ve en "¿Cómo se hace?".
//   npm run guia:pdf   (compila primero; usa out/renderer)
// El programa no imprime nada: este PDF se genera aquí, una vez, para entregarlo impreso a la dueña.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

const salida = join(process.cwd(), 'docs', 'Guía de uso - Disfraces Los Mellizos.pdf')

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 1100, height: 1400 })
    await win.loadFile(join(process.cwd(), 'out', 'renderer', 'index.html'), { hash: '/guia-impresion' })
    // Esperar a que carguen las capturas.
    await win.webContents.executeJavaScript(
      'Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r })))'
    )
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#555">Disfraces Los Mellizos · Guía de uso · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
    })
    mkdirSync(join(process.cwd(), 'docs'), { recursive: true })
    writeFileSync(salida, pdf)
    console.log(`Guía generada: ${salida}`)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
