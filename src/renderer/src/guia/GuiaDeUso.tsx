// Guía de uso para la dueña: la misma se ve en "¿Cómo se hace?" y se imprime como PDF
// (npm run guia:pdf). Las capturas las genera npm run capturas con datos de prueba y van dentro
// del programa, así que funciona sin internet.
import type { ReactNode } from 'react'
import { NOMBRE_TIENDA } from '../../../shared/constantes'
import capturaDevolucion from './capturas/devolucion.jpg'
import capturaEntregar from './capturas/entregar.jpg'
import capturaGuardando from './capturas/guardando.jpg'
import capturaIngreso from './capturas/ingreso.jpg'
import capturaInicio from './capturas/inicio.jpg'
import capturaPedido from './capturas/pedido.jpg'

function Seccion({ id, titulo, children, captura, pie }: { id: string; titulo: string; children: ReactNode; captura?: string; pie?: string }): React.JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="guia-seccion flex flex-col gap-3 rounded-xl bg-white p-6 shadow">
      <h2 id={`${id}-titulo`} className="text-2xl font-bold">
        {titulo}
      </h2>
      <div className="flex flex-col gap-2 text-lg leading-relaxed">{children}</div>
      {captura && (
        <figure className="m-0 flex flex-col gap-1">
          <img src={captura} alt={pie ?? ''} className="w-full max-w-3xl rounded-lg border-2 border-slate-300" />
          {pie && <figcaption className="text-base text-slate-600">{pie}</figcaption>}
        </figure>
      )}
    </section>
  )
}

/** Botón o texto de la pantalla, tal como aparece. */
const B = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <strong className="rounded bg-slate-100 px-1.5 py-0.5 whitespace-nowrap">{children}</strong>
)

const Pasos = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <ol className="flex list-decimal flex-col gap-1.5 pl-7">{children}</ol>
)
const Puntos = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <ul className="flex list-disc flex-col gap-1.5 pl-7">{children}</ul>
)

export const SECCIONES = [
  ['entrar', 'Abrir el programa y entrar'],
  ['inicio', 'Cada mañana: la pantalla de Inicio'],
  ['pedido', 'Registrar un pedido'],
  ['entregar', 'Entregar los disfraces'],
  ['devolucion', 'Recibir la devolución'],
  ['duena', 'Lo que solo hace la dueña'],
  ['cerrar', 'Al terminar el día: cerrar el programa'],
  ['respaldos', 'Sus respaldos y el celular'],
  ['contrasenas', 'Contraseñas y el papel con el código'],
  ['tecnico', 'Cuándo llamar a su técnico']
] as const

