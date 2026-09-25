import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { urlFoto, type EstadoFisico, type FichaModelo, type Unidad } from '../../../shared/disfraces'
import { formatearSoles, leerMonto } from '../../../shared/formato'
import { llamar, mensajeDe } from '../api'
import { VOLVER_CON_FILTROS } from './busquedaDisfraces'
import DialogoAgregarUnidades from '../componentes/disfraces/DialogoAgregarUnidades'
import DialogoUnidad from '../componentes/disfraces/DialogoUnidad'
import EtiquetaEstado from '../componentes/disfraces/EtiquetaEstado'
import { useAvisos } from '../componentes/ui/Avisos'
import Boton from '../componentes/ui/Boton'
import { CampoTexto } from '../componentes/ui/Campos'
import { useConfirmar } from '../componentes/ui/Confirmacion'

function soloNumero(centimos: number): string {
  return formatearSoles(centimos).replace('S/ ', '')
}

export default function FichaDisfraz(): React.JSX.Element {
  const id = Number(useParams().id)
  const avisos = useAvisos()
  const confirmar = useConfirmar()

  const [ficha, setFicha] = useState<FichaModelo | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [precio, setPrecio] = useState('')
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null)
  const [datos, setDatos] = useState({ nombre: '', categoria: '', descripcion: '' })
  const [categorias, setCategorias] = useState<string[]>([])
  const [agregando, setAgregando] = useState(false)
  const [unidadAbierta, setUnidadAbierta] = useState<Unidad | null>(null)

  const recargar = useCallback(async (): Promise<FichaModelo | null> => {
    try {
      const f = await llamar(window.api.modelos.obtener(id))
      setFicha(f)
      return f
    } catch (e) {
      setErrorCarga(mensajeDe(e))
      return null
    }
  }, [id])

  useEffect(() => {
    let vigente = true
    llamar(window.api.modelos.obtener(id))
      .then((f) => {
        if (!vigente) return
        setFicha(f)
        setPrecio(soloNumero(f.precioAlquiler))
        setDatos({ nombre: f.nombre, categoria: f.categoria, descripcion: f.descripcion })
      })
      .catch((e) => vigente && setErrorCarga(mensajeDe(e)))
    llamar(window.api.modelos.categorias())
      .then((c) => vigente && setCategorias(c))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [id])

  /** Ejecuta una operación, muestra el resultado y recarga la ficha. */
  const ejecutar = async (operacion: () => Promise<unknown>, exito: string): Promise<boolean> => {
    try {
      await operacion()
      avisos.exito(exito)
      await recargar()
      return true
    } catch (e) {
      avisos.error(mensajeDe(e))
      return false
    }
  }

  if (errorCarga) {
    return (
      <section>
        <Link to="/disfraces" state={VOLVER_CON_FILTROS} className="text-lg font-semibold text-blue-800 hover:underline">
          ← Volver a Disfraces
        </Link>
        <p role="alert" className="mt-4 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-lg text-red-800">
          {errorCarga}
        </p>
      </section>
    )
  }
  if (!ficha) return <p className="text-lg">Cargando…</p>

  const guardarPrecio = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const monto = leerMonto(precio)
    setErrorPrecio(monto.ok ? null : monto.error)
    if (!monto.ok) return
    if (monto.centimos === ficha.precioAlquiler) return avisos.exito('El precio no cambió.')
    const ok = await ejecutar(
      () => llamar(window.api.modelos.cambiarPrecio(ficha.id, monto.centimos)),
      `Precio actualizado a ${formatearSoles(monto.centimos)}. Se aplicará a los pedidos nuevos.`
    )
    if (ok) setPrecio(soloNumero(monto.centimos))
  }

  const guardarDatos = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    await ejecutar(() => llamar(window.api.modelos.actualizar(ficha.id, datos)), 'Datos guardados.')
  }

  const cambiarEstado = async (unidad: Unidad, estado: EstadoFisico, exito: string): Promise<void> => {
    await ejecutar(() => llamar(window.api.unidades.cambiarEstado(unidad.id, estado)), exito)
  }

  const darDeBajaUnidad = async (unidad: Unidad): Promise<void> => {
    const ok = await confirmar({
      titulo: `¿Dar de baja ${unidad.codigo}?`,
      mensaje: 'Esta unidad ya no se podrá alquilar. Su historial se conserva y la dueña puede reactivarla después.',
      textoConfirmar: 'Sí, dar de baja',
      variante: 'peligro'
    })
    if (!ok) return
    if (await ejecutar(() => llamar(window.api.unidades.cambiarEstado(unidad.id, 'baja')), `${unidad.codigo} fue dada de baja.`)) {
      setUnidadAbierta(null)
    }
  }

  const reactivarUnidad = async (unidad: Unidad): Promise<void> => {
    const ok = await confirmar({
      titulo: `¿Reactivar ${unidad.codigo}?`,
      mensaje: 'La unidad volverá a estar disponible para alquilar.',
      textoConfirmar: 'Sí, reactivar',
      variante: 'exito'
    })
    if (!ok) return
    if (await ejecutar(() => llamar(window.api.unidades.cambiarEstado(unidad.id, 'disponible')), `${unidad.codigo} fue reactivada.`)) {
      setUnidadAbierta(null)
    }
  }

  const darDeBajaModelo = async (): Promise<void> => {
    const ok = await confirmar({
      titulo: `¿Dar de baja "${ficha.nombre}"?`,
      mensaje: 'El disfraz ya no aparecerá para nuevos alquileres. No se borra nada y la dueña puede reactivarlo después.',
      textoConfirmar: 'Sí, dar de baja',
      variante: 'peligro'
    })
    if (ok) await ejecutar(() => llamar(window.api.modelos.darDeBaja(ficha.id)), `"${ficha.nombre}" fue dado de baja.`)
  }

  const reactivarModelo = async (): Promise<void> => {
    const ok = await confirmar({
      titulo: `¿Reactivar "${ficha.nombre}"?`,
      mensaje: 'El disfraz volverá a aparecer para nuevos alquileres.',
      textoConfirmar: 'Sí, reactivar',
      variante: 'exito'
    })
    if (ok) await ejecutar(() => llamar(window.api.modelos.reactivar(ficha.id)), `"${ficha.nombre}" fue reactivado.`)
  }

  const elegirFoto = async (): Promise<void> => {
    try {
      if (await llamar(window.api.modelos.elegirFoto(ficha.id))) {
        avisos.exito('Foto guardada.')
        await recargar()
      }
    } catch (e) {
      avisos.error(mensajeDe(e))
    }
  }

  const quitarFoto = async (): Promise<void> => {
    const ok = await confirmar({
      titulo: '¿Quitar la foto?',
      mensaje: 'El disfraz quedará sin foto. Puede elegir otra cuando quiera.',
      textoConfirmar: 'Sí, quitar foto',
      variante: 'peligro'
    })
    if (ok) await ejecutar(() => llamar(window.api.modelos.quitarFoto(ficha.id)), 'Foto quitada.')
  }

  const activas = ficha.unidades.filter((u) => u.estadoFisico !== 'baja')
  const deBaja = ficha.unidades.filter((u) => u.estadoFisico === 'baja')

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/disfraces" state={VOLVER_CON_FILTROS} className="text-lg font-semibold text-blue-800 hover:underline">
          ← Volver a Disfraces
        </Link>
        <h1 className="mt-2 text-3xl font-bold">
          {ficha.nombre}
          {!ficha.activo && (
            <span className="ml-3 rounded-full bg-slate-200 px-3 py-1 align-middle text-lg text-slate-700">
              Dado de baja
            </span>
          )}
        </h1>
      </div>

      <div className="grid grid-cols-[13rem_1fr] gap-6">
        <div className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            {ficha.foto ? (
              <img src={urlFoto(ficha.foto)} alt={`Foto de ${ficha.nombre}`} className="size-full object-cover" />
            ) : (
              <span className="text-lg text-slate-500">Sin foto</span>
            )}
          </div>
          <Boton variante="secundario" onClick={elegirFoto}>
            {ficha.foto ? 'Cambiar foto' : 'Elegir foto'}
          </Boton>
          {ficha.foto && (
            <Boton variante="secundario" compacto onClick={quitarFoto}>
              Quitar foto
            </Boton>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <form onSubmit={guardarPrecio} className="flex items-end gap-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
            <div className="w-56">
              <CampoTexto
                etiqueta="Precio de alquiler"
                prefijo="S/"
                valor={precio}
                onCambio={setPrecio}
                error={errorPrecio}
                entrada={{ inputMode: 'decimal', className: 'w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-2xl font-bold' }}
              />
            </div>
            <Boton type="submit">Guardar precio</Boton>
            <p className="pb-3 text-base text-slate-700">Los pedidos ya hechos conservan su precio.</p>
          </form>

          <form onSubmit={guardarDatos} className="grid grid-cols-2 gap-4 rounded-lg bg-white p-4 shadow">
            <CampoTexto etiqueta="Nombre" valor={datos.nombre} onCambio={(v) => setDatos({ ...datos, nombre: v })} />
            <CampoTexto
              etiqueta="Categoría"
              valor={datos.categoria}
              onCambio={(v) => setDatos({ ...datos, categoria: v })}
              sugerencias={categorias}
            />
            <div className="col-span-2">
              <CampoTexto
                etiqueta="Descripción"
                valor={datos.descripcion}
                onCambio={(v) => setDatos({ ...datos, descripcion: v })}
                multilinea
              />
            </div>
            <div className="col-span-2 flex justify-end">
              <Boton type="submit" variante="secundario">
                Guardar datos
              </Boton>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-lg bg-white p-4 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Unidades ({activas.length})</h2>
          <Boton onClick={() => setAgregando(true)} disabled={!ficha.activo}>
            + Agregar unidades
          </Boton>
        </div>

        {ficha.unidades.length === 0 ? (
          <p className="text-lg text-slate-700">Este disfraz todavía no tiene unidades. Agregue las que tenga por talla.</p>
        ) : (
          <table className="w-full text-left text-lg">
            <thead>
              <tr className="border-b-2 border-slate-300">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Talla</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Observaciones</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...activas, ...deBaja].map((u) => (
                <tr key={u.id} className={`border-b border-slate-200 ${u.estadoFisico === 'baja' ? 'text-slate-500' : ''}`}>
                  <td className="py-2 pr-3 font-mono font-semibold">{u.codigo}</td>
                  <td className="py-2 pr-3">{u.talla}</td>
                  <td className="py-2 pr-3">
                    <EtiquetaEstado unidad={u} />
                  </td>
                  <td className="max-w-56 truncate py-2 pr-3 text-base" title={u.observaciones}>
                    {u.observaciones}
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      {!u.alquilada && u.estadoFisico === 'disponible' && (
                        <>
                          <Boton compacto variante="secundario" onClick={() => cambiarEstado(u, 'lavanderia', `${u.codigo} enviado a lavandería.`)}>
                            A lavandería
                          </Boton>
                          <Boton compacto variante="secundario" onClick={() => cambiarEstado(u, 'reparacion', `${u.codigo} enviado a reparación.`)}>
                            A reparación
                          </Boton>
                        </>
                      )}
                      {!u.alquilada && (u.estadoFisico === 'lavanderia' || u.estadoFisico === 'reparacion') && (
                        <Boton compacto variante="exito" onClick={() => cambiarEstado(u, 'disponible', `${u.codigo} está disponible.`)}>
                          Marcar disponible
                        </Boton>
                      )}
                      <Boton compacto variante="secundario" onClick={() => setUnidadAbierta(u)}>
                        Piezas y datos
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border-2 border-slate-300 bg-white p-4">
        <p className="text-lg text-slate-700">
          {ficha.activo
            ? 'Si ya no va a alquilar este disfraz, puede darlo de baja. No se borra nada.'
            : 'Este disfraz está dado de baja y no aparece para nuevos alquileres.'}
        </p>
        {ficha.activo ? (
          <Boton variante="peligro" onClick={darDeBajaModelo}>
            Dar de baja el disfraz
          </Boton>
        ) : (
          <Boton variante="exito" onClick={reactivarModelo}>
            Reactivar el disfraz
          </Boton>
        )}
      </div>

      {agregando && (
        <DialogoAgregarUnidades
          modelo={ficha}
          onCerrar={() => setAgregando(false)}
          onGuardado={async (codigos) => {
            setAgregando(false)
            avisos.exito(codigos.length === 1 ? `Unidad ${codigos[0]} agregada.` : `${codigos.length} unidades agregadas: ${codigos.join(', ')}.`)
            await recargar()
          }}
        />
      )}

      {unidadAbierta && (
        <DialogoUnidad
          unidad={unidadAbierta}
          onCerrar={() => setUnidadAbierta(null)}
          onGuardado={async () => {
            setUnidadAbierta(null)
            avisos.exito(`${unidadAbierta.codigo} guardada.`)
            await recargar()
          }}
          onDarDeBaja={() => darDeBajaUnidad(unidadAbierta)}
          onReactivar={() => reactivarUnidad(unidadAbierta)}
        />
      )}
    </section>
  )
}
