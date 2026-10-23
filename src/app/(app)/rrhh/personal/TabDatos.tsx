"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ESTADO_LABORAL, TIPOS_DOC_IDENTIDAD, TIPO_CONTRATO, TITULACIONES, type Empleado } from "@/lib/personal";
import { leerMonto, pesos } from "@/lib/rrhh-registros";

const C = "mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const L = "block text-xs text-slate-600";

type Campos = Omit<Empleado, "id" | "perfil_id" | "foto_path" | "notas_hoja_vida" | "talla_camisa" | "talla_pantalon" | "talla_botas" | "salario_base" | "bonificacion" | "rodamiento"> & {
  salario_base: string;
  bonificacion: string;
  rodamiento: string;
};

export const FICHA_VACIA: Campos = {
  primer_nombre: "",
  otros_nombres: "",
  primer_apellido: "",
  segundo_apellido: "",
  tipo_documento: "CC",
  numero_documento: "",
  codigo_interno: "",
  titulacion: "",
  mostrar_titulacion_carnet: false,
  cargo: "",
  area: "",
  estado_laboral: "activo",
  correo: "",
  telefono: "",
  ciudad: "",
  direccion: "",
  municipio_dane: "",
  fecha_nacimiento: "",
  rh: "",
  eps: "",
  afp: "",
  arl: "",
  caja_compensacion: "",
  contacto_emergencia: "",
  telefono_emergencia: "",
  fecha_ingreso: "",
  fecha_retiro: "",
  motivo_retiro: "",
  salario_base: "",
  bonificacion: "",
  rodamiento: "",
  detalle_bonificacion: "",
  tipo_contrato: "indefinido",
  aplica_auxilio_transporte: true,
  salario_integral: false,
};

export function camposDe(e: Empleado): Campos {
  const s = (v: string | null) => v ?? "";
  const n = (v: number | null) => (v === null || v === undefined ? "" : String(Math.round(Number(v))));
  // Solo los campos de esta pestaña (no la foto, las tallas ni el usuario enlazado).
  const fila = e as unknown as Record<string, unknown>;
  return {
    ...FICHA_VACIA,
    ...Object.fromEntries(Object.keys(FICHA_VACIA).map((k) => [k, fila[k] === null || fila[k] === undefined ? "" : fila[k]])),
    titulacion: s(e.titulacion),
    tipo_contrato: s(e.tipo_contrato),
    salario_base: n(e.salario_base),
    bonificacion: n(e.bonificacion),
    rodamiento: n(e.rodamiento),
  } as Campos;
}

