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
  - **Única excepción (aprobada):** en una reserva todavía no entregada, quitar una unidad borra su línea de `detalle_alquiler`, y quitar un pendiente de confección sin unidades asignadas borra su fila. En ambos casos queda constancia completa en `auditoria` (`unidad_quitada_del_pedido`, `pendiente_quitado_del_pedido`: código, precios, quién y cuándo). El pedido en sí nunca se borra: se cancela.
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
- **alquileres**: id, cliente_id, fecha_reserva, fecha_salida, fecha_devolucion_pactada, fecha_devolucion_real, estado, garantia_tipo, garantia_monto, garantia_devuelta, garantia_documento, entregado_en, evento, grado_seccion, observaciones
  - entregado_en: primera entrega. fecha_devolucion_real: la de la última unidad (se llena al cerrar).
  - garantia_documento: número del DNI (u otro documento) que queda en prenda. garantia_devuelta = 1 cuando la garantía se liquidó o el documento se devolvió.
  - evento: texto libre con sugerencias (Día de la Madre, Fiestas Patrias, aniversario, primavera, clausura...).
  - grado_seccion: opcional (ej. "3.° B").
  - estado: `reservado`, `entregado`, `devuelto`, `cancelado`
  - garantia_tipo: `efectivo`, `dni`
- **detalle_alquiler**: id, alquiler_id, unidad_id, precio_original, precio_cobrado, estado_devolucion, observaciones, pendiente_id, fecha_entrega_real, entregado_por, fecha_devolucion_real, recibido_por
  - pendiente_id (opcional): el pendiente de confección que cubrió esta unidad.
  - **Entrega y devolución por unidad:** cada unidad tiene su fecha de entrega y de devolución. estado_devolucion: `bien`, `con_danos`, `con_faltantes`, `con_danos_y_faltantes` (vacío mientras no vuelve).
- **cargos**: id, alquiler_id, unidad_id (opcional), pieza_id (opcional), tipo (`mora`, `dano`, `pieza_faltante`), monto, monto_original, motivo_rebaja, descripcion
  - monto puede bajar (hasta 0) solo si la dueña rebaja o perdona la mora; monto_original y motivo_rebaja lo registran.
- **pagos**: id, alquiler_id, fecha, monto, concepto (`adelanto`, `saldo`, `garantia_recibida`, `garantia_devuelta`, `mora`, `dano`, `devolucion_adelanto`), medio (`efectivo`, `yape`, `plin`, `transferencia`, `tarjeta`)
  - devolucion_adelanto: lo que se devuelve del adelanto al cancelar (o lo pagado de más al cerrar). Lo retenido (adelanto − devoluciones de un pedido cancelado) cuenta como ingreso en los reportes.
  - desde_garantia = 1: pago tomado de la garantía en dinero al cerrar el pedido (cuenta como ingreso de su concepto; la garantía en sí nunca es ingreso).
- **usuarios**: id, nombre, usuario, contraseña (hash con bcrypt), rol (`admin`, `empleado`), activo
- **configuracion**: mora_por_dia, modo_mora, dias_margen_lavado, precio_por_dia, carpeta_respaldo, nombre_tienda
  - modo_mora: `por_unidad` (por defecto: días de retraso × mora_por_dia por cada unidad) o `por_pedido` (días de retraso × mora_por_dia una sola vez por pedido). Editable en Configuración.
- **auditoria**: id, fecha, usuario_id, accion, entidad, entidad_id, detalle (JSON). Registra cambios de precio, de estado, bajas, etc.
- **pendientes_confeccion**: id, alquiler_id, modelo_id, talla, cantidad, cantidad_asignada, precio_original, precio_cobrado, fecha_limite, estado, observaciones
  - estado: `pendiente`, `en_confeccion`, `listo`. `listo` solo cuando cantidad_asignada = cantidad (se marca solo al asignar la última unidad).
  - precio_original/precio_cobrado: por unidad, copiados al registrar el pendiente (igual que en detalle_alquiler).
  - fecha_limite: por defecto 2 días antes de la salida, editable; entre hoy y la salida, nunca después.

