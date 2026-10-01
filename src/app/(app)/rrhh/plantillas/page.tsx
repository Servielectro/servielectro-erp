import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tienePermiso } from "@/lib/permisos";
import { PlantillasAdmin, type PlantillaUI } from "./PlantillasAdmin";

export default async function PlantillasPage() {
  const supabase = await createClient();
  const [puedeSubir, plantillasRes, versionesRes] = await Promise.all([
    tienePermiso("rrhh", "trabajar"),
    supabase.from("plantillas_documento").select("id, nombre, tipo, created_at").order("nombre"),
    supabase
      .from("plantilla_versiones")
      .select("id, plantilla_id, version, nombre_archivo, tamano_bytes, vigente, notas, subida_en")
      .order("version", { ascending: false }),
  ]);

  const error = plantillasRes.error?.message ?? versionesRes.error?.message ?? null;
  const versiones = (versionesRes.data ?? []) as {
    id: string;
    plantilla_id: string;
    version: number;
    nombre_archivo: string;
    tamano_bytes: number | null;
    vigente: boolean;
    notas: string | null;
    subida_en: string;
  }[];
  const plantillas: PlantillaUI[] = ((plantillasRes.data ?? []) as {
    id: string;
    nombre: string;
    tipo: string;
  }[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    versiones: versiones
      .filter((v) => v.plantilla_id === p.id)
      .map((v) => ({
        id: v.id,
        version: v.version,
        nombreArchivo: v.nombre_archivo,
        tamanoBytes: v.tamano_bytes,
        vigente: v.vigente,
        notas: v.notas,
        subidaEn: v.subida_en,
      })),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <Link href="/rrhh" className="mb-2 inline-block text-sm text-slate-600">
        ← RRHH
      </Link>
      <h1 className="mb-1 text-center text-sm font-bold text-slate-900 sm:text-base">
        Plantillas de documentos
      </h1>
      <p className="mb-4 text-center text-xs text-slate-500">
        Cada versión subida se conserva: subir una nueva la deja vigente y la anterior queda
        en el historial. Nada se borra.
      </p>
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las plantillas ({error}). Si dice que no encuentra la tabla,
          falta correr la migración 35 en Supabase.
        </p>
      )}
      <PlantillasAdmin plantillas={plantillas} puedeSubir={puedeSubir} />
    </div>
  );
}
