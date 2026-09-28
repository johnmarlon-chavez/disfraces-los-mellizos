import GuiaDeUso from '../guia/GuiaDeUso'

/** "¿Cómo se hace?": la guía de uso, dentro del programa (funciona sin internet). */
export default function Ayuda(): React.JSX.Element {
  return (
    <section className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">¿Cómo se hace?</h1>
        <p className="text-lg text-slate-700">La guía de uso del programa. Su técnico también se la puede dar impresa.</p>
      </div>
      <GuiaDeUso />
    </section>
  )
}
