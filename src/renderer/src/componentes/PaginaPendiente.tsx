interface Props {
  titulo: string
  descripcion: string
}

/** Marcador para secciones que se construyen en fases posteriores. */
export default function PaginaPendiente({ titulo, descripcion }: Props): React.JSX.Element {
  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{titulo}</h1>
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-lg text-slate-700">
        {descripcion}
      </p>
    </section>
  )
}
