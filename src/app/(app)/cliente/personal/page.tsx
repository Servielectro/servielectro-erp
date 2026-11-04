import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  COLUMNAS_PERSONAL_CLIENTE,
  COLUMNAS_PROYECTO_CLIENTE,
  NIVEL_ALTURAS,
  TIPO_FORMACION,
  fechaCorta,
  hoyBogota,
  type Formacion,
  type PersonalCliente,
  type ProyectoCliente,
} from "@/lib/cliente-portal";

// Ficha técnica del personal asignado a sus obras, SOLO por v_cliente_personal: nombre, documento,
// cargo y formación (alturas, capacitaciones, afiliaciones). Nunca salud, salario ni contacto.
// Para que el administrador verifique a quién deja entrar: por eso el buscador por cédula.
export default async function PersonalClientePage({ searchParams }: { searchParams: Promise<{ proyecto?: string; q?: string }> }) {
  const { proyecto, q } = await searchParams;
  const supabase = await createClient();
  const [personalRes, proyectosRes] = await Promise.all([
    supabase.from("v_cliente_personal").select(COLUMNAS_PERSONAL_CLIENTE).order("nombre"),
    supabase.from("v_cliente_mis_proyectos").select(COLUMNAS_PROYECTO_CLIENTE).order("nombre"),
  ]);
  const proyectos = (proyectosRes.data ?? []) as ProyectoCliente[];
  const elegido = proyectos.find((p) => p.id === proyecto) ?? null;
  const hoy = hoyBogota();
  const texto = (q ?? "").trim();
  const busca = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const soloDigitos = texto.replace(/\D/g, "");

  let filas = (personalRes.data ?? []) as PersonalCliente[];
  if (elegido) filas = filas.filter((f) => f.proyecto_id === elegido.id);
  if (texto) {
    filas = filas.filter(
      (f) =>
        f.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(busca) ||
        (soloDigitos.length > 0 && (f.numero_documento ?? "").replace(/\D/g, "").includes(soloDigitos)),
    );
  }
  const vigente = (f: PersonalCliente) => f.desde <= hoy && (!f.hasta || f.hasta >= hoy);
  const enObra = filas.filter(vigente);
  const otros = filas.filter((f) => !vigente(f));
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.codigo ?? p.nombre]));
  const variosProyectos = proyectos.length > 1;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-900">Personal en obra</h1>
      <p className="text-sm text-slate-600">Quién trabaja en tus instalaciones, con sus cursos y afiliaciones vigentes.</p>

      <form className="flex gap-2" action="/cliente/personal">
        {elegido && <input type="hidden" name="proyecto" value={elegido.id} />}
        <input
          name="q"
          defaultValue={texto}
          inputMode="search"
          placeholder="Buscar por nombre o cédula"
          className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
        />
        <button type="submit" className="min-h-12 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
          Buscar
        </button>
      </form>

      {variosProyectos && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip href={`/cliente/personal${texto ? `?q=${encodeURIComponent(texto)}` : ""}`} activo={!elegido}>
            Todas las obras
          </Chip>
          {proyectos.map((p) => (
            <Chip key={p.id} href={`/cliente/personal?proyecto=${p.id}${texto ? `&q=${encodeURIComponent(texto)}` : ""}`} activo={elegido?.id === p.id}>
              {p.codigo ?? p.nombre}
            </Chip>
          ))}
        </div>
      )}

      {personalRes.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">No se pudo leer el personal. Intenta de nuevo en un momento.</p>
      ) : filas.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-3 text-base text-slate-700">
          {texto ? `Nadie coincide con «${texto}». Si esa persona dice venir de Servielectro y no aparece aquí, no está asignada a tu obra.` : "Todavía no hay personal asignado."}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {enObra.map((f) => (
              <Ficha key={`${f.proyecto_id}-${f.empleado_id}-${f.desde}`} f={f} hoy={hoy} obra={variosProyectos && !elegido ? nombreProyecto.get(f.proyecto_id) : undefined} />
            ))}
          </ul>
          {enObra.length === 0 && <p className="rounded-xl bg-white px-4 py-3 text-base text-slate-700">Hoy no hay nadie asignado a la obra.</p>}
          {otros.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-slate-700">
                Fuera de las fechas de asignación ({otros.length})
              </summary>
              <ul className="mt-2 space-y-3">
                {otros.map((f) => (
                  <Ficha key={`${f.proyecto_id}-${f.empleado_id}-${f.desde}`} f={f} hoy={hoy} obra={variosProyectos && !elegido ? nombreProyecto.get(f.proyecto_id) : undefined} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Ficha({ f, hoy, obra }: { f: PersonalCliente; hoy: string; obra?: string }) {
  const formacion = (f.formacion ?? []) as Formacion[];
  const alturas = formacion.filter((x) => x.tipo === "certificado_alturas");
  const alturasVigente = alturas.some((x) => !x.vence_en || x.vence_en >= hoy);
  return (
    <li className="rounded-xl border border-slate-300 bg-white p-4">
      <p className="text-lg font-bold leading-snug text-slate-900">{f.nombre}</p>
      <p className="text-base text-slate-800">
        {f.tipo_documento ?? "CC"} {f.numero_documento ?? "—"}
      </p>
      <p className="text-sm text-slate-600">
        {f.cargo ?? "—"}
        {obra ? ` · ${obra}` : ""}
      </p>
      <p className="text-xs text-slate-500">
        Asignado desde {fechaCorta(f.desde)}
        {f.hasta ? ` hasta ${fechaCorta(f.hasta)}` : ""}
      </p>
      {alturas.length > 0 && (
        <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${alturasVigente ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
          {alturasVigente ? "✓ Curso de alturas vigente" : "✗ Curso de alturas vencido"}
        </p>
      )}
      {formacion.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Sin cursos ni afiliaciones registrados.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
          {formacion.map((x, i) => (
            <Item key={i} x={x} hoy={hoy} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Item({ x, hoy }: { x: Formacion; hoy: string }) {
  const vencido = !!x.vence_en && x.vence_en < hoy;
  // A 30 días: alcanza para que el administrador lo note antes de que se venza.
  const en30 = new Date(`${hoy}T12:00:00-05:00`);
  en30.setDate(en30.getDate() + 30);
  const pronto = !vencido && !!x.vence_en && x.vence_en <= en30.toISOString().slice(0, 10);
  const titulo = x.nombre || x.tema || TIPO_FORMACION[x.tipo] || x.tipo;
  const detalle = [
    TIPO_FORMACION[x.tipo] && TIPO_FORMACION[x.tipo] !== titulo ? TIPO_FORMACION[x.tipo] : null,
    x.nivel ? (NIVEL_ALTURAS[x.nivel] ?? x.nivel) : null,
    x.horas ? `${x.horas} h` : null,
    x.entidad,
  ].filter(Boolean);
  return (
    <li className="py-2 text-sm">
      <p className="font-semibold text-slate-900">{titulo}</p>
      {detalle.length > 0 && <p className="text-slate-600">{detalle.join(" · ")}</p>}
      <p className="text-xs">
        {x.fecha ? <span className="text-slate-500">Del {fechaCorta(x.fecha)}</span> : null}
        {x.vence_en ? (
          <span className={`ml-1 font-semibold ${vencido ? "text-red-700" : pronto ? "text-amber-700" : "text-green-700"}`}>
            {vencido ? `· Vencido el ${fechaCorta(x.vence_en)}` : `· Vigente hasta ${fechaCorta(x.vence_en)}`}
          </span>
        ) : (
          <span className="ml-1 text-slate-500">· Sin vencimiento</span>
        )}
      </p>
    </li>
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