## Reglas de negocio

### Disponibilidad (la regla más importante)
Una unidad NO está disponible para el rango [inicio, fin] si:
1. Su estado_fisico es `reparacion` o `baja`, o
2. Existe un alquiler en estado `reservado` o `entregado` que la incluye y donde
   `fecha_salida <= fin` Y `fecha_devolucion_pactada + dias_margen_lavado >= inicio`.

La validación se hace en el proceso main, dentro de una transacción, justo antes de guardar. Nunca confiar solo en la validación de la interfaz.

Precisiones (implementadas en `src/main/logica/disponibilidad.ts`, con prueba aleatoria contra una versión día por día):
- Fechas inclusivas. Con margen 1, un traje que vuelve el 31/10 está ocupado hasta el 01/11. Con margen 0, el mismo día de la devolución todavía choca.
- **Alquiler entregado y vencido** (no ha vuelto): se cuenta ocupado hasta la fecha más tarde entre la pactada y hoy, más el margen.
- `lavanderia` no bloquea (el traje volverá limpio); se puede asignar aunque el pedido salga hoy, con aviso.
- Al editar un pedido, sus propias unidades no chocan consigo mismas.
- Las escrituras de pedidos usan transacciones `IMMEDIATE`.

### Flujos
1. **Reservar (pedido)**: elegir cliente (o crearlo en la misma pantalla) → elegir fechas → ir agregando disfraces al pedido (buscar modelo + talla, mostrando solo unidades libres en esas fechas) → registrar adelanto.
   - **Agregar por cantidad:** además de uno por uno, se puede agregar modelo + talla + cantidad (ej. "Huaylas talla 10 × 8"). El sistema asigna solo unidades libres en esas fechas y deja cambiar alguna a mano. Preferencia: primero las `disponible`, luego las de lavandería; dentro de cada grupo, por código.
   - **Evento** obligatorio, con sugerencias (Día de la Madre, Fiestas Patrias, Aniversario del colegio, Primavera, Clausura, los ya usados y "Otro").
   - **Si no alcanzan:** decirlo claro ("Hay 5 libres, faltan 3") y ofrecer registrar las que faltan como **pendientes de confección** con fecha límite. El pedido se guarda igual.
   - Cuando las unidades nuevas estén listas, se agregan desde Disfraces y se asignan al pedido (al agregarlas, el sistema ofrece asignarlas a los pedidos que esperan ese modelo y talla; también desde la ficha del pedido con "Asignar unidades listas").
   - **Cancelar** (solo reservas): el sistema pregunta qué hacer con el adelanto: devolver todo, devolver una parte (indicando el monto) o retenerlo.

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
- Dentro de un pedido, se puede ajustar el precio de un disfraz solo para ese pedido (por ejemplo, un descuento), sin tocar el precio general. El sistema guarda el precio original y el precio cobrado, para que la dueña vea en los reportes qué pedidos tuvieron descuento. En pedidos grandes, opción **"Aplicar este precio a todos los del pedido"** (del mismo modelo) para no cambiarlos uno por uno. Si se confirma que el precio es por día, el precio de cada disfraz se multiplica por la cantidad de días del alquiler: la diferencia entre la fecha de devolución y la de salida, mínimo 1. Si cambian las fechas, los precios ya copiados se reajustan en proporción a los días.
2. **Entregar**: cobrar saldo → registrar garantía (efectivo o DNI en prenda) → estado `entregado`.
   - No se puede entregar un pedido con pendientes de confección sin resolver, salvo que **la dueña** confirme entregar lo disponible.
   - **Por unidad:** se eligen las unidades que salen; las demás (por ejemplo, las que se confeccionan después) se entregan más tarde **dentro del mismo pedido** ("el colegio recoge 27 hoy y 3 mañana"). El saldo y la garantía se registran en la primera entrega.
   - Saldo completo; solo con autorización de la dueña se entrega con saldo pendiente, que queda como deuda del pedido. Se puede pagar con varios medios.
   - Solo desde la fecha de salida. Antes, con **"Entregar hoy (adelantar la salida)"**, que verifica la disponibilidad desde hoy y ajusta la fecha.
   - Una unidad que todavía no vuelve de otro pedido bloquea la entrega ("cámbiela por otra libre"). Las que están en lavandería se entregan confirmando que ya están limpias; las de reparación no.
   - Si la confección nunca llega, la dueña puede "cancelar lo que no se entregó": el total baja y lo pagado de más se devuelve al cerrar.
