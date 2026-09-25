# Sistema de Alquiler de Disfraces

Nombre de la tienda: "Disfraces Los Mellizos". Usarlo en el título de la ventana, la pantalla de login y el instalador.

Aplicación de escritorio para Windows que controla el inventario y los alquileres de una tienda de disfraces. La usará la dueña del negocio, que **no es usuaria técnica**. Todo debe ser simple, claro y a prueba de errores.

**Fuera de alcance:** boletas, facturas, cualquier integración con SUNAT y cualquier tipo de impresión. El sistema NO imprime nada; los comprobantes los emite la trabajadora por fuera del sistema.

## Contexto del negocio

- La tienda está en **Trujillo** (La Libertad).
- La tienda alquila disfraces principalmente para **colegios**: danzas folclóricas peruanas de la **Costa** (marinera, festejo, tondero), la **Sierra** (huaylas, diablada, caporales) y la **Selva** (pandilla, danza de la anaconda), además de personajes para actuaciones escolares.
- **Dos tipos de cliente:**
  - **Colegios**, que llegan con pedidos grandes para un evento (por ejemplo, 30 trajes de huaylas para el Día de la Madre).
  - **Personas** (padres de familia, profesores), que alquilan uno o pocos.
- **Temporadas altas:** Día de la Madre, Fiestas Patrias, aniversarios de colegio, primavera y clausuras de diciembre. Varios colegios suelen pedir la misma danza en las mismas fechas.
- **Tallas:** numéricas para inicial y primaria (4, 6, 8, 10, 12, 14, 16) y de letra (S, M, L, XL) para secundaria y profesores. Siempre ordenarlas de forma lógica: numéricas de menor a mayor y luego S, M, L, XL. **Nunca orden alfabético.**
- **Todo es alquiler:** los trajes siempre se devuelven. Si no alcanzan las unidades para un pedido, la tienda **confecciona las que faltan**, y esas unidades nuevas entran al inventario como cualquier otra.
- Las danzas con traje de varón y de mujer se registran como **modelos distintos** (ej. "Marinera varón" y "Marinera mujer").

## Stack

- Electron + React + TypeScript (Vite como bundler)
- SQLite con `better-sqlite3` (base de datos local, sin servidor)
- Tailwind CSS para estilos
- electron-builder para generar el instalador `.exe` (NSIS) de Windows
- Vitest para pruebas de lógica de negocio; Playwright para pruebas E2E de la app Electron

## Arquitectura

