# Guía de instalación — Disfraces Los Mellizos

Para el técnico que instala y mantiene el programa. La dueña tiene su propia guía (`docs/Guía de uso - Disfraces Los Mellizos.pdf`, que también está dentro del programa en «¿Cómo se hace?»).

**Tiempo estimado:** 45 minutos, con la dueña presente a partir del paso 4.

---

## Qué llevar

- [ ] El instalador `Instalar Disfraces Los Mellizos 1.0.0.exe`, en una **memoria USB**. Se genera con `npm run instalador` en `release\1.0.0\`. Guarde una copia de cada versión en su carpeta de instaladores, **nunca en el repositorio**.
- [ ] La guía de uso impresa (`docs/Guía de uso - Disfraces Los Mellizos.pdf`), con su teléfono anotado en la última página.
- [ ] Su gestor de contraseñas, para guardar la clave de soporte.
- [ ] Los datos pendientes de confirmar con la dueña: mora por día, si se cobra por disfraz o por pedido, y si el precio es por evento o por día.

## Requisitos de la laptop

- Windows 10 u 11 de 64 bits, con la **sesión de Windows de la dueña** (el programa se instala para ese usuario).
- Pantalla de 1366×768 o más.
- **Google Drive para escritorio** u **OneDrive** instalado y con la cuenta de la dueña iniciada. Si no está, instálelo antes (necesita internet solo para esto).
- Opcional: AnyDesk, para darle soporte a distancia. Anote el ID.

---

## 1. Copiar el instalador

Copie el instalador desde la USB al Escritorio. Al copiarlo por USB, Windows normalmente **no** muestra el aviso de SmartScreen, que aparece con los archivos descargados de internet o recibidos por correo.

## 2. Si aparece «Windows protegió su PC» (SmartScreen)

El programa no tiene firma digital, así que Windows puede avisar. Tiene dos formas de seguir:

- En el aviso, pulse **Más información** → **Ejecutar de todas formas**.
- O antes de abrirlo: clic derecho en el instalador → **Propiedades** → marque **Desbloquear** → **Aceptar**.

Si el antivirus lo bloquea, es un falso positivo por la falta de firma. Restáurelo desde el antivirus y, si se repite, repórtelo al fabricante (en Windows Defender: *Protección contra virus y amenazas → Historial de protección*).

La dueña no verá este aviso: una vez instalado, el programa se abre todos los días sin avisos.

## 3. Instalar

1. Doble clic en el instalador. **No pide permisos de administrador.**
2. Siga los pasos: instalar → finalizar. El programa se abre solo al terminar.
3. Queda en `%LOCALAPPDATA%\Programs\Disfraces Los Mellizos\`, con accesos directos en el escritorio y en el menú Inicio.

Los **datos** van aparte, en `%LOCALAPPDATA%\SistemaDisfraces\`. Esa carpeta no se sincroniza con la nube, a propósito: una base de datos abierta no debe subirse mientras se usa. Desinstalar o reinstalar **no la toca**.

## 4. Primer uso, con la dueña al lado

El programa abre un asistente. **Usted no debe conocer las contraseñas**: que las escriba la dueña.

1. **Contraseña de la dueña.** Sugiérale una frase corta que recuerde (por ejemplo «mi gato come pan 7»). El programa rechaza las muy fáciles y le explica por qué.
2. **Contraseña de Trabajadores.** Es la que usa todo el personal y debe ser distinta de la de la dueña.
3. **Código de recuperación.** La dueña lo **anota en papel**, y el programa le pide volver a escribirlo para comprobar que lo anotó bien. Recomiéndele guardar el papel lejos de la laptop.

## 5. Definir la clave de soporte (solo usted)

La clave de soporte protege la herramienta que restablece el acceso de la dueña si pierde su contraseña y el código. Sin clave, esa herramienta no hace nada.

1. Cierre el programa (espere el «Guardando respaldo…»).
2. Pulse **Win + R** y escriba:
   ```
   "%LOCALAPPDATA%\Programs\Disfraces Los Mellizos\Disfraces Los Mellizos.exe" --definir-clave-soporte
   ```
3. En la ventana «Definir la clave de soporte»:
   - escriba la clave dos veces (al menos 12 caracteres);
   - como las cuentas ya existen, **la dueña escribe su contraseña** para autorizarla.
4. Guarde la clave en **su** gestor de contraseñas, con el nombre de la tienda. No la anote en la tienda ni la comparta.

Si más adelante la cambia, la misma herramienta le pide la clave actual.

## 6. Carpeta de respaldos en la nube

1. Abra el programa y entre como **Dueña**.
2. Vaya a **Configuración → Respaldos**.
3. Pulse **Usar Google Drive (…)** o **Usar OneDrive (…)**: el programa sugiere las carpetas que encuentra. Si no aparece ninguna, use **Elegir otra carpeta…** y elija una carpeta dentro de Google Drive o de OneDrive.
4. Compruebe que diga **«En Google Drive:»** (o OneDrive). Si dice «⚠ Esta carpeta no se sube a internet», elija otra.

## 7. Primer respaldo y primer recordatorio

1. En **Configuración → Respaldos**, pulse **Hacer un respaldo ahora**. Debe decir «guardado y verificado, en la nube y en esta computadora».
2. Pulse **Probar el último respaldo**: debe decir que está bien.
3. Con la dueña, abran **Google Drive (u OneDrive) en su celular** y busquen el archivo `Respaldo Disfraces …zip` (el nombre aparece en Inicio). Puede tardar unos minutos en subir.
4. En **Inicio**, que la dueña pulse **Sí, lo vi en mi celular**. Así aprende el recordatorio que le aparecerá una vez al mes.

## 8. Reglas del negocio

En **Configuración → Reglas del negocio**, con la dueña:

- Mora por día de retraso.
- Si la mora se cobra por cada disfraz o una sola vez por pedido.
- Días de lavado después de una devolución.
- Si el precio del alquiler es por evento o por día.

Guarde. Queda registrado quién lo cambió y cuándo.

## 9. Cierre

- [ ] La dueña entra y sale de su cuenta, y prueba «Cerrar sesión / Cambiar de usuario».
- [ ] Se entra con la cuenta **Trabajadores** y la dueña le da la contraseña al personal.
- [ ] Hay un disfraz y un cliente de prueba, o datos reales, y un pedido de prueba cancelado.
- [ ] «¿Cómo se hace?» abre la guía.
- [ ] La guía impresa, con su teléfono, queda en la tienda.
- [ ] Usted anotó: la versión instalada (en Configuración → Información), el ID de AnyDesk, la carpeta de respaldos y que la clave de soporte está en su gestor.

---

## Anexo A. Instalar una versión nueva

Los datos no se pierden: el instalador reemplaza solo el programa.

1. Genere el instalador nuevo (suba `version` en `package.json` y ejecute `npm run instalador`). Guarde también el anterior.
2. En la laptop, cierre el programa y espere «Guardando respaldo…».
3. Ejecute el instalador nuevo. Si el programa sigue abierto, el instalador pide cerrarlo.
4. Abra el programa. Si la versión nueva cambia la base de datos, **antes de cambiarla guarda solo un respaldo completo** llamado `Respaldo Disfraces … (antes de actualizar a X).zip`, en la computadora y en la nube. Se conservan los últimos 3.
5. Compruebe la versión en **Configuración → Información**.

## Anexo B. Volver a la versión anterior

Si una versión nueva da problemas:

1. Cierre el programa.
2. Ejecute el **instalador anterior**, encima del actual.
3. Abra el programa:
   - si la versión nueva no había cambiado la base de datos, abre normal y ya está;
   - si la había cambiado, la versión anterior no puede usar esos datos y abre la ventana **«Datos de una versión más nueva»**.
4. En esa ventana, elija el respaldo **«antes de actualizar a X»** (aparece primero), escriba la **clave de soporte** y pulse **Volver a este respaldo**.
   - Antes de volver, se guarda un respaldo del estado actual.
   - Se pierde lo registrado desde la actualización: anótelo con la dueña para volver a cargarlo.
   - Las contraseñas de las cuentas no cambian.
5. El programa se reinicia con los datos de antes de la actualización.

## Anexo C. La dueña perdió su contraseña y el código

Está detallado en `CLAUDE.md`, sección «Soporte». En resumen:

1. Con el programa cerrado, ejecute el `.exe` con `--restablecer-duena`.
2. Escriba la clave de soporte y la dueña anota el código nuevo.
3. Con ese código, ella elige una contraseña nueva en «¿Olvidó su contraseña?».

Al entrar verá un aviso de que su acceso fue restablecido por soporte.

## Anexo D. Nunca

- Borrar, mover o sincronizar con la nube `%LOCALAPPDATA%\SistemaDisfraces\`.
- Copiar `datos.db` a mano con el programa abierto. Para eso están los respaldos.
- Subir instaladores o datos de clientes al repositorio.

## Anexo E. Probar el instalador antes de llevarlo (Windows Sandbox)

Windows Sandbox es un Windows limpio y desechable. Necesita Windows Pro.

1. **Actívelo una sola vez:** Inicio → «Activar o desactivar las características de Windows» → marque **Espacio aislado de Windows** → reinicie.
2. Genere los instaladores: `npm run instalador` y `npm run instalador:prueba` (una 1.0.1 igual, para probar actualizar y volver atrás).
3. Ejecute `npm run sandbox`. Se abre el Sandbox y la prueba corre sola:
   1. instala la 1.0.0 y revisa los accesos directos;
   2. abre el programa y comprueba que crea los datos;
   3. actualiza a la 1.0.1 y vuelve a instalar la 1.0.0 encima;
   4. desinstala y reinstala.

   En cada paso comprueba que **los datos siguen ahí**. El resultado se abre en el Bloc de notas y queda en `release\sandbox\resultados\resultado.txt`.
4. En la misma ventana puede probar a mano el asistente y el resto. Al cerrar el Sandbox se borra todo.

Además, `npm run test:instalado` corre todas las pruebas E2E contra el programa empaquetado (`release\<versión>\win-unpacked`). Entre ellas están las de actualizar y volver atrás con datos reales.

## Dónde está cada cosa (en la laptop)

| Qué | Dónde |
|---|---|
| Programa | `%LOCALAPPDATA%\Programs\Disfraces Los Mellizos\` |
| Datos (base, fotos) | `%LOCALAPPDATA%\SistemaDisfraces\` |
| Copia local de respaldos (los últimos 7) | `%LOCALAPPDATA%\SistemaDisfraces\respaldos\` |
| Respaldos en la nube (30 días) | La carpeta elegida en Configuración → Respaldos |
| Lo que había antes de la última restauración | `%LOCALAPPDATA%\SistemaDisfraces\restauracion-anterior\` |
