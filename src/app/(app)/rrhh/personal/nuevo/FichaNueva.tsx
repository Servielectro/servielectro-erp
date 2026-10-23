"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PESTANAS, TIPO_CONTRATO, type Pestana } from "@/lib/personal";
import { fechaCorta } from "@/lib/rrhh-registros";
import { AvisoPrevia, FICHA_VACIA, TabDatos } from "../TabDatos";
import { TabAccesos, TabDotacion, TabHojaVida, type ArchivoEmpleado, type Entrega, type Herramienta } from "../TabsFicha";
import { TabCajaMenor, TabDesprendible, TabSueldo, type Desprendible, type LineaCaja, type Liquidacion, type ReciboCaja, type SoporteCaja } from "../TabsPagos";

export interface DatosFichaNueva {
  personas: { id: string; nombre: string }[];
  enlazados: string[];
  herramientas: Herramienta[];
  proyectos: { id: string; codigo: string; nombre: string }[];
  auxilioEmpresa: number | null;
  // Después de crear la ficha (misma pantalla, ?id=…):
  perfilId: string | null;
  archivos: ArchivoEmpleado[];
  entregas: Entrega[];
  liquidaciones: Liquidacion[];
  desprendibles: Desprendible[];
  recibos: ReciboCaja[];
  lineas: LineaCaja[];
  soportes: SoporteCaja[];
  contratos: { id: string; tipo: string; clase: string; estado: string; fecha_inicio: string | null; fecha_fin: string | null }[];
}

/**
 * Nuevo empleado con las 8 pestañas navegables desde el principio (Jhojan: "deja todo
 * habilitado para yo mostrarle a RRHH como queda todo el panel"). Se ve y se llena todo; lo que
 * no se puede es GUARDAR en las otras pestañas hasta crear la ficha (no existe el empleado al que
 * colgar un archivo o un desprendible), y cada botón lo dice en texto visible.
 *
 * Todas las pestañas quedan montadas (ocultas, no desmontadas): cambiar de pestaña no borra lo
 * escrito. Al guardar los datos se sigue en esta misma pantalla con ?id=… (Next conserva el estado
 * de la página cuando solo cambian los parámetros), así lo escrito en las demás pestañas sigue ahí
 * y ya se puede guardar.
 */
export function FichaNueva({ id, hoy, datos, salario }: { id: string | null; hoy: string; datos: DatosFichaNueva; salario: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<Pestana>("datos");
  const previa = !id;
  const e = id ?? "";

  return (
    <>
      {previa ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          <p className="text-sm font-semibold">Vista previa: puedes recorrer y llenar todas las pestañas.</p>
          <p className="text-sm">
            Lo de las demás pestañas se guarda después de crear la ficha: primero toca “Guardar ficha” en Datos. Lo que ya hayas escrito en las otras
            pestañas no se borra; queda ahí para guardarlo.
          </p>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-green-900">
          <p className="text-sm font-semibold">Ficha creada: ya se guarda en todas las pestañas.</p>
          <p className="text-sm">
            Lo que habías escrito en las otras pestañas sigue ahí, pero no está guardado hasta que toques su botón.{" "}
            <Link href={`/rrhh/personal/${id}`} className="font-semibold underline">
              Ir a la ficha completa (foto, carnet y ficha PDF)
            </Link>
          </p>
        </div>
      )}

      <nav className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1" aria-label="Pestañas de la ficha">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-current={p.id === tab ? "page" : undefined}
            onClick={() => setTab(p.id)}
            className={`flex min-h-11 shrink-0 items-center rounded-md border px-3 text-xs font-semibold ${
              p.id === tab ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </nav>

      <div hidden={tab !== "datos"}>
        <TabDatos
          id={id ?? undefined}
          inicial={FICHA_VACIA}
          auxilioEmpresa={datos.auxilioEmpresa}
          auxilioPropio={null}
          onCreado={(nuevo) => router.replace(`/rrhh/personal/nuevo?id=${nuevo}`, { scroll: false })}
        />
      </div>
      <div hidden={tab !== "hoja"}>
        <TabHojaVida empleadoId={e} notas="" archivos={datos.archivos} previa={previa} />
      </div>
      <div hidden={tab !== "contrato"}>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Los contratos se arman en RRHH → Contratos laborales desde una plantilla (con sus cláusulas, pólizas y cronograma) y se asocian a esta ficha.
          </p>
          {previa ? (
            <p>
              <span className="inline-flex min-h-11 items-center rounded-lg bg-slate-300 px-4 text-sm font-semibold text-white">+ Generar contrato para esta persona</span>
              <AvisoPrevia />
            </p>
          ) : (
            <Link href={`/rrhh/contratos/nuevo?empleado=${id}`} className="flex min-h-11 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
              + Generar contrato para esta persona
            </Link>
          )}
          <Link href="/rrhh/contratos/plantillas" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#A82323] underline">
            Ver las plantillas y sus cláusulas
          </Link>
          {!previa && (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
              {datos.contratos.length === 0 && <li className="p-3 text-xs text-slate-500">Sin contratos todavía.</li>}
              {datos.contratos.map((c) => (
                <li key={c.id}>
                  <Link href={`/rrhh/contratos/${c.id}`} className="block p-3 text-sm">
                    <p className="font-semibold">{TIPO_CONTRATO[c.tipo] ?? c.tipo}</p>
                    <p className="text-xs text-slate-600">
                      {c.estado}
                      {c.fecha_inicio ? ` · desde ${fechaCorta(c.fecha_inicio)}` : ""}
                      {c.fecha_fin ? ` hasta ${fechaCorta(c.fecha_fin)}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div hidden={tab !== "accesos"}>
        <TabAccesos empleadoId={e} perfilId={datos.perfilId} personas={datos.personas} enlazados={datos.enlazados} previa={previa} />
      </div>
      <div hidden={tab !== "dotacion"}>
        <TabDotacion
          empleadoId={e}
          tallas={{ talla_camisa: "", talla_pantalon: "", talla_botas: "" }}
          entregas={datos.entregas}
          herramientas={datos.herramientas}
          hoy={hoy}
          previa={previa}
        />
      </div>
      <div hidden={tab !== "sueldo"}>
        <TabSueldo empleadoId={e} perfilId={datos.perfilId} liquidaciones={datos.liquidaciones} salario={salario} previa={previa} />
      </div>
      <div hidden={tab !== "desprendible"}>
        <TabDesprendible empleadoId={e} perfilId={datos.perfilId} desprendibles={datos.desprendibles} hoy={hoy} previa={previa} />
      </div>
      <div hidden={tab !== "caja"}>
        <TabCajaMenor
          empleadoId={e}
          recibos={datos.recibos}
          lineas={datos.lineas}
          soportes={datos.soportes}
          proyectos={datos.proyectos}
          hoy={hoy}
          previa={previa}
        />
      </div>
    </>
  );
}