- `contextIsolation: true`, `nodeIntegration: false`. El renderer (React) nunca accede directo a la base de datos: todo pasa por IPC mediante un `preload` con una API tipada.
- La lógica de negocio (disponibilidad, mora, liquidación de devoluciones) va en módulos puros en el proceso main, separados de la capa de acceso a datos, para poder probarlos con Vitest.
- Migraciones de base de datos versionadas, que se aplican solas al iniciar la app. Nunca romper datos existentes al actualizar.
- La base de datos vive en `Documentos\SistemaDisfraces\datos.db`, NO en la carpeta de instalación, para que reinstalar o actualizar no borre nada. Las fotos, en `Documentos\SistemaDisfraces\fotos\`.
- El .gitignore debe excluir *.db, la carpeta de fotos, dist/ y release/. Nunca subir datos de clientes ni instaladores al repositorio.

## Reglas generales

- Toda la interfaz y los mensajes en español de Perú.
- Fechas en formato dd/mm/aaaa. Zona horaria America/Lima.
- Moneda en soles con formato `S/ 25.00`. Guardar montos como enteros en céntimos para evitar errores de redondeo.
- **Nada se borra físicamente.** Los disfraces se dan de baja, los alquileres se cancelan, los clientes se desactivan. El historial nunca se pierde.
- Confirmación antes de cualquier acción importante (cancelar, dar de baja, registrar devolución).
- Mensajes de error comprensibles para alguien no técnico. Ejemplo: "Este disfraz ya está reservado del 28/10 al 31/10", nunca errores técnicos de SQLite.
- Funciona 100 % sin internet.

## Diseño de interfaz

- Pensado para laptop con pantalla de 1366×768 como mínimo. Nada debe quedar cortado a esa resolución.
- Letra grande (base de 16 px o más), botones grandes y con texto claro, alto contraste.
- Menú lateral fijo con pocas opciones: Inicio, Alquileres, Disfraces, Clientes, Reportes, Configuración.
- Buscadores rápidos que filtren mientras se escribe.
- Pocos pasos para las operaciones frecuentes. Registrar un alquiler no debería requerir más de una pantalla.

## Modelo de datos

- **modelos**: id, nombre, categoría, descripción, precio_alquiler, foto, activo, prefijo, region
  - prefijo: único por modelo, base de los códigos de sus unidades ("Spiderman" → SPI, "Spiderman Negro" → SPN). Al crear el disfraz, el sistema sugiere uno y se puede editar; se valida que sea único.
  - region: `costa`, `sierra`, `selva` o vacío si no aplica (personajes, superhéroes...).
- **unidades**: id, modelo_id, código (ej. SPI-001), talla, estado_fisico, observaciones
  - estado_fisico: `disponible`, `lavanderia`, `reparacion`, `baja`
  - "Alquilado" NO es un estado físico guardado: se deduce de los alquileres activos.
  - talla: se elige de una lista fija (4, 6, 8, 10, 12, 14, 16, S, M, L, XL) o "Otra". Lo escrito en "Otra" se normaliza: sin espacios sobrantes y en mayúsculas.
- **piezas**: id, unidad_id, nombre (máscara, peluca, guantes...), costo_reposicion
- **clientes**: id, tipo, tipo_documento, numero_documento, nombres, responsable, dni_responsable, distrito, ruc, teléfono, dirección, observaciones, activo
  - tipo: `persona`, `colegio`
  - Documento (antes `dni`): solo para personas, obligatorio. tipo_documento: `dni` (8 dígitos), `ce` (carné de extranjería) o `pasaporte` (6 a 12 letras o números). Único por tipo + número.
  - teléfono: obligatorio para todos. Celular de 9 dígitos que empieza con 9, o fijo (con código de ciudad, ej. 044 123456). Se guarda solo con dígitos.
  - Distrito: sugerencias de los distritos de la provincia de Trujillo más los ya usados; se puede escribir cualquier otro.
  - responsable: profesora o coordinadora a cargo (para colegios). dni_responsable: su DNI. Ambos obligatorios para colegios (la garantía suele ser el DNI de la responsable).
  - Los colegios se identifican por **nombre + distrito**. RUC opcional; sin código modular.
  - Al registrar un colegio, avisar si ya existe uno con nombre parecido, para evitar duplicados.
- **alquileres**: id, cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada, fecha_devolucion_real, estado, garantia_tipo, garantia_monto, garantia_devuelta, evento, grado_seccion, observaciones
  - evento: texto libre con sugerencias (Día de la Madre, Fiestas Patrias, aniversario, primavera, clausura...).
  - grado_seccion: opcional (ej. "3.° B").
  - estado: `reservado`, `entregado`, `devuelto`, `cancelado`
  - garantia_tipo: `efectivo`, `dni`
- **detalle_alquiler**: id, alquiler_id, unidad_id, precio_original, precio_cobrado, estado_devolucion, observaciones
- **cargos**: id, alquiler_id, unidad_id (opcional), tipo (`mora`, `dano`, `pieza_faltante`), monto, descripcion
- **pagos**: id, alquiler_id, fecha, monto, concepto (`adelanto`, `saldo`, `garantia_recibida`, `garantia_devuelta`, `mora`, `dano`), medio (`efectivo`, `yape`, `plin`, `transferencia`, `tarjeta`)
- **usuarios**: id, nombre, usuario, contraseña (hash con bcrypt), rol (`admin`, `empleado`), activo
- **configuracion**: mora_por_dia, modo_mora, dias_margen_lavado, precio_por_dia, carpeta_respaldo, nombre_tienda
  - modo_mora: `por_unidad` (por defecto: días de retraso × mora_por_dia por cada unidad) o `por_pedido` (días de retraso × mora_por_dia una sola vez por pedido). Editable en Configuración.
- **auditoria**: id, fecha, usuario_id, accion, entidad, entidad_id, detalle (JSON). Registra cambios de precio, de estado, bajas, etc.
- **pendientes_confeccion**: id, alquiler_id, modelo_id, talla, cantidad, fecha_limite, estado, observaciones
  - estado: `pendiente`, `en_confeccion`, `listo`

## Reglas de negocio

### Disponibilidad (la regla más importante)
Una unidad NO está disponible para el rango [inicio, fin] si:
1. Su estado_fisico es `reparacion` o `baja`, o
2. Existe un alquiler en estado `reservado` o `entregado` que la incluye y donde
   `fecha_salida <= fin` Y `fecha_devolucion_pactada + dias_margen_lavado >= inicio`.

La validación se hace en el proceso main, dentro de una transacción, justo antes de guardar. Nunca confiar solo en la validación de la interfaz.

### Flujos
1. **Reservar (pedido)**: elegir cliente (o crearlo en la misma pantalla) → elegir fechas → ir agregando disfraces al pedido (buscar modelo + talla, mostrando solo unidades libres en esas fechas) → registrar adelanto.
   - **Agregar por cantidad:** además de uno por uno, se puede agregar modelo + talla + cantidad (ej. "Huaylas talla 10 × 8"). El sistema asigna solo unidades libres en esas fechas y deja cambiar alguna a mano.
   - **Si no alcanzan:** decirlo claro ("Hay 5 libres, faltan 3") y ofrecer registrar las que faltan como **pendientes de confección** con fecha límite. El pedido se guarda igual.
   - Cuando las unidades nuevas estén listas, se agregan desde Disfraces y se asignan al pedido.

### Cálculo del monto del pedido
La pantalla del pedido funciona como un carrito: cada vez que se agrega o quita un disfraz, los montos se recalculan al instante y se muestran siempre visibles:
- Lista de disfraces agregados con su precio individual y botón para quitar cada uno
- **Total del alquiler** (suma de los precios de los disfraces)
- **Adelanto pagado**
- **Saldo pendiente** (total − adelanto)
- **Garantía** mostrada aparte, porque no es parte del precio y se devuelve al final

### Edición de precios
- El precio de cada disfraz se edita desde su ficha en la pantalla Disfraces, en cualquier momento, con un campo simple y visible. Tanto la dueña como la trabajadora pueden cambiarlo.
- El cambio aplica a los pedidos nuevos. El precio de cada disfraz se copia al pedido al momento de agregarlo, así que los pedidos anteriores conservan el precio con el que se hicieron.
- Dentro de un pedido, se puede ajustar el precio de un disfraz solo para ese pedido (por ejemplo, un descuento), sin tocar el precio general. El sistema guarda el precio original y el precio cobrado, para que la dueña vea en los reportes qué pedidos tuvieron descuento. En pedidos grandes, opción **"Aplicar este precio a todos los del pedido"** (del mismo modelo) para no cambiarlos uno por uno. Si se confirma que el precio es por día, el precio de cada disfraz se multiplica por la cantidad de días del alquiler.
2. **Entregar**: cobrar saldo → registrar garantía (efectivo o DNI en prenda) → estado `entregado`.
   - No se puede entregar un pedido con pendientes de confección sin resolver, salvo que **la dueña** confirme entregar lo disponible.
3. **Devolver**: revisar cada unidad con checklist de sus piezas → calcular mora = días de retraso × mora_por_dia → registrar daños y piezas faltantes → descontar todo de la garantía → mostrar claramente cuánto se le devuelve al cliente o cuánto falta cobrar → unidades pasan a `lavanderia`.
   - **Devolución parcial:** cada unidad se recibe por separado y la mora se calcula por unidad (o por pedido, según `modo_mora`).
   - El pedido sigue `entregado` hasta que vuelve la última unidad, y muestra siempre cuántas faltan (ej. "Faltan 3 de 30").
4. **Liberar**: marcar unidades de `lavanderia` o `reparacion` como `disponible`.

### Historial del cliente
En la ficha del cliente mostrar: alquileres totales, devoluciones tardías, cargos por daños. Si tiene antecedentes, mostrar un aviso visible al registrarle un nuevo alquiler.

## Pantalla de inicio
Al abrir la app, tras el login: entregas de hoy, devoluciones de hoy, **devoluciones vencidas** (destacadas en rojo) y unidades en lavandería o reparación.

También los **pendientes de confección**, ordenados por fecha límite, destacando los que vencen en los próximos 7 días.

## Reportes
- Disfraces fuera ahora mismo y cuándo vuelven
- Alquileres vencidos
- Ingresos por día y por mes, separando alquiler, mora y daños (la garantía NO es ingreso)
- Disfraces más alquilados, filtrables por región y por evento
- Alquileres por colegio y por evento
- Pendientes de confección
- Calendario de ocupación por modelo, útil para las temporadas altas escolares (Día de la Madre, Fiestas Patrias, aniversarios de colegio, primavera, clausuras de diciembre)

## Seguridad
Confirmado: el sistema se instala en UNA sola computadora (la laptop de la dueña). No se necesita red ni sincronización entre equipos.

Solo hay DOS cuentas:
- **Dueña** (rol `admin`).
- **Trabajadores** (rol `empleado`): una sola cuenta compartida por todos los trabajadores. Decisión del cliente; no crear cuentas individuales ni PIN.

Detalles:
- Botón visible y siempre accesible de "Cerrar sesión / Cambiar de usuario", para que otra persona entre sin cerrar el programa.
- La dueña puede cambiar la contraseña de la cuenta Trabajadores desde Configuración (por ejemplo, cuando alguien deja de trabajar en la tienda).
- Aunque hoy sean solo dos cuentas, mantener la tabla `usuarios` y el registro de usuario en cada operación, para que en el futuro se puedan agregar cuentas individuales sin cambiar el resto del sistema.

Qué ve cada rol:
- **Inicio**: ambos ven entregas y devoluciones del día, vencidas y disfraces en lavandería o reparación. Solo la dueña ve el dinero ingresado hoy.
- **Alquileres, Clientes**: acceso completo para ambos.
- **Disfraces**: ambos pueden agregar, editar y cambiar precios. Solo la dueña puede dar de baja.
- **Reportes y Configuración**: solo la dueña. No aparecen en el menú de Trabajadores.
- Login al abrir la app.
- Cada operación (pedido, entrega, devolución, cambio de precio) registra qué cuenta la hizo y cuándo.

## Respaldos
- Al cerrar la app, respaldar en la carpeta de respaldo configurada (por defecto una carpeta sincronizada con Google Drive o OneDrive), conservando los últimos 30 respaldos con fecha en el nombre.
- Cada respaldo incluye **la base de datos y la carpeta `fotos\`**. Sin las fotos, restaurar dejaría los disfraces sin imagen.
- Usar la API de backup de SQLite, no copiar el archivo mientras está abierto.
- Opción en Configuración para "Restaurar un respaldo" (base de datos y fotos), con confirmación y creando antes un respaldo del estado actual.

## Plan de trabajo por fases

Trabajar una fase a la vez. Al terminar cada una: la app debe arrancar sin errores, las pruebas deben pasar y se hace commit.

1. **Base**: proyecto Electron + React + TS + Vite + Tailwind, IPC tipado, SQLite con migraciones, layout con menú lateral, datos de prueba (seed).
2. **Disfraces**: modelos, unidades, piezas, fotos, cambio de estado físico.
   - **Ajuste antes de la Fase 3:** región en modelos y orden lógico de tallas.
3. **Clientes**: registro, búsqueda por DNI o nombre, ficha con historial. Incluye clientes tipo colegio.
4. **Reservas**: búsqueda de disponibilidad, creación de reserva, adelanto. Pruebas unitarias exhaustivas de la regla de disponibilidad. Incluye pedidos por cantidad y pendientes de confección.
5. **Entrega y devolución**: flujos completos, mora, cargos, pagos, liquidación de garantía. Incluye devolución parcial.
6. **Inicio y reportes**.
7. **Usuarios y roles**: las dos cuentas, permisos por rol y cambio de contraseña.
8. **Respaldos y restauración**.
9. **Instalador**: electron-builder con NSIS, ícono, acceso directo en escritorio, nombre de la tienda.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias y descarga el binario precompilado de better-sqlite3 para Electron (`postinstall`). |
| `npm run dev` | App en modo desarrollo con recarga en caliente. Datos en `Documentos\SistemaDisfraces-dev\`. |
| `npm run seed` | Carga datos de prueba en la base de desarrollo (solo si está vacía). |
| `npm run seed:reiniciar` | Guarda la base de desarrollo actual como `datos-anterior-<fecha>.db` (no la borra) y vuelve a cargar los datos de prueba. |
| `npm test` | Pruebas unitarias con Vitest (corren dentro de Electron). |
| `npm run test:e2e` | Compila y ejecuta las pruebas E2E con Playwright (usa una carpeta de datos temporal). |
| `npm run typecheck` | Verificación de tipos (main/preload y renderer). |
| `npm run lint` | ESLint. |
| `npm run build` | Compila a `out/`. |
| `npm start` | Ejecuta la versión compilada. |

### Notas técnicas
- **Versiones fijadas:** Electron `42.11.8` + better-sqlite3 `12.11.1`. Es la combinación más reciente con binario precompilado para Windows (ABI 146), así no hacen falta Visual Studio Build Tools. No subir Electron sin verificar antes que exista `better-sqlite3-vX-electron-v<ABI>-win32-x64` en los releases de better-sqlite3.
- better-sqlite3 está compilado para Electron, por eso Vitest corre con el binario de Electron (`ELECTRON_RUN_AS_NODE=1`) mediante `scripts/con-electron.mjs`.
- La terminal de VS Code define `ELECTRON_RUN_AS_NODE=1`; los scripts `dev`, `start`, `seed` y las pruebas E2E lo quitan para que Electron abra ventanas.
- `DISFRACES_DATOS_DIR` cambia la carpeta de datos (lo usan las pruebas E2E).

### Estructura
- `src/shared/` — contrato IPC tipado (`ipc.ts`), formatos de soles/fechas y reglas compartidas de disfraces (`disfraces.ts`: `TALLAS`, `normalizarTalla`, `compararTallas`/`ordenarTallas`, `filtrarModelos`); lo usan main, preload y renderer. Ordenar tallas siempre con `compararTallas`, nunca con orden alfabético.
- `src/main/` — proceso main:
  - `logica/` — reglas de negocio puras, sin base de datos (prefijos, códigos, transiciones de estado, validaciones).
  - `db/` — conexión, migraciones y acceso a datos; cada escritura en una transacción con su registro en `auditoria`.
  - `ipc.ts` (handlers), `errores.ts` (`ErrorDeNegocio` = mensaje para la usuaria).
  - `sesion.ts` — cuenta actual y `exigirDuena()`. **Fase 7:** hoy la sesión es `null` y se permite todo; al agregar el login, dar de baja y reactivar quedarán solo para la dueña sin cambiar nada más.
  - `fotos.ts` — diálogo, reducción a 1200 px y protocolo `fotos://archivo/<nombre>`, que solo sirve archivos de la carpeta de fotos.
