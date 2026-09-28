// Abre Windows Sandbox con los instaladores y ejecuta scripts/sandbox/probar-instalador.ps1 adentro.
//   npm run instalador && npm run instalador:prueba && npm run sandbox
// El resultado queda en release/sandbox/resultados/resultado.txt (también se abre en el Sandbox).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = process.cwd()
const { version } = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
const sandboxExe = join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'WindowsSandbox.exe')

if (!existsSync(sandboxExe)) {
  console.error(
    [
      'Windows Sandbox no está activado en esta computadora.',
      'Actívelo una vez (requiere Windows Pro y permisos de administrador):',
      '  Inicio → "Activar o desactivar las características de Windows" → marcar "Espacio aislado de Windows" → Aceptar → reiniciar.',
      'O en PowerShell como administrador:',
      '  Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All'
    ].join('\n')
  )
  process.exit(1)
}

const v1 = join(raiz, 'release', version)
const v2 = join(raiz, 'release', 'prueba')
if (!existsSync(v1)) {
  console.error(`Falta el instalador ${version}: ejecute primero "npm run instalador".`)
  process.exit(1)
}
const carpeta = join(raiz, 'release', 'sandbox')
const resultados = join(carpeta, 'resultados')
mkdirSync(resultados, { recursive: true })
mkdirSync(v2, { recursive: true })

const mapear = (host, dentro, soloLectura) =>
  `    <MappedFolder><HostFolder>${host}</HostFolder><SandboxFolder>${dentro}</SandboxFolder><ReadOnly>${soloLectura}</ReadOnly></MappedFolder>`
const wsb = `<Configuration>
  <Networking>Disable</Networking>
  <MappedFolders>
${mapear(v1, 'C:\\Pruebas\\v1', true)}
${mapear(v2, 'C:\\Pruebas\\v2', true)}
${mapear(join(raiz, 'scripts', 'sandbox'), 'C:\\Pruebas\\scripts', true)}
${mapear(resultados, 'C:\\Pruebas\\resultados', false)}
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -ExecutionPolicy Bypass -File C:\\Pruebas\\scripts\\probar-instalador.ps1</Command>
  </LogonCommand>
</Configuration>
`
const archivo = join(carpeta, 'prueba-instalador.wsb')
writeFileSync(archivo, wsb, 'utf8')
console.log(`Abriendo Windows Sandbox (${archivo}).`)
console.log(`El resultado quedará en ${join(resultados, 'resultado.txt')}`)
spawn('cmd.exe', ['/c', 'start', '', archivo], { detached: true, stdio: 'ignore' }).unref()