3. **Devolver**: revisar cada unidad con checklist de sus piezas → calcular mora = días de retraso × mora_por_dia → registrar daños y piezas faltantes → descontar todo de la garantía → mostrar claramente cuánto se le devuelve al cliente o cuánto falta cobrar → unidades pasan a `lavanderia`.
   - **Devolución parcial:** cada unidad se recibe por separado y la mora se calcula por unidad (o por pedido, según `modo_mora`).
   - El pedido sigue `entregado` hasta que vuelve la última unidad, y muestra siempre cuántas faltan (ej. "Faltan 3 de 30").
   - Fecha de devolución: por defecto hoy; se puede registrar una anterior (nunca antes de la entrega ni futura) para no cobrar mora injusta.
   - Mora: días de retraso = fecha real − pactada (el margen de lavado no cuenta). `por_unidad`: cada unidad atrasada paga sus días. `por_pedido`: una sola mora por el mayor retraso; en devoluciones parciales se cobra solo la diferencia de días (nunca dos veces).
   - Solo **la dueña** rebaja o perdona la mora, con motivo obligatorio en auditoría.
   - **Liquidación** (al no quedar nada por entregar ni devolver): la garantía en dinero cubre la deuda en este orden: **saldo, daños y faltantes, mora**. Lo que sobra se devuelve; si no alcanza, "Falta cobrar S/ X". Si no paga en el momento, el pedido se cierra igual como `devuelto` con **"Debe S/ X"**, visible en el cliente y contado como antecedente. El **DNI en prenda se retiene hasta que pague**.
4. **Liberar**: marcar unidades de `lavanderia` o `reparacion` como `disponible`.

### Historial del cliente
En la ficha del cliente mostrar: alquileres totales, devoluciones tardías, cargos por daños. Si tiene antecedentes, mostrar un aviso visible al registrarle un nuevo alquiler.

## Pantalla de inicio
Al abrir la app, tras el login: entregas de hoy, devoluciones de hoy, **devoluciones vencidas** (destacadas en rojo) y unidades en lavandería o reparación.

También los **pendientes de confección**, ordenados por fecha límite, destacando los que vencen en los próximos 7 días.

Orden de las tarjetas, por urgencia (lo importante se ve sin bajar a 1366×768; las tarjetas vacías se muestran compactas en una línea):
1. Devoluciones vencidas (rojo: días de retraso, lo que falta, teléfono, mora estimada si devolviera hoy) y reservas no recogidas.
2. Entregas de hoy (incluye lo que falta entregar de pedidos entregados en parte) y devoluciones de hoy.
3. Pendientes de confección (vencidos en rojo; los que vencen en 7 días, destacados).
4. Lavandería y reparación (se pueden marcar varias como disponibles a la vez), próximas entregas (7 días) y clientes que deben.

Solo la dueña ve el **dinero de hoy** y las **garantías en custodia** (dinero de garantías recibido que todavía no se devolvió ni se usó para cubrir deudas: no es de la tienda).

