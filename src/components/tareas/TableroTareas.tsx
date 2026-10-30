"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  bloqueos,
  COLUMNAS,
  cumpleFiltro,
  etiquetaVence,
  ETIQUETA_ESTADO,
  ETIQUETA_VISIBILIDAD,
  FILTROS,
  hoyBogota,
  ordenEntre,
  PRIORIDADES,
  type EstadoTarea,
  type FiltroEstado,
  type Obra,
  type Tarea,
} from "@/lib/tareas";
import { borradorVacio, guardarTarea, moverTarea, recuperarTarea } from "@/lib/tareas-guardar";
import type { GrupoCompartir, ModoTareas } from "@/lib/supabase/tareas";
import { FormTarea } from "./FormTarea";

type Vista = "tablero" | "lista" | "tabla" | "tarjetas";
const VISTAS: { valor: Vista; etiqueta: string }[] = [
  { valor: "tablero", etiqueta: "Tablero" },
  { valor: "lista", etiqueta: "Lista" },
  { valor: "tabla", etiqueta: "Tabla" },
  { valor: "tarjetas", etiqueta: "Tarjetas" },
];

const ESPERA_PULSACION_MS = 280;
/** Franja del borde del tablero que, con el dedo encima, lo desplaza de lado. */
const BORDE_DESPLAZAR_PX = 48;
/** Desplazamiento máximo por cuadro (~60 por segundo) con el dedo pegado al borde. */
const VELOCIDAD_MAX_PX = 12;

interface Arrastre {
  id: string;
  x: number;
  y: number;
  ancho: number;
  destino: { estado: EstadoTarea; indice: number } | null;
}

/** Columna y posición bajo el dedo (se mide en vivo, después de cualquier desplazamiento). */
function destinoEn(x: number, y: number, arrastrada: string): Arrastre["destino"] {
  const col = document
    .elementsFromPoint(x, y)
    .map((el) => (el as HTMLElement).closest("[data-columna]") as HTMLElement | null)
    .find(Boolean);
  if (!col) return null;
  const estado = col.dataset.columna as EstadoTarea;
  const tarjetas = [...col.querySelectorAll<HTMLElement>("[data-tarjeta]")].filter((el) => el.dataset.tarjeta !== arrastrada);
  let indice = tarjetas.length;
  for (const [i, el] of tarjetas.entries()) {
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      indice = i;
      break;
    }
  }
  return { estado, indice };
}