export default function GuiaDeUso({ impresion = false }: { impresion?: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      {impresion && (
        <header className="flex flex-col gap-1">
          <p className="text-lg text-slate-600">{NOMBRE_TIENDA}</p>
          <h1 className="text-4xl font-bold">Guía de uso del programa</h1>
          <p className="text-lg">Lo necesario para el trabajo de todos los días, paso a paso.</p>
        </header>
      )}
      <nav aria-label="Temas de la guía" className="guia-indice rounded-xl bg-white p-5 shadow">
        <p className="mb-2 text-lg font-bold">Temas</p>
        <ol className="grid list-decimal grid-cols-2 gap-x-8 gap-y-1 pl-7 text-lg">
          {SECCIONES.map(([id, titulo]) => (
            <li key={id}>{impresion ? titulo : <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-blue-800 underline">{titulo}</a>}</li>
          ))}
        </ol>
      </nav>

      <Seccion id="entrar" titulo="1. Abrir el programa y entrar" captura={capturaIngreso} pie="La pantalla de ingreso: elija quién entra y escriba la contraseña.">
        <Pasos>
          <li>Haga doble clic en el ícono <B>Disfraces Los Mellizos</B> del escritorio.</li>
          <li>Elija quién entra: <B>Dueña</B> o <B>Trabajadores</B>.</li>
          <li>Escriba la contraseña y pulse <B>Entrar</B>. Con <B>👁 Ver</B> puede mirar lo que escribió.</li>
        </Pasos>
        <Puntos>
          <li>Para que entre otra persona, use <B>Cerrar sesión / Cambiar de usuario</B>, abajo a la izquierda.</li>
          <li>Si se equivoca 5 veces seguidas, el programa le pide esperar un momento. Es por seguridad.</li>
          <li>Si la dueña no usa el programa por 10 minutos, su sesión se cierra sola. Un minuto antes aparece <B>¿Sigue ahí?</B>: pulse <B>Seguir en la sesión</B> si sigue trabajando.</li>
        </Puntos>
      </Seccion>

      <Seccion id="inicio" titulo="2. Cada mañana: la pantalla de Inicio" captura={capturaInicio} pie="Inicio: arriba lo más urgente.">
        <Puntos>
          <li><strong>Lo rojo es lo urgente:</strong> disfraces que ya debían volver, con el teléfono del cliente y cuánto debería de mora.</li>
          <li>Después, las <strong>entregas y devoluciones de hoy</strong> y los disfraces que faltan confeccionar.</li>
          <li>Cuando los trajes de <strong>lavandería</strong> estén limpios, márquelos como disponibles desde aquí.</li>
          <li>Haga clic en un pedido para abrirlo.</li>
        </Puntos>
      </Seccion>

      <Seccion id="pedido" titulo="3. Registrar un pedido" captura={capturaPedido} pie="El pedido funciona como un carrito: el total, el adelanto y el saldo se ven siempre a la derecha.">
        <Pasos>
          <li>Vaya a <B>Alquileres</B> y pulse <B>+ Nuevo pedido</B>.</li>
          <li>Busque al cliente por nombre, DNI o colegio. Si es nuevo, regístrelo ahí mismo.</li>
          <li>Elija la fecha de <B>Salida</B>, la de <B>Devolución</B> y el <B>Evento</B> (Día de la Madre, Fiestas Patrias…).</li>
          <li>Busque el disfraz, elija la talla, escriba la cantidad y pulse <B>Agregar al pedido</B>. Solo aparecen los que están libres en esas fechas.</li>
          <li>Escriba el <B>Adelanto</B> y pulse <B>Guardar reserva</B>.</li>
        </Pasos>
        <Puntos>
          <li>Si no alcanzan, el programa le dice cuántos faltan y ofrece dejarlos <strong>por confeccionar</strong>. El pedido se guarda igual.</li>
          <li>Para un descuento, cambie el precio del disfraz dentro del pedido. El precio general no cambia.</li>
        </Puntos>
      </Seccion>

      <Seccion id="entregar" titulo="4. Entregar los disfraces" captura={capturaEntregar} pie="El pedido, con el botón para entregar.">
        <Pasos>
          <li>Abra el pedido (desde Inicio o desde Alquileres) y pulse <B>Entregar</B>.</li>
          <li>Cobre el saldo. Puede usar varios medios: efectivo, Yape, Plin, transferencia o tarjeta.</li>
          <li>Registre la garantía: dinero o el DNI que queda en prenda.</li>
          <li>Confirme con el botón <B>Entregar … disfraces</B> (dice cuántos salen).</li>
        </Pasos>
        <Puntos>
          <li>Si el colegio se lleva solo una parte, marque solo esos disfraces. El resto se entrega después con <B>Entregar los que faltan</B>.</li>
          <li>Si el cliente viene antes de la fecha, use <B>Entregar hoy (adelantar la salida)</B>.</li>
        </Puntos>
      </Seccion>

      <Seccion id="devolucion" titulo="5. Recibir la devolución" captura={capturaDevolucion} pie="La devolución: a la derecha, el resumen con la mora, los cargos y cuánto devolver o cobrar.">
        <Pasos>
          <li>En el pedido, pulse <B>Registrar devolución</B>.</li>
          <li>Marque los disfraces que volvieron. Con <B>Revisar piezas y daños</B>, desmarque las piezas que no volvieron.</li>
          <li>Mire el resumen: el programa calcula la mora y los cargos, y le dice <strong>cuánto devolver</strong> de la garantía o <strong>cuánto falta cobrar</strong>.</li>
          <li>Pulse <B>Registrar devolución de …</B> (dice cuántos volvieron).</li>
        </Pasos>
        <Puntos>
          <li>Si el colegio devuelve en partes, registre cada parte. El pedido muestra cuántos faltan (por ejemplo, &quot;Faltan 3 de 30&quot;).</li>
          <li>Si el cliente no paga lo que falta, el pedido se cierra igual con <strong>&quot;Debe S/ …&quot;</strong> y el DNI queda retenido hasta que pague.</li>
        </Puntos>
      </Seccion>

      <Seccion id="duena" titulo="6. Lo que solo hace la dueña">
        <Puntos>
          <li>Ver los <B>Reportes</B> y cambiar la <B>Configuración</B>: solo aparecen con la cuenta de la dueña.</li>
          <li>Dar de baja un disfraz, rebajar o perdonar una mora, entregar con saldo pendiente: si está abierta la cuenta de Trabajadores, el programa <strong>pide la contraseña de la dueña</strong> en ese momento, sin cerrar la sesión.</li>
        </Puntos>
      </Seccion>

      <Seccion id="cerrar" titulo="7. Al terminar el día: cerrar el programa" captura={capturaGuardando} pie="Al cerrar, espere este mensaje: el programa se cierra solo.">
        <Pasos>
          <li>Cierre el programa con la <B>X</B> de arriba a la derecha.</li>
          <li>Aparece <B>Guardando respaldo…</B>. Espere unos segundos: se cierra solo.</li>
        </Pasos>
        <Puntos>
          <li>Si aparece <B>No se pudo guardar el respaldo</B>, pulse <B>Reintentar</B>. Si vuelve a salir, pulse <B>Cerrar igual</B>: queda una copia en la laptop. Si pasa varios días seguidos, avise a su técnico.</li>
          <li>Si se apaga la laptop con el programa abierto, no se pierde casi nada: el programa guarda un respaldo cada 2 horas y otro al volver a abrirlo.</li>
        </Puntos>
      </Seccion>

      <Seccion id="respaldos" titulo="8. Sus respaldos y el celular">
        <Puntos>
          <li>Los respaldos se guardan solos en su Google Drive u OneDrive. Si se pierde o se daña la laptop, ahí están sus datos.</li>
          <li><strong>Una vez al mes</strong>, Inicio le pide revisar en su celular que llegó el último respaldo. Abra Google Drive u OneDrive en el celular, busque el archivo con el nombre que le muestra (empieza con &quot;Respaldo Disfraces&quot;) y pulse <B>Sí, lo vi en mi celular</B>.</li>
          <li>Si Inicio muestra un <strong>aviso rojo de respaldos</strong> que no se va, llame a su técnico.</li>
        </Puntos>
      </Seccion>

      <Seccion id="contrasenas" titulo="9. Contraseñas y el papel con el código">
        <Puntos>
          <li>Guarde el papel con el <strong>código de recuperación</strong> en un lugar seguro, lejos de la laptop. Nadie más debe verlo.</li>
          <li>¿Olvidó su contraseña? En la pantalla de ingreso elija <B>Dueña</B>, pulse <B>¿Olvidó su contraseña?</B> y escriba el código del papel. Luego <strong>anote el código nuevo</strong> que le muestra: el anterior ya no sirve.</li>
          <li>Si alguien deja de trabajar en la tienda, cambie la contraseña de Trabajadores en <B>Configuración</B> → <B>Contraseña de Trabajadores</B>.</li>
          <li>Si su técnico restablece su acceso, al entrar verá un aviso con la fecha. Si usted no lo pidió, llámelo.</li>
        </Puntos>
      </Seccion>

      <Seccion id="tecnico" titulo="10. Cuándo llamar a su técnico">
        <Puntos>
          <li>Un aviso rojo de respaldos que no se va.</li>
          <li>Perdió la contraseña <strong>y</strong> el papel con el código.</li>
          <li>Ve el aviso &quot;Los datos del programa están en una carpeta que se sincroniza…&quot;.</li>
          <li>Cualquier mensaje que no entienda. No borre ni mueva carpetas del programa.</li>
        </Puntos>
        {impresion && (
          <p className="mt-4 text-xl">
            Teléfono de su técnico: <span className="inline-block w-72 border-b-2 border-slate-400">&nbsp;</span>
          </p>
        )}
      </Seccion>
    </div>
  )
}
