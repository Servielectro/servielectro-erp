import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { leerFormato } from "@/lib/sst/formato-servidor";
import { VistaFormato } from "@/components/sst/VistaFormato";
import { AccionesFormato } from "@/app/(app)/sgsst/formatos/[id]/AccionesFormato";
import { DescartarBorrador } from "@/components/DescartarBorrador";
import { SeguirEditando } from "@/components/sst/SeguirEditando";
import { EnviarAlCliente } from "@/components/sst/EnviarAlCliente";
import { FirmasActa } from "./FirmasActa";

export default async function ActaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [f, gestiona, porQueNo, trabaja, conFirmas] = await Promise.all([
    leerFormato(supabase, id),
    tienePermiso("proyectos", "responsable"),
    // Migración 92: null = se puede descartar. Sin la 92, error → no se ofrece.
    supabase.rpc("fn_formato_por_que_no_descartar", { p_formato_id: id }),
    tienePermiso("proyectos", "trabajar"),
    supabase.rpc("fn_sst_formato_tiene_firmas", { p_formato_id: id }),
  ]);
  const descartable = !porQueNo.error && porQueNo.data === null;
  if (!f || f.ambito !== "proyectos") notFound();
  // Portal del cliente (migración 137): solo las actas de un proyecto cuya plantilla pide la firma del contratante.
  const llevaContratante = f.plantilla.firmas.some((x) => x.rol === "sst_cliente");
  const [envioRes, publicadaRes] = llevaContratante
    ? await Promise.all([
        supabase.from("sst_formatos").select("proyecto_id, enviado_cliente_en").eq("id", id).maybeSingle(),
        supabase.from("cliente_portal_documentos").select("id").eq("formato_id", id).is("retirado_en", null).limit(1),
      ])
    : [null, null];
  const envio = (envioRes?.data ?? null) as { proyecto_id: string | null; enviado_cliente_en: string | null } | null;
  // Migración 139: la plantilla se cierra sola al entrar la última firma obligatoria (hoy PRY-ACTA-INICIO).
  // Ahí la firma se toma en esta pantalla, por los dos caminos (en sitio / enviar al cliente).
  const cierreAutomatico = (f.control as { cierre_automatico?: boolean } | null)?.cierre_automatico === true;
  const conFirmasAqui = cierreAutomatico && trabaja && f.estado === "borrador" && !!envio?.proyecto_id;
  const firmaPedida = (rol: string) => f.plantilla.firmas.find((x) => x.rol === rol);
  const firmo = (rol: string) => f.firmas.some((x) => x.rol === rol);
  const otrasFaltan = f.plantilla.firmas
    .filter((x) => x.rol !== "responsable_sst" && x.rol !== "sst_cliente" && x.obligatoria !== false && !firmo(x.rol))
    .map((x) => x.etiqueta);
  const r = f.respuestas as Record<string, unknown>;
  const txt = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  type Yo = { nombre: string | null; cedula: string | null };
  const yo: Yo | null = await (async () => {
    if (!conFirmasAqui || (txt("contratista_nombre") && txt("contratista_cedula"))) return null;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    return (await supabase.from("perfiles").select("nombre, cedula").eq("id", u.user.id).maybeSingle()).data as Yo | null;
  })();
  // Editable = lo que dice el registro, igual que la base: borrador y sin ninguna firma.
  const editable = trabaja && f.estado === "borrador" && !conFirmas.error && conFirmas.data === false && f.firmas.length === 0;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/proyectos/actas" className="text-sm text-slate-600 underline">
          ← Actas de obra
        </Link>
        <Link href={`/proyectos/actas/${id}/imprimir`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">
          PDF / Imprimir
        </Link>
      </div>
      {editable && <SeguirEditando href={`/actas/campo?formato=${id}`} />}
      {envio?.proyecto_id && (
        <EnviarAlCliente
          formatoId={id}
          estado={f.estado}
          enviadoEn={envio.enviado_cliente_en}
          firmoContratante={f.firmas.some((x) => x.rol === "sst_cliente")}
          publicada={!!publicadaRes?.data?.length}
          puedeEnviar={trabaja}
          sinBotonEnviar={cierreAutomatico}
        />
      )}
      {conFirmasAqui && (
        <FirmasActa
          formatoId={id}
          etiquetas={{
            contratista: firmaPedida("responsable_sst")?.etiqueta ?? "Por el contratista",
            contratante: firmaPedida("sst_cliente")?.etiqueta ?? "Por el contratante",
          }}
          contratistaFirmo={firmo("responsable_sst")}
          contratanteFirmo={firmo("sst_cliente")}
          enviada={!!envio?.enviado_cliente_en}
          otrasFaltan={otrasFaltan}
          // Precargado de lo que dice el acta (lo llenó quien la preparó); se corrige antes de firmar.
          inicialContratista={{
            nombre: txt("contratista_nombre") || yo?.nombre || "",
            documento: txt("contratista_cedula") || yo?.cedula || "",
            cargo: "Representante legal",
            empresa: "Servielectro SAS",
          }}
          inicialContratante={{
            nombre: txt("contratante_nombre"),
            documento: txt("contratante_cedula"),
            cargo: txt("contratante_calidad"),
            empresa: txt("contratante_razon_social"),
          }}
        />
      )}
      <VistaFormato f={f} />
      {descartable && <DescartarBorrador funcion="fn_descartar_formato" id={id} que="el acta" volverA="/proyectos/actas" />}
      <AccionesFormato id={id} estado={f.estado} gestiona={gestiona} ambito="proyectos" />
    </div>
  );
}