export function TabDatos({
  id,
  inicial,
  auxilioEmpresa,
  auxilioPropio,
  onCreado,
}: {
  /** Nuevo empleado: al crear la ficha se avisa acá y se sigue en la misma pantalla. */
  onCreado?: (id: string) => void;
  id?: string;
  inicial: Campos;
  /** Auxilio vigente en Parámetros de liquidación (null si no está cargado). */
  auxilioEmpresa: number | null;
  /** Valor propio de esta persona (empleado_parametros), si lo tiene. */
  auxilioPropio: number | null;
}) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [auxilio, setAuxilio] = useState(auxilioPropio === null ? "" : String(Math.round(auxilioPropio)));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, empezar] = useTransition();
  const cambiar = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setGuardado(false);
    setD((p) => ({ ...p, [k]: v }));
  };
  const texto = (k: keyof Campos, etiqueta: string, extra?: { placeholder?: string; tipo?: string; ayuda?: string }) => (
    <label className={L}>
      {etiqueta}
      <input
        type={extra?.tipo ?? "text"}
        value={String(d[k] ?? "")}
        onChange={(e) => cambiar(k, e.target.value as never)}
        placeholder={extra?.placeholder}
        className={C}
      />
      {extra?.ayuda && <span className="mt-0.5 block text-xs text-slate-500">{extra.ayuda}</span>}
    </label>
  );
  const dinero = (k: "salario_base" | "bonificacion" | "rodamiento", etiqueta: string, ayuda?: string) => {
    const v = leerMonto(d[k]);
    return (
      <label className={L}>
        {etiqueta}
        <input value={d[k]} onChange={(e) => cambiar(k, e.target.value)} inputMode="numeric" placeholder="$ 0" className={C} />
        <span className="mt-0.5 block text-xs text-slate-500">{v !== null ? pesos(v) : (ayuda ?? "")}</span>
      </label>
    );
  };

  const falta = !d.primer_nombre.trim()
    ? "Falta el primer nombre."
    : !d.primer_apellido.trim()
      ? "Falta el primer apellido."
      : !d.numero_documento.trim()
        ? "Falta el número de documento."
        : !String(d.direccion ?? "").trim()
          ? "Falta la dirección."
          : !d.fecha_ingreso
            ? "Falta la fecha de ingreso."
            : leerMonto(d.salario_base) === null
              ? "Falta el salario base."
              : d.municipio_dane && !/^\d{5}$/.test(d.municipio_dane)
                ? "El municipio DANE son 5 dígitos (ej. 11001 para Bogotá)."
                : auxilio.trim() && leerMonto(auxilio) === null
                  ? "El valor del auxilio no es un número."
                  : null;

  function guardar() {
    if (falta) return;
    setError(null);
    empezar(async () => {
      const nulo = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);
      const fila: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d)) fila[k] = nulo(v);
      fila.salario_base = leerMonto(d.salario_base);
      fila.bonificacion = leerMonto(d.bonificacion);
      fila.rodamiento = leerMonto(d.rodamiento);
      const supabase = createClient();
      let empleadoId = id;
      if (id) {
        const { error: e } = await supabase.from("empleados").update(fila).eq("id", id);
        if (e) return setError(traducir(e.message));
      } else {
        const { data, error: e } = await supabase.from("empleados").insert(fila).select("id").single();
        if (e) return setError(traducir(e.message));
        empleadoId = data.id;
      }
      // Auxilio propio: con valor, sobrescribe el de la empresa; vacío, vuelve a heredar.
      const valor = leerMonto(auxilio);
      if (valor !== null) {
        const { error: e } = await supabase
          .from("empleado_parametros")
          .upsert({ empleado_id: empleadoId, clave: "auxilio_transporte", valor }, { onConflict: "empleado_id,clave" });
        if (e) return setError(e.message);
      } else if (auxilioPropio !== null) {
        const { error: e } = await supabase.from("empleado_parametros").delete().eq("empleado_id", empleadoId).eq("clave", "auxilio_transporte");
        if (e) return setError(e.message);
      }
      if (!id) {
        if (onCreado) return onCreado(empleadoId!);
        return router.push(`/rrhh/personal/${empleadoId}?creado=1`);
      }
      setGuardado(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
      <Bloque titulo="Identificación">
        <div className="grid grid-cols-2 gap-2">
          {texto("primer_nombre", "Primer nombre *")}
          {texto("otros_nombres", "Otros nombres")}
          {texto("primer_apellido", "Primer apellido *")}
          {texto("segundo_apellido", "Segundo apellido", { placeholder: "Si no tiene, se usa el primero" })}
          <label className={L}>
            Tipo doc.
            <select value={d.tipo_documento} onChange={(e) => cambiar("tipo_documento", e.target.value)} className={C}>
              {TIPOS_DOC_IDENTIDAD.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {texto("numero_documento", "Número *")}
          {texto("codigo_interno", "Código interno", { placeholder: "001" })}
          <label className={L}>
            Titulación
            <select value={d.titulacion ?? ""} onChange={(e) => cambiar("titulacion", e.target.value)} className={C}>
              {TITULACIONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                  {t.abreviatura ? ` — ${t.abreviatura}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={d.mostrar_titulacion_carnet} onChange={(e) => cambiar("mostrar_titulacion_carnet", e.target.checked)} className="mt-0.5" />
          Mostrar la titulación junto al nombre en el carnet (Ing., Tnlgo.…). Si no, queda solo como registro en la ficha.
        </label>
      </Bloque>

      <Bloque titulo="Cargo">
        <div className="grid grid-cols-2 gap-2">
          {texto("cargo", "Cargo en la compañía", { placeholder: "Soporte y Gerencia" })}
          {texto("area", "Área", { placeholder: "Operaciones, admin…" })}
          <label className={L}>
            Estado laboral
            <select value={d.estado_laboral} onChange={(e) => cambiar("estado_laboral", e.target.value)} className={C}>
              {Object.entries(ESTADO_LABORAL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          El rol de menú no está en la ficha: es el rol del usuario del ERP enlazado (pestaña Accesos), y no se toma del cargo.
        </p>
      </Bloque>

      <Bloque titulo="Contacto">
        <div className="grid grid-cols-2 gap-2">
          {texto("correo", "Correo", { tipo: "email" })}
          {texto("telefono", "Teléfono", { tipo: "tel" })}
          {texto("ciudad", "Ciudad")}
          {texto("municipio_dane", "Municipio DANE", { placeholder: "11001" })}
        </div>
        <div className="mt-2">{texto("direccion", "Dirección *")}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {texto("fecha_nacimiento", "Fecha nacimiento", { tipo: "date" })}
          {texto("rh", "RH", { placeholder: "O+" })}
          {texto("contacto_emergencia", "Contacto de emergencia")}
          {texto("telefono_emergencia", "Tel. emergencia", { tipo: "tel" })}
        </div>
      </Bloque>

      <Bloque titulo="Seguridad social">
        <div className="grid grid-cols-2 gap-2">
          {texto("eps", "EPS")}
          {texto("afp", "AFP / pensión")}
          {texto("arl", "ARL")}
          {texto("caja_compensacion", "Caja compensación")}
        </div>
      </Bloque>

      <Bloque titulo="Vinculación y salario">
        <div className="grid grid-cols-2 gap-2">
          {texto("fecha_ingreso", "Fecha ingreso *", { tipo: "date" })}
          {texto("fecha_retiro", "Fecha retiro", { tipo: "date" })}
        </div>
        <div className="mt-2">{texto("motivo_retiro", "Motivo retiro / pausa")}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {dinero("salario_base", "Salario base (COP) *")}
          <label className={L}>
            Tipo de contrato
            <select value={d.tipo_contrato ?? ""} onChange={(e) => cambiar("tipo_contrato", e.target.value)} className={C}>
              <option value="">—</option>
              {Object.entries(TIPO_CONTRATO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {dinero("bonificacion", "Bonificación (COP)", "Solo si aplica")}
          {dinero("rodamiento", "Rodamiento (COP)", "Solo si aplica")}
        </div>
        <div className="mt-2">{texto("detalle_bonificacion", "Detalle de la bonificación", { placeholder: "Bonificación mensual variable" })}</div>
        <p className="mt-1 text-xs text-slate-500">
          Bonificación y rodamiento salen en el certificado laboral solo si el valor está diligenciado. El certificado totaliza salario, bonificación y
          rodamiento.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={d.aplica_auxilio_transporte} onChange={(e) => cambiar("aplica_auxilio_transporte", e.target.checked)} />
            Auxilio de transporte (si el salario está por debajo del tope)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={d.salario_integral} onChange={(e) => cambiar("salario_integral", e.target.checked)} />
            Salario integral
          </label>
        </div>
        <div className="mt-2">
          <label className={L}>
            Valor auxilio de transporte (COP)
            <input
              value={auxilio}
              onChange={(e) => {
                setGuardado(false);
                setAuxilio(e.target.value);
              }}
              inputMode="numeric"
              placeholder={auxilioEmpresa !== null ? `${pesos(auxilioEmpresa)} (el de la empresa)` : "Sin valor en Parámetros"}
              className={C}
            />
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Por defecto usa el auxilio de RRHH → Parámetros de liquidación
            {auxilioEmpresa !== null ? ` (hoy ${pesos(auxilioEmpresa)})` : ", que todavía no está cargado"}. Cámbielo solo si este colaborador tiene un
            valor distinto; vacío, hereda el de la empresa.
          </p>
        </div>
      </Bloque>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {guardado && <p className="text-xs text-green-700">Ficha guardada.</p>}
      <div className="sticky bottom-0 -mx-1 bg-slate-50/95 px-1 py-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || falta !== null}
          className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pendiente ? "Guardando…" : "Guardar ficha"}
        </button>
        {falta && !pendiente && <p className="mt-1 text-center text-xs text-slate-500">{falta}</p>}
      </div>
    </div>
  );
}

function traducir(m: string): string {
  if (/empleados_tipo_documento_numero_documento_key|duplicate key.*numero/.test(m)) return "Ya hay una ficha con ese documento.";
  if (/empleados_retiro/.test(m)) return "La fecha de retiro no puede ser antes de la de ingreso.";
  return m;
}

/** Junto a un botón apagado en la vista previa de "Nuevo empleado": dice por qué, en texto visible. */
export function AvisoPrevia() {
  return <span className="ml-2 inline-block text-xs font-semibold text-amber-800">Se habilita al guardar los datos.</span>;
}

export function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      {children}
    </section>
  );
}
