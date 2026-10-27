"use client";

import { useState } from "react";
import { TIPO_DOCUMENTO_DIAN, TIPO_PERSONA, type ClienteFicha } from "@/lib/clientes-dian";

const siNo = (v: boolean | null) => (v === null ? "" : v ? "Sí" : "No");

/** La lista tal como se ve (con la búsqueda y el filtro puestos), en Excel. */
export function ExportarClientes({ clientes }: { clientes: ClienteFicha[] }) {
  const [trabajando, setTrabajando] = useState(false);
  if (clientes.length === 0) return null;
  return (
    <button
      type="button"
      disabled={trabajando}
      onClick={async () => {
        setTrabajando(true);
        try {
          const XLSX = await import("xlsx");
          const filas = clientes.map((c) => ({
            "Nombre / razón social": c.nombre,
            "Tipo de documento": c.tipo_documento ? `${c.tipo_documento} — ${TIPO_DOCUMENTO_DIAN[c.tipo_documento] ?? ""}` : "",
            "NIT / documento": c.nit ?? "",
            DV: c.dv ?? "",
            "Tipo de persona": c.tipo_persona ? TIPO_PERSONA[c.tipo_persona] : "",
            "Correo de facturación": c.email ?? "",
            "Correo encargado de proyecto": c.email_encargado_proyecto ?? "",
            Contacto: c.contacto ?? "",
            Teléfono: c.telefono ?? "",
            Dirección: c.direccion ?? "",
            Municipio: c.municipio ?? "",
            Departamento: c.departamento ?? "",
            "Código DANE": c.municipio_dane ?? "",
            "Responsable de IVA": siNo(c.responsable_iva),
            "Responsabilidades factura electrónica": (c.responsabilidades_fe ?? []).join("; "),
            "Responsabilidades RUT (casilla 53)": (c.responsabilidades_rut ?? []).join("; "),
            "Declarante de renta": siNo(c.declarante_renta),
            Notas: c.notas ?? "",
          }));
          const hoja = XLSX.utils.json_to_sheet(filas);
          const libro = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(libro, hoja, "Clientes");
          XLSX.writeFile(libro, `clientes-servielectro-${new Date().toISOString().slice(0, 10)}.xlsx`);
        } finally {
          setTrabajando(false);
        }
      }}
      className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-40"
    >
      {trabajando ? "Preparando…" : "Exportar a Excel"}
    </button>
  );
}