## Reportes
- **Ingresos** por la fecha en que entró el dinero (en hora de Lima): así el total de un mes pasado nunca cambia. Categorías: alquiler, **adelantos retenidos** (de pedidos cancelados, menos lo devuelto), mora, daños y faltantes. La garantía no es ingreso; lo tomado de la garantía al cerrar sí (como pago de su concepto). Si un pedido se cancela después, sus adelantos pasan de "alquiler" a "retenidos" en la fecha en que se pagaron. Las deudas se muestran aparte como "por cobrar".
- **Caja por medio de pago:** lo que entró y salió de verdad (incluidas garantías) por efectivo, Yape, Plin, transferencia y tarjeta; y las **garantías en custodia** con el detalle por pedido.
- Pedidos con descuento y moras rebajadas o perdonadas (con su motivo).
- Clientes que deben (con el documento retenido).
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
- **Autorización de la dueña sin cerrar sesión:** la laptop estará casi siempre con la sesión de Trabajadores. Toda acción "solo para la dueña" (autorizar saldo pendiente, entregar con pendientes, rebajar o perdonar la mora, cancelar lo que no se entregó, dar de baja, reactivar) pide **la contraseña de la dueña en un diálogo en ese momento**, sin cerrar sesión.
  - Ya preparado: en el renderer todas pasan por `useAutorizacionDuena()`; en el main, por `exigirDuena(sesion, accion, autorizacion)`, que acepta la contraseña mediante `establecerVerificadorDuena()`.
  - **Fase 7:** agregar el campo de contraseña al diálogo de `useAutorizacionDuena()` cuando la sesión sea de Trabajadores, y registrar el verificador (bcrypt) al iniciar sesión.
  - **Hecho (Fase 7):** con la sesión de Trabajadores, el diálogo pide la contraseña de la dueña, la verifica (`acceso:verificarDuena`) y queda abierto para reintentar si es incorrecta. Con la sesión de la dueña es solo una confirmación.

### Acceso (implementado en la Fase 7)
- **Primer uso, sin contraseñas por defecto:** con la base sin cuentas, la app abre un asistente. En él la dueña elige su contraseña y la de Trabajadores (deben ser distintas) y anota el código de recuperación, que debe volver a escribir para confirmarlo. Las cuentas se crean una sola vez (`usuario` = `duena` / `trabajadores`). El seed no crea cuentas: en desarrollo se usa el asistente.
- **Contraseñas:** simples pero no triviales (`src/shared/contrasenas.ts`, las mismas reglas en la pantalla y en el main):
  - mínimo 8 caracteres; se permiten espacios, así que valen frases;
  - se rechazan secuencias, repeticiones, palabras obvias (contraseña, mellizos, trujillo, el nombre de la cuenta…), fechas y números de menos de 10 cifras;
  - indicador "Muy fácil / Aceptable / Buena".
  - Se guardan solo como hash bcrypt (`bcryptjs`, en JS puro, sin compilar).
- **Código de recuperación** (`XXXX-XXXX-XXXX`, sin 0/O/1/I/L):
  - se muestra una sola vez para anotarlo en papel y se guarda como hash;
  - es de un solo uso: al usarlo en "¿Olvidó su contraseña?" (cuenta Dueña) se elige una contraseña nueva y se muestra un código nuevo;
  - la dueña puede generar otro desde Configuración, pidiendo su contraseña.
  - Trabajadores no tiene código: la dueña cambia su contraseña desde Configuración sin necesitar la anterior.
- **Bloqueo por intentos, con un contador separado por cuenta** (los fallos de Trabajadores no bloquean a la dueña, y al revés):
  - tras 5 fallos, esperas crecientes de 1, 5, 15, 30 y 60 minutos, guardadas en la base (`usuarios.intentos_fallidos`, `bloqueos`, `bloqueado_hasta`);
  - un ingreso correcto reinicia el contador;
  - las contraseñas mal escritas en el diálogo de autorización cuentan para el contador de la dueña.
- **Inactividad:**
  - La sesión de la dueña se cierra sola tras 10 minutos sin actividad y vuelve a la pantalla de ingreso. Un minuto antes avisa, con cuenta regresiva y el botón "Seguir en la sesión"; mientras el aviso está en pantalla, solo ese botón mantiene la sesión abierta.
  - La sesión de Trabajadores no se cierra sola.
  - Se usa un reloj monótono (`performance.now()`), así que no depende de la hora del sistema ni del reloj simulado de las pruebas.
  - El renderer manda un latido (`acceso:actividad`) cada 15 s como máximo mientras hay actividad; el main también cierra la sesión por su cuenta (límite + 30 s de margen).