- `src/preload/` — expone `window.api` según el contrato.
- `src/renderer/` — React + Tailwind. Componentes base en `componentes/ui/` (Boton, CampoTexto, Dialogo, `useConfirmar()`, `useAvisos()`); usarlos en vez de `confirm()`/`alert()`. Para tallas usar `SelectorTalla` (lista fija + "Otra…") y para regiones `SelectorRegion`.
- Migraciones en `src/main/db/migraciones/`: agregar un archivo nuevo al final de la lista; nunca editar una migración ya publicada. La versión se guarda en `PRAGMA user_version`. Para reconstruir una tabla (SQLite no permite quitar `NOT NULL` ni cambiar restricciones), marcar la migración con `sinClavesForaneas: true`: el runner desactiva las claves foráneas fuera de la transacción, verifica `foreign_key_check` antes de confirmar y las reactiva siempre (ver `004_clientes_colegios.ts`).
- `src/renderer/src/componentes/clientes/FormularioCliente.tsx` — formulario de persona o colegio reutilizable (lo usará la pantalla del pedido en la fase 4), con avisos de documento repetido y de colegio parecido. `onUsarExistente(id)` recibe el cliente elegido.
- `src/renderer/src/memoriaFiltros.ts` — conserva los filtros de cada lista al volver desde una ficha (`VOLVER_CON_FILTROS`).

## Datos pendientes de confirmar con la dueña
- Monto de la mora por día de retraso
- Si la mora se cobra por unidad o por pedido (por defecto, por unidad)
- Si el precio del alquiler es por evento o por día

Mientras no estén confirmados, usar valores de ejemplo editables desde la pantalla de Configuración, nunca valores fijos en el código.
