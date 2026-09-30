// Módulo Licitaciones — EN CONSTRUCCIÓN. Jhojan tiene un motor con GPT que busca
// licitaciones en SECOP II; se define cuando traiga ese contexto. Nada de lógica ni
// modelo de datos todavía (a propósito).
export default function LicitacionesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
      <h1 className="mb-4 text-center text-sm font-bold text-slate-900 sm:text-base">
        Licitaciones
      </h1>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-3xl">🚧</p>
        <p className="mt-2 text-base font-semibold text-amber-900">En construcción</p>
        <p className="mt-2 text-sm text-amber-800">
          Aquí va a vivir la búsqueda de licitaciones en SECOP II relacionadas con lo que
          hace Servielectro. El módulo se arma cuando se integre el motor de búsqueda.
        </p>
      </div>
    </div>
  );
}