- **IPC con niveles** (`src/main/logica/nivelesIpc.ts`):
  - `publico`: solo lo que usa la pantalla de ingreso;
  - `sesion`: el nivel por defecto; exige una sesión abierta;
  - `duena`: todos los `reportes:*`, `config:actualizar` y los cambios de contraseña y de código.
  - Sin sesión, el main responde `sesionCerrada` y la interfaz vuelve al ingreso.
- **Configuración editable (solo la dueña):** mora por día, modo de mora, días de lavado y precio por evento o por día. Se valida en el main y la auditoría (`configuracion_cambiada`) guarda el antes y el después. Los pedidos ya registrados conservan sus precios.
- **Auditoría de acceso:** `cuentas_creadas`, `inicio_sesion`, `cierre_sesion`, `sesion_cerrada_inactividad`, `cuenta_bloqueada`, `contrasena_cambiada`, `contrasena_recuperada`, `codigo_recuperacion_nuevo` y `codigo_restablecido_soporte`. Nunca se guarda una contraseña ni un código en claro.

### Soporte: la dueña perdió su contraseña y su código de recuperación
Hace falta acceso al equipo, en persona o por AnyDesk. **No se pierde ningún dato.**

**Clave de soporte.** La herramienta está protegida por una clave que solo conoce el técnico. Sin ella, nadie puede usarla, ni la trabajadora ni ninguna otra persona frente a la laptop.
- Se guarda solo como hash bcrypt, en la tabla `soporte` de la base de datos. Por eso viaja con los respaldos y sobrevive a reinstalar o actualizar.
- Tiene su propio límite de intentos: 5 fallos y luego esperas de 1, 5, 15, 30 y 60 minutos. Ese contador es independiente del de las cuentas.
- Mientras no esté definida, `--restablecer-duena` no hace nada. Configuración le muestra a la dueña "Clave de soporte: No definida" para que se la pida al técnico.

**Definir la clave de soporte al instalar** (la Fase 9 lo incluirá en el procedimiento de instalación):
1. Instalar el programa. Puede hacerse antes o después de que la dueña cree sus contraseñas en el asistente.
2. Con el programa cerrado, ejecutar el `.exe` con `--definir-clave-soporte`, desde "Ejecutar" (Win + R) o una ventana de comandos. Ejemplo (la ruta exacta la fija el instalador de la Fase 9):
   `"%LOCALAPPDATA%\Programs\Disfraces Los Mellizos\Disfraces Los Mellizos.exe" --definir-clave-soporte`
3. En la ventana "Definir la clave de soporte", escribir la clave dos veces:
   - al menos 12 caracteres, con las mismas reglas que las contraseñas;
   - distinta de la contraseña de la dueña y de la de Trabajadores.
   - **Si las cuentas ya existen**, la dueña debe escribir además su contraseña para autorizarla. Sin ella no se define, así que nadie puede adelantarse a definir la clave para usar la herramienta. Esos intentos cuentan para el contador de la dueña.
   - Si se define antes del asistente de primer uso (sin cuentas), no hace falta.
4. Guardar la clave **fuera de la laptop**, en el gestor de contraseñas del técnico. No anotarla en la tienda ni decírsela a nadie.
- Para cambiarla más adelante se usa la misma herramienta, que entonces pide la clave actual. Así nadie puede reemplazarla para usar la herramienta.
- En desarrollo: `npm run definir-clave-soporte`.

**Restablecer el acceso de la dueña:**
1. Cerrar el programa si está abierto; si está abierto, la herramienta avisa y no hace nada.
2. Ejecutar el programa instalado con el parámetro `--restablecer-duena`: desde "Ejecutar" (Win + R) o una ventana de comandos, con la ruta del `.exe` entre comillas. Ejemplo (la ruta exacta la fija el instalador de la Fase 9):
   `"%LOCALAPPDATA%\Programs\Disfraces Los Mellizos\Disfraces Los Mellizos.exe" --restablecer-duena`
