import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIAS_PORTAL,
  COLUMNAS_DOCUMENTO_CLIENTE,
  COLUMNAS_PROYECTO_CLIENTE,
  ETIQUETA_CATEGORIA,
  fechaCorta,
  tamano,
  type DocumentoCliente,
  type ProyectoCliente,
} from "@/lib/cliente-portal";
import { AbrirArchivo } from "@/components/documentos/AbrirArchivo";

// Los documentos que alguien de Servielectro PUBLICÓ. Solo v_cliente_documentos: lo no publicado
// (o retirado) no existe para el cliente. Ver y descargar; nada más.
export default async function DocumentosClientePage({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  const { proyecto } = await searchParams;
  const supabase = await createClient();
  const [docsRes, proyectosRes] = await Promise.all([
    supabase.from("v_cliente_documentos").select(COLUMNAS_DOCUMENTO_CLIENTE).order("publicado_en", { ascending: false }),
    supabase.from("v_cliente_mis_proyectos").select(COLUMNAS_PROYECTO_CLIENTE).order("nombre"),
  ]);
  const todos = (docsRes.data ?? []) as DocumentoCliente[];
  const proyectos = (proyectosRes.data ?? []) as ProyectoCliente[];
  const elegido = proyectos.find((p) => p.id === proyecto) ?? null;
  const docs = elegido ? todos.filter((d) => d.proyecto_id === elegido.id) : todos;
  const variosProyectos = proyectos.length > 1;

  const grupos = CATEGORIAS_PORTAL.map((c) => ({ ...c, docs: docs.filter((d) => d.categoria === c.id) })).filter((g) => g.docs.length);
  // Por si la base trae una categoría nueva que esta pantalla no conoce: no se esconde.
  const conocidas = new Set<string>(CATEGORIAS_PORTAL.map((c) => c.id));
  const otras = docs.filter((d) => !conocidas.has(d.categoria));
  if (otras.length) grupos.push({ id: "otro", etiqueta: "Otros", docs: otras } as (typeof grupos)[number]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-900">Documentos del proyecto</h1>

      {variosProyectos && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip href="/cliente/documentos" activo={!elegido}>
            Todos
          </Chip>
          {proyectos.map((p) => (
            <Chip key={p.id} href={`/cliente/documentos?proyecto=${p.id}`} activo={elegido?.id === p.id}>
              {p.codigo ?? p.nombre}
            </Chip>
          ))}
        </div>
      )}
      {elegido && <p className="text-sm text-slate-600">{elegido.nombre}</p>}

      {docsRes.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudieron leer los documentos. Intenta de nuevo en un momento.</p>
      ) : docs.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-3 text-base text-slate-700">Todavía no hay documentos publicados{elegido ? " para este proyecto" : ""}.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.id} className="space-y-2">
            <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {ETIQUETA_CATEGORIA[g.id] ?? g.etiqueta} <span className="font-normal">({g.docs.length})</span>
            </h2>
            <ul className="space-y-2">
              {g.docs.map((d) => (
                <li key={d.id} className="rounded-xl border border-slate-300 bg-white p-3">
                  <p className="font-semibold leading-snug text-slate-900">{d.titulo}</p>
                  {d.descripcion && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{d.descripcion}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    {variosProyectos && !elegido ? `${d.proyecto_codigo ?? d.proyecto_nombre} · ` : ""}
                    Publicado el {fechaCorta(d.publicado_en)}
                    {d.bytes ? ` · ${tamano(d.bytes)}` : ""}
                  </p>
                  <div className="mt-2">
                    {d.formato_id ? (
                      <Link
                        href={`/cliente/documentos/formato/${d.formato_id}`}
                        className="flex min-h-12 items-center justify-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white"
                      >
                        Ver documento
                      </Link>
                    ) : d.bucket && d.path ? (
                      <AbrirArchivo bucket={d.bucket} path={d.path} titulo={d.titulo} />
                    ) : (
                      <p className="text-sm text-slate-500">El archivo no está disponible. Avísale a Servielectro.</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${
        activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
      }`}
    >
      {children}
    </Link>
  );
}
