// Lanza el binario de Electron controlando ELECTRON_RUN_AS_NODE.
//   node scripts/con-electron.mjs --como-node <script> ...  -> Electron actúa como Node (pruebas con Vitest;
//                                                            better-sqlite3 está compilado para Electron)
//   node scripts/con-electron.mjs <comando npx> ...         -> Electron normal con ventanas
// Algunas terminales (como la de VS Code) ya definen ELECTRON_RUN_AS_NODE, y con eso la app no abre.
import { spawn } from 'node:child_process'
import electron from 'electron'

const args = process.argv.slice(2)
const comoNode = args[0] === '--como-node'
const { ELECTRON_RUN_AS_NODE: _, ...entorno } = process.env

const hijo = comoNode
  ? spawn(electron, args.slice(1), { stdio: 'inherit', env: { ...entorno, ELECTRON_RUN_AS_NODE: '1' } })
  : spawn(args.join(' '), { stdio: 'inherit', shell: true, env: entorno })

hijo.on('exit', (codigo) => process.exit(codigo ?? 1))
