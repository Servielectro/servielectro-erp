import { CATEGORIAS_PORTAL, ETIQUETA_CATEGORIA } from "@/lib/cliente-portal";
import { fechaEnvio } from "@/lib/sst/envio-cliente";

export interface PublicadoVisible {
  id: string;
  categoria: string;
  titulo: string;
  descripcion: string | null;
  publicado_en: string;
}

/**
 * «Lo que ve el cliente»: el portal de ESTE proyecto tal como le sale al cliente, armado con las
 * mismas reglas que sus pantallas (v_cliente_documentos agrupa por categoría en este orden y, dentro,
 * lo más reciente primero; por firmar = actas enviadas sin su firma; personal = asignado hoy). Es una
 * lectura de lo interno, sin suplantar la sesión de nadie: habilitarle el módulo «cliente» a un rol
 * interno no sirve, porque fn_cliente_actual() es NULL para él y vería todo vacío.
 */
export function LoQueVeElCliente({
  tieneCliente,
  publicados,
  porFirmar,
  personasHoy,
  usuariosActivos,
}: {
  tieneCliente: boolean;
  publicados: PublicadoVisible[];
  porFirmar: { id: string; nombre: string; enviadoEn: string }[];
  personasHoy: number;
  /** null = no se pudo saber (sin permiso de Configuración). */
  usuariosActivos: number | null;
}) {
  if (!tieneCliente) return null;
  const orden = [...publicados].sort((a, b) => b.publicado_en.localeCompare(a.publicado_en));
  const conocidas = new Set<string>(CATEGORIAS_PORTAL.map((c) => c.id));
  const grupos = CATEGORIAS_PORTAL.map((c) => ({ id: c.id as string, docs: orden.filter((d) => d.categoria === c.id) }))
    .concat([{ id: "otro", docs: orden.filter((d) => !conocidas.has(d.categoria)) }])
    .filter((g) => g.docs.length);

  return (
    <details className="mt-6 rounded-lg border border-blue-200 bg-blue-50/40">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-semibold text-slate-900">👁 Lo que ve el cliente</span>
          <span className="block text-xs text-slate-600">
            {publicados.length} documento{publicados.length === 1 ? "" : "s"} · {porFirmar.length} por firmar · {personasHoy} en obra hoy
          </span>
        </span>
        <span className="text-xs font-semibold text-slate-600 underline">Ver</span>
      </summary>
      <div className="space-y-3 border-t border-blue-200 p-3 text-sm">
        {usuariosActivos === 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Nadie de este cliente tiene usuario activo del portal: hoy nadie lo ve. Se crea en Configuración → Usuarios del portal del cliente.
          </p>
        )}
        {usuariosActivos !== null && usuariosActivos > 0 && (
          <p className="text-xs text-slate-600">
            {usuariosActivos} usuario{usuariosActivos === 1 ? "" : "s"} del cliente con acceso activo.
          </p>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Por firmar</p>
          {porFirmar.length === 0 ? (
            <p className="text-xs text-slate-500">Nada pendiente de su firma.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {porFirmar.map((a) => (
                <li key={a.id} className="rounded-md border border-amber-400 bg-white px-3 py-2">
                  <p className="font-semibold">{a.nombre}</p>
                  <p className="text-xs text-slate-600">Enviada el {fechaEnvio(a.enviadoEn)} · pendiente de su firma</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos</p>
          {grupos.length === 0 ? (
            <p className="text-xs text-slate-500">No ve ningún documento de este proyecto.</p>
          ) : (
            grupos.map((g) => (
              <div key={g.id} className="mt-2">
                <p className="text-xs font-semibold text-slate-600">
                  {ETIQUETA_CATEGORIA[g.id] ?? "Otros"} ({g.docs.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {g.docs.map((d) => (
                    <li key={d.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                      <p className="font-semibold leading-snug">{d.titulo}</p>
                      {d.descripcion && <p className="text-xs text-slate-600">{d.descripcion}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-slate-500">Personal en obra: {personasHoy === 0 ? "nadie asignado hoy" : `${personasHoy} persona${personasHoy === 1 ? "" : "s"} (ver «Personal asignado a la obra»)`}.</p>
      </div>
    </details>
  );
}