export function TableroTareas({
  modo = "operativo",
  yo,
  puedeAsignar,
  puedeEliminar = false,
  tareasIniciales,
  archivadasIniciales = [],
  obras,
  personas,
  grupos = [],
  conResponsable = true,
}: {
  /** operativo: tablero de obra · planificacion: tareas administrativas (internas y compartidas). */
  modo?: ModoTareas;
  yo: string;
  puedeAsignar: boolean;
  /** operativo/trabajar: eliminar definitivamente (con contraseña). */
  puedeEliminar?: boolean;
  tareasIniciales: Tarea[];
  archivadasIniciales?: Tarea[];
  obras: Obra[];
  personas: { id: string; nombre: string }[];
  grupos?: GrupoCompartir[];
  conResponsable?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const planificacion = modo === "planificacion";
  const hoy = hoyBogota();
  const [tareas, setTareas] = useState<Tarea[]>(tareasIniciales);
  const [archivadas, setArchivadas] = useState<Tarea[]>(archivadasIniciales);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [filtro, setFiltro] = useState<FiltroEstado>("abiertas");
  const [busqueda, setBusqueda] = useState("");
  // Planificación: Tareas de grupo (compartidas) · Tareas personales (internas) · Todas.
  const [visibilidad, setVisibilidad] = useState<"todas" | "interna" | "compartida">("todas");
  // todas | mias | creadas | asignadas | conmigo | sin_asignar | <perfil>. Quien no asigna arranca en lo suyo.
  const [asignacion, setAsignacion] = useState<string>(puedeAsignar || planificacion ? "todas" : "mias");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [obra, setObra] = useState("");
  const [vista, setVista] = useState<Vista>("tablero");
  const [plegadas, setPlegadas] = useState<Set<EstadoTarea>>(new Set());
  const [cerradas, setCerradas] = useState<Set<EstadoTarea>>(new Set());
  const [form, setForm] = useState<{ original: Tarea | null; estado: EstadoTarea } | null>(null);
  const [franja, setFranja] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [rapida, setRapida] = useState<Record<EstadoTarea, string>>({ por_hacer: "", en_progreso: "", hecho: "" });
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  // Lo que hace falta para arrancar el arrastre después: con el dedo, al cumplirse la pulsación
  // larga; con el mouse, al moverse unos píxeles (con mouse no hay desplazamiento que distinguir).
  const pulsacion = useRef<{ timer: number | null; x: number; y: number; mouse: boolean; arrancar: () => void } | null>(null);
  const recienSoltada = useRef(false);
  const tablero = useRef<HTMLDivElement>(null);
  /** Dónde está el dedo durante el arrastre (lo lee el desplazamiento automático). */
  const dedo = useRef<{ x: number; y: number } | null>(null);
  const arrastrando = arrastre?.id ?? null;

  // Desplazamiento automático mientras se arrastra con el dedo cerca de un borde: continuo,
  // de a pocos píxeles por cuadro y más rápido cuanto más cerca del borde, y el destino se
  // recalcula después de cada desplazamiento. Antes se desplazaba 24 px por cada movimiento
  // del dedo y, con el ajuste por columnas (snap) activo, cada uno saltaba una columna
  // entera: la del medio pasaba de largo y la tarjeta caía en "Hecho".
  useEffect(() => {
    if (!arrastrando) return;
    let cuadro = 0;
    const paso = () => {
      const contenedor = tablero.current;
      const d = dedo.current;
      if (contenedor && d) {
        const r = contenedor.getBoundingClientRect();
        let dx = 0;
        if (d.x > r.right - BORDE_DESPLAZAR_PX) dx = (d.x - (r.right - BORDE_DESPLAZAR_PX)) / BORDE_DESPLAZAR_PX;
        else if (d.x < r.left + BORDE_DESPLAZAR_PX) dx = -((r.left + BORDE_DESPLAZAR_PX) - d.x) / BORDE_DESPLAZAR_PX;
        dx = Math.max(-1, Math.min(1, dx)) * VELOCIDAD_MAX_PX;
        if (Math.abs(dx) >= 1) {
          const antes = contenedor.scrollLeft;
          contenedor.scrollLeft = antes + dx;
          if (contenedor.scrollLeft !== antes) {
            const destino = destinoEn(d.x, d.y, arrastrando);
            setArrastre((a) => (a ? { ...a, destino } : a));
          }
        }
      }
      cuadro = window.requestAnimationFrame(paso);
    };
    cuadro = window.requestAnimationFrame(paso);
    return () => window.cancelAnimationFrame(cuadro);
  }, [arrastrando]);

  // El tablero arranca siempre en la primera columna ("Por hacer"), aunque el navegador
  // quiera restaurar un desplazamiento anterior al volver a la pantalla.
  useEffect(() => {
    if (vista === "tablero") tablero.current?.scrollTo({ left: 0 });
  }, [vista]);

  const porId = useMemo(() => new Map(tareas.map((t) => [t.id, t])), [tareas]);
  const nombreObra = useMemo(() => new Map(obras.map((o) => [o.clave, o.nombre])), [obras]);
  const nombrePersona = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const nombreGrupo = useMemo(() => new Map(grupos.map((g) => [g.id, g.nombre])), [grupos]);
  const conQuien = (t: Tarea) =>
    t.participantes
      .map((p) => (p.perfilId ? nombrePersona.get(p.perfilId) ?? "—" : `👥 ${nombreGrupo.get(p.grupoId!) ?? "Grupo"}`))
      .join(", ");

  useEffect(() => {
    if (!franja || franja.tipo === "error") return;
    const t = window.setTimeout(() => setFranja(null), 3000);
    return () => window.clearTimeout(t);
  }, [franja]);

  // Todo menos el filtro de estado (para los contadores de los filtros).
  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tareas.filter((t) => {
      if (visibilidad !== "todas" && t.visibilidad !== visibilidad) return false;
      if (obra && (t.proyectoId ? `p:${t.proyectoId}` : t.visitaId ? `v:${t.visitaId}` : "") !== obra) return false;
      if (asignacion === "mias" && !(t.asignados.includes(yo) || t.creadaPor === yo)) return false;
      if (asignacion === "creadas" && t.creadaPor !== yo) return false;
      if (asignacion === "asignadas" && !t.asignados.includes(yo)) return false;
      if (asignacion === "conmigo" && t.creadaPor === yo) return false;
      if (asignacion === "sin_asignar" && (t.visibilidad !== "equipo" || t.asignados.length > 0)) return false;
      if (!["todas", "mias", "creadas", "asignadas", "conmigo", "sin_asignar"].includes(asignacion) && !t.asignados.includes(asignacion))
        return false;
      if (q && !t.titulo.toLowerCase().includes(q) && !t.subtareas.some((s) => s.titulo.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tareas, busqueda, visibilidad, obra, asignacion, yo]);

  const visibles = useMemo(() => base.filter((t) => cumpleFiltro(t, filtro, hoy)), [base, filtro, hoy]);
  const deColumna = (estado: EstadoTarea) =>
    visibles.filter((t) => t.estado === estado).sort((a, b) => a.orden - b.orden);

  function reemplazar(t: Tarea) {
    setTareas((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t]));
  }

  // ------------------------------------------------------------ crear rápido
  async function crearRapida(estado: EstadoTarea) {
    const titulo = rapida[estado].trim();
    if (!titulo) return;
    const b = borradorVacio(estado);
    b.titulo = titulo;
    // Planificación: nace interna (solo yo); se comparte desde el formulario. Operativo: es
    // de obra, así que necesita la obra elegida en el filtro.
    if (!planificacion) {
      if (!obra) {
        setFranja({ tipo: "error", texto: "Elige la obra en el filtro de arriba, o usa “+ Nueva tarea”." });
        return;
      }
      b.visibilidad = "equipo";
    }
    b.obra = obra;
    const enColumna = tareas.filter((t) => t.estado === estado);
    const ultima = enColumna.reduce((m, t) => Math.max(m, t.orden), -Infinity);
    const res = await guardarTarea(supabase, null, b, {
      soloMover: false,
      ordenNueva: Number.isFinite(ultima) ? ultima + 1000 : 1000,
      conResponsable,
    });
    if (!res.ok) {
      // El texto queda en el campo: no se pierde en silencio.
      setFranja({ tipo: "error", texto: res.error });
      return;
    }
    reemplazar(res.tarea);
    setRapida((r) => ({ ...r, [estado]: "" }));
    setFranja({ tipo: "ok", texto: b.visibilidad === "interna" ? "Tarea creada (interna, solo tú)" : "Tarea creada" });
  }

  // ------------------------------------------------------------ arrastrar manteniendo pulsado
  function alPresionar(e: React.PointerEvent<HTMLElement>, t: Tarea) {
    const enAsa = (e.target as HTMLElement).closest("[data-asa]");
    // Con el dedo, el arrastre arranca desde el asa (así el resto de la tarjeta deja
    // desplazar la pantalla). Con el mouse, desde cualquier parte.
    if (e.pointerType !== "mouse" && !enAsa) return;
    const objetivo = e.currentTarget;
    const rect = objetivo.getBoundingClientRect();
    const id = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    const mouse = e.pointerType === "mouse";
    const arrancar = () => {
      pulsacion.current = null;
      try {
        objetivo.setPointerCapture(id);
      } catch {}
      if (!mouse) navigator.vibrate?.(15);
      dedo.current = { x, y };
      setArrastre({ id: t.id, x, y, ancho: rect.width, destino: { estado: t.estado, indice: 0 } });
    };
    // Con el mouse el arrastre arranca al moverse (alMover), no por tiempo: el gesto natural es
    // presionar y mover de una, y una pulsación larga ahí no distingue nada. Con el dedo, la
    // pulsación larga separa "arrastrar" de "desplazar la pantalla".
    // Con mouse se captura ya, para no perder el movimiento si el cursor sale rápido de la tarjeta
    // (el clic sigue llegando a la tarjeta).
    if (mouse) {
      try {
        objetivo.setPointerCapture(id);
      } catch {}
    }
    pulsacion.current = { x, y, mouse, arrancar, timer: mouse ? null : window.setTimeout(arrancar, ESPERA_PULSACION_MS) };
  }

  function alMover(e: React.PointerEvent<HTMLElement>) {
    if (pulsacion.current && !arrastre) {
      const distancia = Math.hypot(e.clientX - pulsacion.current.x, e.clientY - pulsacion.current.y);
      if (pulsacion.current.mouse) {
        // Mouse: unos píxeles de movimiento con el botón presionado = arrastrar.
        if (distancia > 4) {
          e.preventDefault();
          pulsacion.current.arrancar();
        }
      } else if (distancia > 8) {
        // Dedo: se movió antes de la pulsación larga, es un desplazamiento, no un arrastre.
        if (pulsacion.current.timer !== null) window.clearTimeout(pulsacion.current.timer);
        pulsacion.current = null;
      }
      return;
    }
    if (!arrastre) return;
    e.preventDefault();
    dedo.current = { x: e.clientX, y: e.clientY };
    setArrastre({ ...arrastre, x: e.clientX, y: e.clientY, destino: destinoEn(e.clientX, e.clientY, arrastre.id) });
  }

  async function alSoltar() {
    if (pulsacion.current) {
      if (pulsacion.current.timer !== null) window.clearTimeout(pulsacion.current.timer);
      pulsacion.current = null;
    }
    const a = arrastre;
    dedo.current = null;
    setArrastre(null);
    if (a) {
      recienSoltada.current = true;
      window.setTimeout(() => (recienSoltada.current = false), 0);
    }
    if (!a?.destino) return;
    const t = porId.get(a.id);
    if (!t) return;
    const columna = deColumna(a.destino.estado).filter((x) => x.id !== a.id);
    const antes = columna[a.destino.indice - 1]?.orden ?? null;
    const despues = columna[a.destino.indice]?.orden ?? null;
    const orden = ordenEntre(antes, despues);
    if (t.estado === a.destino.estado && t.orden === orden) return;
    const previa = t;
    reemplazar({ ...t, estado: a.destino.estado, orden }); // al instante; si la base no deja, vuelve
    const res = await moverTarea(supabase, t.id, a.destino.estado, orden);
    if (!res.ok) {
      reemplazar(previa);
      setFranja({ tipo: "error", texto: res.error });
    } else if (previa.estado !== a.destino.estado) {
      setFranja({ tipo: "ok", texto: `Movida a ${ETIQUETA_ESTADO[a.destino.estado]}` });
    }
  }

  // ------------------------------------------------------------ piezas
  const contador = (f: FiltroEstado) => base.filter((t) => cumpleFiltro(t, f, hoy)).length;

  // Función de render, NO un componente: definido adentro, React lo trataría como uno nuevo
  // en cada render y desmontaría la tarjeta en pleno arrastre.
  function tarjeta(t: Tarea, arrastrable = true) {
    const vence = etiquetaVence(t, hoy);
    const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad)!;
    const hechas = t.subtareas.filter((s) => s.hecha).length;
    const mia = t.creadaPor === yo || t.asignados.includes(yo);
    const bloq = t.estado !== "hecho" ? bloqueos(t, t.estado === "por_hacer" ? "en_progreso" : "hecho", porId) : null;
    const obraClave = t.proyectoId ? `p:${t.proyectoId}` : t.visitaId ? `v:${t.visitaId}` : "";
    const siendoArrastrada = arrastre?.id === t.id;
    const abierta = expandidas.has(t.id);
    return (
      <div
        data-tarjeta={t.id}
        onPointerDown={arrastrable ? (e) => alPresionar(e, t) : undefined}
        onPointerMove={arrastrable ? alMover : undefined}
        onPointerUp={arrastrable ? alSoltar : undefined}
        onPointerCancel={arrastrable ? alSoltar : undefined}
        onClick={() => {
          // Soltar una tarjeta no es tocarla.
          if (arrastre || recienSoltada.current) return;
          setForm({ original: t, estado: t.estado });
        }}
        key={t.id}
        className={`flex cursor-pointer gap-2 rounded-xl border p-3 shadow-sm select-none ${prioridad.tinte} ${
          siendoArrastrada ? "opacity-30" : ""
        }`}
      >
        {arrastrable && (
          <span
            data-asa
            className="-ml-1 flex w-6 shrink-0 touch-none items-center justify-center text-lg text-slate-300"
            aria-label="Mantén pulsado para mover"
          >
            ⋮⋮
          </span>
        )}
        <div className="min-w-0 flex-1">
          {/* Fila de arriba, chica: desplegar · visibilidad · prioridad · vence */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandidas((s) => {
                  const n = new Set(s);
                  if (n.has(t.id)) n.delete(t.id);
                  else n.add(t.id);
                  return n;
                });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="-my-2 -ml-1 flex min-h-11 min-w-11 items-center justify-center text-slate-500"
              aria-label={abierta ? "Plegar" : "Desplegar"}
              aria-expanded={abierta}
            >
              {abierta ? "▾" : "▸"}
            </button>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
              {ETIQUETA_VISIBILIDAD[t.visibilidad]}
            </span>
            <span className={`font-bold ${prioridad.texto}`}>{prioridad.etiqueta}</span>
            {vence && <span className={vence.clase}>{vence.texto}</span>}
          </div>
          <p className="mt-0.5 text-base font-bold leading-snug text-slate-900">{t.titulo}</p>
          {bloq && (bloq.visibles.length > 0 || bloq.ocultas > 0) && (
            <p className="mt-1 text-xs font-medium text-red-700">
              ⛔ Espera a {[...bloq.visibles.map((b) => `“${b.titulo}”`), ...(bloq.ocultas ? [`${bloq.ocultas} que no puedes ver`] : [])].join(", ")}
            </p>
          )}
          {abierta && (
            <div className="mt-1.5 space-y-1 text-sm text-slate-700">
              {obraClave && <p className="text-slate-500">{nombreObra.get(obraClave) ?? "Obra"}</p>}
              {t.descripcion && <p className="whitespace-pre-line">{t.descripcion}</p>}
              {t.subtareas.length > 0 && (
                <ul>
                  {t.subtareas.map((s) => (
                    <li key={s.id} className={s.hecha ? "text-slate-400 line-through" : ""}>
                      {s.hecha ? "☑" : "☐"} {s.titulo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* Pie gris y chico */}
          <p className="mt-1 text-xs text-slate-500">
            {hechas}/{t.subtareas.length} subtareas
            {t.creadaPor !== yo && t.visibilidad === "compartida"
              ? " · Compartida contigo"
              : mia
                ? " · Mía"
                : t.asignados.length
                  ? ` · ${t.asignados.map((a) => nombrePersona.get(a) ?? "—").join(", ")}`
                  : ""}
          </p>
        </div>
      </div>
    );
  }

  const arrastrada = arrastre ? porId.get(arrastre.id) : null;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-4">
      {franja && (
        <div
          role="status"
          className={`sticky top-[57px] z-20 mb-3 flex items-center justify-between rounded-xl px-4 py-3 text-base font-semibold sm:top-[65px] ${
            franja.tipo === "ok" ? "bg-green-600 text-white" : "bg-red-100 text-red-900"
          }`}
        >
          <span>{franja.texto}</span>
          <button type="button" onClick={() => setFranja(null)} className="min-h-11 min-w-11 text-xl" aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}

      {/* Filtros con contador */}
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-semibold ${
              filtro === f.valor ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
            }`}
          >
            {f.etiqueta} <span className="opacity-70">{contador(f.valor)}</span>
          </button>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2 lg:grid-cols-4 [&>*]:min-w-0">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar tarea o subtarea…"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-base"
        />
        {planificacion && (
          <select value={visibilidad} onChange={(e) => setVisibilidad(e.target.value as typeof visibilidad)} className="min-h-11 rounded-lg border border-slate-300 px-2 text-base">
            <option value="todas">Todas</option>
            <option value="compartida">Tareas de grupo</option>
            <option value="interna">Tareas personales</option>
          </select>
        )}
        {planificacion ? (
          <select value={asignacion} onChange={(e) => setAsignacion(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-2 text-base">
            <option value="todas">Mías y compartidas conmigo</option>
            <option value="creadas">Creadas por mí</option>
            <option value="conmigo">Compartidas conmigo</option>
          </select>
        ) : (
          <select value={asignacion} onChange={(e) => setAsignacion(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-2 text-base">
            <option value="mias">Todas las mías</option>
            <option value="creadas">Creadas por mí</option>
            <option value="asignadas">Asignadas a mí</option>
            {puedeAsignar && <option value="todas">Todo el tablero</option>}
            {puedeAsignar && <option value="sin_asignar">Sin asignar</option>}
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        )}
        <select value={obra} onChange={(e) => setObra(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-2 text-base">
          <option value="">Todas las obras</option>
          {obras.map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {VISTAS.map((v) => (
            <button
              key={v.valor}
              type="button"
              onClick={() => setVista(v.valor)}
              className={`min-h-11 rounded-md px-3 text-sm font-medium ${vista === v.valor ? "bg-slate-900 text-white" : "text-slate-700"}`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {cerradas.size > 0 && (
          <span className="text-sm text-slate-600">
            Ocultas:{" "}
            {[...cerradas].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCerradas((s) => new Set([...s].filter((x) => x !== c)))}
                className="inline-flex min-h-11 items-center ml-1 underline"
              >
                {ETIQUETA_ESTADO[c]} ↺
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={() => setVerArchivadas((v) => !v)}
          aria-pressed={verArchivadas}
          className={`min-h-11 rounded-lg border-2 px-3 text-sm font-medium ${verArchivadas ? "border-slate-900 bg-slate-100" : "border-slate-300"}`}
        >
          Archivadas <span className="opacity-70">{archivadas.length}</span>
        </button>
        {puedeAsignar && (
          <button
            type="button"
            onClick={() => setForm({ original: null, estado: "por_hacer" })}
            className="min-h-11 rounded-lg bg-slate-900 px-4 text-base font-semibold text-white"
          >
            + Nueva tarea
          </button>
        )}
      </div>

      {verArchivadas && (
        <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-base font-bold text-slate-800">Archivadas (eliminadas)</h3>
          <p className="text-sm text-slate-600">No se borran: con “Recuperar” vuelven al tablero y a la agenda.</p>
          {archivadas.length === 0 ? (
            <p className="mt-2 text-base text-slate-500">No hay tareas archivadas.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {archivadas.map((t) => (
                <li key={t.id} className="flex min-h-12 items-center gap-2 py-1">
                  <button type="button" onClick={() => setForm({ original: t, estado: t.estado })} className="min-h-11 flex-1 text-left text-base">
                    {t.titulo}
                  </button>
                  {(t.creadaPor === yo || (!planificacion && puedeAsignar)) && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await recuperarTarea(supabase, t.id);
                        if (!res.ok) return setFranja({ tipo: "error", texto: res.error });
                        setArchivadas((a) => a.filter((x) => x.id !== t.id));
                        reemplazar(res.tarea);
                        setFranja({ tipo: "ok", texto: "Tarea recuperada" });
                      }}
                      className="min-h-11 rounded-lg border-2 border-green-300 px-3 text-sm font-semibold text-green-800"
                    >
                      Recuperar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {vista === "tablero" && (
        <div
          ref={tablero}
          // Sin ajuste por columnas mientras se arrastra: si no, cada desplazamiento chico salta una columna entera.
          className={`mt-3 flex gap-3 overflow-x-auto overscroll-x-contain pb-4 ${arrastre ? "snap-none" : "snap-x snap-mandatory md:snap-none"}`}
        >
          {COLUMNAS.filter((c) => !cerradas.has(c.estado)).map((c) => {
            const lista = deColumna(c.estado);
            const plegada = plegadas.has(c.estado);
            const marcada = arrastre?.destino?.estado === c.estado;
            return (
              <section
                key={c.estado}
                data-columna={c.estado}
                className={`flex shrink-0 snap-start flex-col rounded-xl border border-t-4 border-slate-200 bg-slate-50 ${c.borde} ${
                  plegada ? "w-16" : "w-[88%] max-w-sm md:w-80"
                } ${marcada ? "ring-2 ring-slate-400" : ""}`}
              >
                <header className="flex items-center gap-1 px-3 py-2">
                  {!plegada && (
                    <h3 className={`flex-1 text-base font-bold ${c.texto}`}>
                      {c.titulo} <span className="text-slate-500">{lista.length}</span>
                    </h3>
                  )}
                  {!plegada && (
                    <button type="button" onClick={() => setForm({ original: null, estado: c.estado })} className="min-h-11 min-w-11 rounded-lg text-xl text-slate-600" aria-label={`Agregar en ${c.titulo}`}>
                      +
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPlegadas((s) => {
                        const n = new Set(s);
                        if (n.has(c.estado)) n.delete(c.estado);
                        else n.add(c.estado);
                        return n;
                      })
                    }
                    className="min-h-11 min-w-11 rounded-lg text-slate-600"
                    aria-label={plegada ? `Desplegar ${c.titulo}` : `Plegar ${c.titulo}`}
                  >
                    {plegada ? "›" : "‹"}
                  </button>
                  {!plegada && (
                    <button
                      type="button"
                      onClick={() => setCerradas((s) => new Set([...s, c.estado]))}
                      className="min-h-11 min-w-11 rounded-lg text-slate-400"
                      aria-label={`Ocultar ${c.titulo}`}
                    >
                      ×
                    </button>
                  )}
                </header>
                {plegada ? (
                  <p className={`px-2 text-center text-sm font-bold [writing-mode:vertical-rl] ${c.texto}`}>
                    {c.titulo} · {lista.length}
                  </p>
                ) : (
                  <>
                    <div className="flex min-h-24 flex-1 flex-col gap-2 px-2">
                      {lista.length === 0 && (
                        <p className="rounded-lg border-2 border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
                          Suelte tarjetas aquí
                        </p>
                      )}
                      {lista.map((t, i) => (
                        <div key={t.id}>
                          {marcada && arrastre?.destino?.indice === i && <div className="mb-2 h-1 rounded bg-slate-500" />}
                          {tarjeta(t)}
                        </div>
                      ))}
                      {marcada && arrastre?.destino?.indice === lista.filter((x) => x.id !== arrastre?.id).length && (
                        <div className="h-1 rounded bg-slate-500" />
                      )}
                    </div>
                    <input
                      value={rapida[c.estado]}
                      onChange={(e) => setRapida((r) => ({ ...r, [c.estado]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          crearRapida(c.estado);
                        }
                      }}
                      enterKeyHint="done"
                      placeholder={`Nueva tarea en ${c.titulo}…`}
                      className="m-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base"
                    />
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {vista === "lista" && (
        <div className="mt-3 space-y-4">
          {COLUMNAS.map((c) => {
            const lista = deColumna(c.estado);
            if (lista.length === 0) return null;
            return (
              <section key={c.estado}>
                <h3 className={`mb-1 text-base font-bold ${c.texto}`}>
                  {c.titulo} <span className="text-slate-500">{lista.length}</span>
                </h3>
                <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {lista.map((t) => {
                    const vence = etiquetaVence(t, hoy);
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => setForm({ original: t, estado: t.estado })} className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left">
                          <span className="flex-1 text-base">{t.titulo}</span>
                          {vence && <span className={`rounded px-1.5 py-0.5 text-xs ${vence.clase}`}>{vence.texto}</span>}
                          <span className="text-xs font-semibold text-slate-500">{t.prioridad.toUpperCase()}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {visibles.length === 0 && <p className="text-base text-slate-500">No hay tareas con estos filtros.</p>}
        </div>
      )}

      {vista === "tabla" && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tarea</th>
                <th className="px-3 py-2">Columna</th>
                <th className="px-3 py-2">Prioridad</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2">Obra</th>
                <th className="px-3 py-2">{planificacion ? "Con quién" : "Asignados"}</th>
                <th className="px-3 py-2">Subtareas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((t) => {
                const clave = t.proyectoId ? `p:${t.proyectoId}` : t.visitaId ? `v:${t.visitaId}` : "";
                return (
                  <tr key={t.id} onClick={() => setForm({ original: t, estado: t.estado })} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{t.titulo}</td>
                    <td className="px-3 py-2">{ETIQUETA_ESTADO[t.estado]}</td>
                    <td className="px-3 py-2">{t.prioridad.toUpperCase()}</td>
                    <td className="px-3 py-2">{etiquetaVence(t, hoy)?.texto ?? (t.fechaLimite ?? "—")}</td>
                    <td className="px-3 py-2">{clave ? nombreObra.get(clave) ?? "—" : "—"}</td>
                    <td className="px-3 py-2">
                      {t.visibilidad === "interna"
                        ? "🔒 solo yo"
                        : t.visibilidad === "compartida"
                          ? conQuien(t) || "—"
                          : t.asignados.map((a) => nombrePersona.get(a) ?? "—").join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {t.subtareas.filter((s) => s.hecha).length}/{t.subtareas.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {vista === "tarjetas" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((t) => (
            tarjeta(t, false)
          ))}
          {visibles.length === 0 && <p className="text-base text-slate-500">No hay tareas con estos filtros.</p>}
        </div>
      )}

      {/* La tarjeta que se arrastra, siguiendo el dedo */}
      {arrastre && arrastrada && (
        <div
          className="pointer-events-none fixed z-50 rotate-2 rounded-xl border-2 border-slate-900 bg-white p-3 shadow-2xl"
          style={{ left: arrastre.x - 24, top: arrastre.y - 24, width: arrastre.ancho }}
        >
          <p className="text-base font-semibold">{arrastrada.titulo}</p>
        </div>
      )}

      {form && (
        <FormTarea
          modo={modo}
          original={form.original}
          estadoInicial={form.estado}
          obraInicial={obra}
          yo={yo}
          puedeAsignar={puedeAsignar}
          puedeEliminar={puedeEliminar}
          onEliminada={(id) => {
            setTareas((ts) => ts.filter((x) => x.id !== id));
            setArchivadas((a) => a.filter((x) => x.id !== id));
            setForm(null);
            setFranja({ tipo: "ok", texto: "Tarea eliminada definitivamente" });
          }}
          personas={personas}
          grupos={grupos}
          conResponsable={conResponsable}
          obras={obras}
          tareas={tareas}
          onCerrar={() => setForm(null)}
          onRecuperada={(t) => {
            setArchivadas((a) => a.filter((x) => x.id !== t.id));
            reemplazar(t);
            setForm(null);
            setFranja({ tipo: "ok", texto: "Tarea recuperada" });
          }}
          onGuardada={(t, nueva) => {
            reemplazar(t);
            setForm(null);
            setFranja({ tipo: "ok", texto: nueva ? "Tarea creada" : "Tarea guardada" });
          }}
          onArchivada={(id) => {
            const quitada = tareas.find((x) => x.id === id);
            setTareas((prev) => prev.filter((x) => x.id !== id));
            if (quitada) setArchivadas((a) => [{ ...quitada, archivada: true }, ...a]);
            setForm(null);
            setFranja({ tipo: "ok", texto: "Tarea eliminada (archivada): se recupera desde “Archivadas”" });
          }}
        />
      )}
    </div>
  );
}