3. Escribir la **clave de soporte**. Con la clave correcta aparece un **código de recuperación nuevo**. La dueña lo anota en papel. El código anterior deja de servir y su cuenta queda desbloqueada. La herramienta **no cambia ninguna contraseña** ni ningún otro dato.
4. La dueña abre el programa, elige "Dueña" → "¿Olvidó su contraseña?", escribe el código y elige una contraseña nueva. Luego anota el código nuevo que se le muestra.
5. Al ingresar, la dueña ve un aviso: "El acceso de su cuenta fue restablecido por soporte técnico el dd/mm/aaaa a las hh:mm. Si usted no lo pidió, comuníquese con su técnico.", con el botón "Entendido".
   - Se muestra en cada ingreso de la dueña hasta que lo pulse; no se cierra con Escape.
   - Configuración muestra siempre la fecha del último restablecimiento por soporte.
- En desarrollo: `npm run restablecer-duena` (usa `Documentos\SistemaDisfraces-dev\`).
- Queda registrado en la auditoría como `codigo_restablecido_soporte`.

**Auditoría de soporte** (entidad `soporte`, sin usuario). Cada uso queda registrado, con éxito o no:
- `soporte_herramienta_abierta`: cada vez que se abre una herramienta;
- `soporte_clave_definida` (con `conContrasenaDuena`), `soporte_clave_cambiada`;
- `soporte_sin_contrasena_duena`, `soporte_contrasena_duena_incorrecta`: primera definición sin la contraseña de la dueña o con una incorrecta;
- `soporte_clave_incorrecta`, `soporte_bloqueado`, `soporte_intento_bloqueado`;
- `soporte_sin_clave`: intento sin clave definida;
- `codigo_restablecido_soporte`;
- `aviso_restablecimiento_visto`: cuando la dueña pulsa "Entendido".

**Cómo está hecho:**
- Las herramientas abren una ventana pequeña (`#/soporte/restablecer` o `#/soporte/definir-clave`) en la que el main registra solo los canales `soporte:*` (`registrarManejadoresSoporte`); el resto del programa no existe en ese modo.
- En la app normal, los canales `soporte:*` no están registrados.
- `definirClaveSoporte` valida en este orden: formato de la clave, autorización (clave actual o contraseña de la dueña) y recién entonces la comparación con las contraseñas de las cuentas. Sin autorización, esa comparación serviría para adivinar las contraseñas.

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
| `npm run seed:reiniciar` | Guarda la base de desarrollo actual como `datos-anterior-<fecha>.db` (no la borra) y vuelve a cargar los datos de prueba. Cerrar antes la app si está abierta. |
| `npm test` | Pruebas unitarias con Vitest (corren dentro de Electron). |
| `npm run test:e2e` | Compila y ejecuta las pruebas E2E con Playwright (usa una carpeta de datos temporal). |
| `npm run typecheck` | Verificación de tipos (main/preload y renderer). |
| `npm run lint` | ESLint. |
| `npm run restablecer-duena` | Herramienta de soporte en desarrollo: código de recuperación nuevo para la dueña (ver "Soporte" en Seguridad). Cerrar antes la app. |
| `npm run definir-clave-soporte` | Herramienta de soporte en desarrollo: definir o cambiar la clave de soporte. Cerrar antes la app. |
| `npm run build` | Compila a `out/`. |
| `npm start` | Ejecuta la versión compilada. |

### Notas técnicas
- **Versiones fijadas:** Electron `42.11.8` + better-sqlite3 `12.11.1`. Es la combinación más reciente con binario precompilado para Windows (ABI 146), así no hacen falta Visual Studio Build Tools. No subir Electron sin verificar antes que exista `better-sqlite3-vX-electron-v<ABI>-win32-x64` en los releases de better-sqlite3.
- better-sqlite3 está compilado para Electron, por eso Vitest corre con el binario de Electron (`ELECTRON_RUN_AS_NODE=1`) mediante `scripts/con-electron.mjs`.
- La terminal de VS Code define `ELECTRON_RUN_AS_NODE=1`; los scripts `dev`, `start`, `seed` y las pruebas E2E lo quitan para que Electron abra ventanas.
- `DISFRACES_DATOS_DIR` cambia la carpeta de datos (lo usan las pruebas E2E).
- Pruebas E2E con días de retraso: `tests/e2e/entregas.spec.ts` adelanta el reloj de la app (main y ventana) en lugar de manipular la base.
- Si las pruebas E2E fallan todas con `ECONNRESET`, quedó un Electron abierto (instancia única): cerrarlo y reintentar.
  - Desde la Fase 7, con `DISFRACES_DATOS_DIR` también `userData` va a esa carpeta, así que el bloqueo de instancia única de las pruebas ya no choca con la app de desarrollo abierta.
- Pruebas E2E y login: `lanzarApp()` crea las cuentas por la API (contraseñas de prueba en `tests/e2e/ayudante.ts`) y deja abierta la sesión de la dueña. Opciones:
  - `{ cuentas: false }` para probar el asistente;
  - `{ sesion: 'trabajadores' | null }` para abrir otra sesión o ninguna;
  - `{ inactividadMs }`, que usa la variable `DISFRACES_INACTIVIDAD_MS` (por defecto una hora en las pruebas, para no cortar sesiones).
  - `{ carpetaDatos, args }` y `cerrar(true)` para volver a abrir la misma carpeta, por ejemplo con `--restablecer-duena` (ver `tests/e2e/soporte.spec.ts`).
- En las pruebas unitarias, `establecerRondasBcrypt(4)` acelera bcrypt.
- El seed crea también historia de los últimos meses (devueltos, con daños, cancelado, con deuda, vencido, no recogido) usando las funciones reales con un "hoy" en el pasado, y fecha los pagos en su día. Para probarlo sin tocar la base de desarrollo: `DISFRACES_DATOS_DIR=<carpeta>-dev npx electron out/main/seed.js` (el nombre de la carpeta debe terminar en `-dev`).
- Electron arranca con `--lang=es-PE` (Chromium lo sirve como `es-419`) para que los campos de fecha muestren dd/mm/aaaa.
- En layouts de dos columnas usar `grid-cols-[minmax(0,1fr)_…]`, no `1fr`: con `1fr` el contenido largo desborda a 1366×768.

### Estructura
- `src/shared/` — contrato IPC tipado (`ipc.ts`), formatos de soles/fechas y reglas compartidas de disfraces (`disfraces.ts`: `TALLAS`, `normalizarTalla`, `compararTallas`/`ordenarTallas`, `filtrarModelos`); lo usan main, preload y renderer. Ordenar tallas siempre con `compararTallas`, nunca con orden alfabético.
- `src/main/` — proceso main:
  - `logica/` — reglas de negocio puras, sin base de datos: `disponibilidad.ts` (la regla de disponibilidad y la asignación por cantidad), `mora.ts`, `liquidacion.ts` (estado de cuenta y cobertura de la garantía), `pedidos.ts`, `clientes.ts`, `disfraces.ts`.
  - `logica/reportes.ts` — clasificación de pagos en ingresos, agrupación por día y mes en hora de Lima, caja por medio de pago, custodia y ocupación por día (con la misma regla de disponibilidad). `db/reportes.ts` — datos de Inicio y consultas de reportes (los canales de reportes pasan por `exigirDuena()`).
  - `db/entregas.ts` — entregar, devolver (con previsualización exacta: se aplica en una transacción y se deshace), liquidar, pagos de deuda, rebaja de mora. `db/cuentas.ts` — estado de cuenta de cada pedido y deudas por cliente.
  - `db/` — conexión, migraciones y acceso a datos; cada escritura en una transacción con su registro en `auditoria`.
  - `ipc.ts` (handlers), `errores.ts` (`ErrorDeNegocio` = mensaje para la usuaria).
  - `sesion.ts` — cuenta actual y `exigirDuena()`. **Fase 7:** hoy la sesión es `null` y se permite todo; al agregar el login, dar de baja y reactivar quedarán solo para la dueña sin cambiar nada más.
    - **Hecho (Fase 7):** la sesión la abre y la cierra `acceso.ts`. El IPC no deja pasar nada sin sesión, así que `null` solo llega en las pruebas y en el seed.
  - `acceso.ts` — servicio de sesión: primer uso, ingreso, salida, recuperación y cierre por inactividad de la dueña. Registra el verificador de la contraseña de la dueña.
  - `db/usuarios.ts` — cuentas: creación única, ingreso con contador por cuenta, recuperación, cambios de contraseña, código nuevo y `restablecerCodigoDuena` (herramienta de soporte).
  - `db/soporte.ts` — clave de soporte: definición, verificación con su propio contador y auditoría de cada uso, y `restablecerConClave`, el único camino hacia `restablecerCodigoDuena`. Aviso pendiente en `usuarios.restablecido_por_soporte_en` (migración 010).
  - `logica/acceso.ts` — código de recuperación, esperas del bloqueo y control de inactividad (puro).
  - `logica/nivelesIpc.ts` — nivel de acceso de cada canal.
  - `fotos.ts` — diálogo, reducción a 1200 px y protocolo `fotos://archivo/<nombre>`, que solo sirve archivos de la carpeta de fotos.
- `src/preload/` — expone `window.api` según el contrato.
- `src/renderer/` — React + Tailwind. Componentes base en `componentes/ui/` (Boton, CampoTexto, Dialogo, `useConfirmar()`, `useAvisos()`); usarlos en vez de `confirm()`/`alert()`. Para tallas usar `SelectorTalla` (lista fija + "Otra…") y para regiones `SelectorRegion`.
- Migraciones en `src/main/db/migraciones/`: agregar un archivo nuevo al final de la lista; nunca editar una migración ya publicada. La versión se guarda en `PRAGMA user_version`. Para reconstruir una tabla (SQLite no permite quitar `NOT NULL` ni cambiar restricciones), marcar la migración con `sinClavesForaneas: true`: el runner desactiva las claves foráneas fuera de la transacción, verifica `foreign_key_check` antes de confirmar y las reactiva siempre (ver `004_clientes_colegios.ts`).
- `src/renderer/src/componentes/clientes/FormularioCliente.tsx` — formulario de persona o colegio reutilizable (lo usará la pantalla del pedido en la fase 4), con avisos de documento repetido y de colegio parecido. `onUsarExistente(id)` recibe el cliente elegido.
- `src/renderer/src/memoriaFiltros.ts` — conserva los filtros de cada lista al volver desde una ficha (`VOLVER_CON_FILTROS`).
- `src/renderer/src/componentes/acceso/` — gestión de la sesión en el renderer:
  - `ProveedorSesion` / `useSesion()` decide qué se muestra: el asistente, la pantalla de ingreso o la app. Al cerrar la sesión desmonta la app entera, diálogos incluidos, y vigila la inactividad de la dueña.
  - `CampoContrasena` tiene el botón 👁 para ver la contraseña, el aviso de Bloq Mayús y el indicador de seguridad.
  - `PantallaSoporte`: la ventana de las herramientas de soporte. `main.tsx` la muestra en lugar de la app cuando el hash es `#/soporte/...`.
  - Menú y rutas filtrados por rol: Reportes y Configuración no existen para Trabajadores.

## Datos pendientes de confirmar con la dueña
- Monto de la mora por día de retraso
- Si la mora se cobra por unidad o por pedido (por defecto, por unidad)
- Si el precio del alquiler es por evento o por día

Mientras no estén confirmados, usar valores de ejemplo editables desde la pantalla de Configuración, nunca valores fijos en el código.
