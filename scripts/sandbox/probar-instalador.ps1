# Prueba del instalador DENTRO de Windows Sandbox (un Windows limpio que se borra al cerrarlo).
# La lanza scripts/sandbox/abrir-sandbox.mjs (npm run sandbox). No ejecutar en una computadora real:
# instala y desinstala el programa en el usuario actual.
#
# Prueba: instalar 1.0.0 → accesos directos → abrir (crea los datos) → actualizar a la versión de
# prueba → volver a instalar 1.0.0 encima (bajar de versión) → desinstalar. En cada paso, la carpeta
# de datos (%LOCALAPPDATA%\SistemaDisfraces) debe seguir intacta.

$ErrorActionPreference = 'Continue'
$resultados = 'C:\Pruebas\resultados'
$log = Join-Path $resultados 'resultado.txt'
New-Item -ItemType Directory -Force $resultados | Out-Null
Set-Content -Path $log -Value "Prueba del instalador en Windows Sandbox - $(Get-Date -Format 'dd/MM/yyyy HH:mm')" -Encoding utf8
$script:fallas = 0

function Anotar([string]$texto) { Add-Content -Path $log -Value $texto -Encoding utf8 }
function Comprobar([bool]$ok, [string]$texto) {
  if ($ok) { Anotar "OK     $texto" } else { Anotar "FALLA  $texto"; $script:fallas++ }
}

$programa = Join-Path $env:LOCALAPPDATA 'Programs\Disfraces Los Mellizos'
$exe = Join-Path $programa 'Disfraces Los Mellizos.exe'
$datos = Join-Path $env:LOCALAPPDATA 'SistemaDisfraces'
$marca = Join-Path $datos 'marca-de-prueba.txt'
$escritorio = [Environment]::GetFolderPath('Desktop')
$inicio = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

$v1 = Get-ChildItem 'C:\Pruebas\v1' -Filter 'Instalar Disfraces Los Mellizos *.exe' | Select-Object -First 1
$v2 = Get-ChildItem 'C:\Pruebas\v2' -Filter 'Instalar Disfraces Los Mellizos *.exe' -ErrorAction SilentlyContinue | Select-Object -First 1

function Instalar($instalador) {
  Anotar "--- Instalando $($instalador.Name)"
  Start-Process $instalador.FullName -ArgumentList '/S' -Wait
  Start-Sleep -Seconds 5
}
function Version { if (Test-Path $exe) { (Get-Item $exe).VersionInfo.ProductVersion } else { '(no instalado)' } }
function AbrirYCerrar {
  $p = Start-Process $exe -PassThru
  Start-Sleep -Seconds 25
  Get-Process 'Disfraces Los Mellizos' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3
  return $p
}

if (-not $v1) { Anotar 'FALLA  No se encontró el instalador 1.0.0 (npm run instalador).'; exit 1 }

# 1) Instalar
Instalar $v1
Comprobar (Test-Path $exe) "El programa quedó en $programa"
Comprobar (Test-Path (Join-Path $escritorio 'Disfraces Los Mellizos.lnk')) 'Acceso directo en el escritorio'
Comprobar (Test-Path (Join-Path $inicio 'Disfraces Los Mellizos.lnk')) 'Acceso directo en el menú Inicio'
$desinstalar = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -like 'Disfraces Los Mellizos*' } | Select-Object -First 1
Comprobar ($null -ne $desinstalar) 'Aparece en "Aplicaciones instaladas" (para desinstalar)'
Anotar "       Versión instalada: $(Version)"

# 2) Abrir: crea la base en %LOCALAPPDATA%\SistemaDisfraces
AbrirYCerrar | Out-Null
Comprobar (Test-Path (Join-Path $datos 'datos.db')) "Al abrir, se creó la base en $datos"
Set-Content -Path $marca -Value 'no borrar' -Encoding utf8

# 3) Actualizar a la versión de prueba (si se generó)
if ($v2) {
  Instalar $v2
  Comprobar ((Version) -notlike '1.0.0*') "Actualizado encima (versión $(Version))"
  Comprobar (Test-Path $marca) 'Los datos siguen después de actualizar'
  AbrirYCerrar | Out-Null
  Comprobar (Test-Path (Join-Path $datos 'datos.db')) 'La versión nueva abre con los mismos datos'

  # 4) Volver a la anterior: instalar 1.0.0 encima
  Instalar $v1
  Comprobar ((Version) -like '1.0.0*') "Se pudo volver a instalar la 1.0.0 encima (versión $(Version))"
  Comprobar (Test-Path $marca) 'Los datos siguen después de volver a la versión anterior'
} else {
  Anotar 'AVISO  No está la versión de prueba (npm run instalador:prueba): se saltan actualizar y volver atrás.'
}

# 5) Desinstalar: los datos NO se borran
$desinstalador = Join-Path $programa 'Uninstall Disfraces Los Mellizos.exe'
Anotar '--- Desinstalando'
Start-Process $desinstalador -ArgumentList '/S' -Wait
Start-Sleep -Seconds 15 # el desinstalador de NSIS se copia a sí mismo y sigue en segundo plano
Comprobar (-not (Test-Path $exe)) 'El programa se desinstaló'
Comprobar (Test-Path (Join-Path $datos 'datos.db')) 'La base de datos NO se borró al desinstalar'
Comprobar (Test-Path $marca) 'La carpeta de datos quedó intacta'

# 6) Reinstalar: encuentra los datos de antes
Instalar $v1
Comprobar (Test-Path $marca) 'Al reinstalar, están los datos de antes'

Anotar ''
if ($script:fallas -eq 0) { Anotar 'RESULTADO: todo bien.' } else { Anotar "RESULTADO: $($script:fallas) falla(s)." }
Anotar 'Puede probar a mano en esta ventana (asistente, SmartScreen no aplica aquí). Al cerrar Windows Sandbox todo se borra.'
Start-Process notepad.exe $log
