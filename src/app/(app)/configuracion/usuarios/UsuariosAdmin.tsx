"use client";

import { useState, useTransition } from "react";
import type { NivelPermiso } from "@/lib/permisos";
import {
  asignarRol,
  cambiarNombre,
  cambiarDatosPersonales,
  crearRol,
  crearUsuario,
  eliminarRol,
  guardarPermisosRol,
  renombrarRol,
  type FilaPermiso,
} from "./actions";

export interface DatosUsuariosAdmin {
  miId: string;
  puedeCrearUsuarios: boolean; // hay SUPABASE_SECRET_KEY en el servidor
  usuarios: {
    id: string;
    email: string;
    nombre: string | null;
    cedula: string | null;
    telefono: string | null;
    rolId: string | null;
    ultimoIngreso: string | null;
  }[];
  roles: { id: string; nombre: string }[];
  modulos: { id: string; nombre: string }[];
  /** Módulos que ve cualquiera con usuario (sin permisos por rol). */
  modulosParaTodos: string[];
  permisos: (FilaPermiso & { rolId: string })[];
}

const NIVELES: { key: NivelPermiso; label: string; ayuda: string }[] = [
  { key: "consultar", label: "Consultar", ayuda: "Solo ver" },
  { key: "trabajar", label: "Trabajar", ayuda: "Crear y editar" },
  { key: "responsable", label: "Responsable", ayuda: "Aprobar y eliminar" },
];
const RANGO: Record<NivelPermiso, number> = { consultar: 1, trabajar: 2, responsable: 3 };

type Matriz = Record<string, { nivel: NivelPermiso; veDatosSensibles: boolean }>;

function matrizDeRol(permisos: DatosUsuariosAdmin["permisos"], rolId: string): Matriz {
  const m: Matriz = {};
  for (const p of permisos) {
    if (p.rolId === rolId) m[p.moduloId] = { nivel: p.nivel, veDatosSensibles: p.veDatosSensibles };
  }
  return m;
}

export function UsuariosAdmin({ datos }: { datos: DatosUsuariosAdmin }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [rolSel, setRolSel] = useState<string | null>(datos.roles[0]?.id ?? null);
  const [matriz, setMatriz] = useState<Matriz>(() =>
    rolSel ? matrizDeRol(datos.permisos, rolSel) : {},
  );
  const [sucia, setSucia] = useState(false);
  const [nuevoRol, setNuevoRol] = useState("");
  const [nombreEdit, setNombreEdit] = useState<string | null>(null);
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  const miRolId = datos.usuarios.find((u) => u.id === datos.miId)?.rolId ?? null;
  const rolActual = datos.roles.find((r) => r.id === rolSel) ?? null;

  function correr(accion: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setError(null);
    setMensaje(null);
    startTransition(async () => {
      const res = await accion();
      if (!res.ok) setError(res.error ?? "Error desconocido");
      else if (ok) setMensaje(ok);
    });
  }

  function elegirRol(id: string) {
    if (sucia && !window.confirm("Hay cambios sin guardar en este rol. ¿Descartarlos?")) return;
    setRolSel(id);
    setMatriz(matrizDeRol(datos.permisos, id));
    setSucia(false);
    setNombreEdit(null);
  }

  function marcarNivel(moduloId: string, nivel: NivelPermiso) {
    setMatriz((prev) => {
      const actual = prev[moduloId];
      const sig = { ...prev };
      // Tocar el nivel que ya está marcado como único (Consultar) quita el acceso.
      if (actual?.nivel === nivel && nivel === "consultar") delete sig[moduloId];
      else sig[moduloId] = { nivel, veDatosSensibles: actual?.veDatosSensibles ?? false };
      return sig;
    });
    setSucia(true);
  }

  function quitarAcceso(moduloId: string) {
    setMatriz((prev) => {
      const sig = { ...prev };
      delete sig[moduloId];
      return sig;
    });
    setSucia(true);
  }

  function alternarSensibles(moduloId: string) {
    setMatriz((prev) => {
      const actual = prev[moduloId];
      if (!actual) return prev;
      return { ...prev, [moduloId]: { ...actual, veDatosSensibles: !actual.veDatosSensibles } };
    });
    setSucia(true);
  }

  function guardarMatriz() {
    if (!rolSel) return;
    const filas: FilaPermiso[] = Object.entries(matriz).map(([moduloId, v]) => ({
      moduloId,
      nivel: v.nivel,
      veDatosSensibles: v.veDatosSensibles,
    }));
    setError(null);
    setMensaje(null);
    startTransition(async () => {
      const res = await guardarPermisosRol(rolSel, filas);
      if (!res.ok) setError(res.error);
      else {
        setSucia(false);
        setMensaje("Permisos guardados");
      }
    });
  }

  return (
    <div className="space-y-6">
      {(error || mensaje) && (
        <p
          className={`sticky top-16 z-10 rounded-md px-3 py-2 text-sm ${
            error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {error ?? mensaje}
        </p>
      )}

      {/* ---------------- Usuarios ---------------- */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Usuarios
          </h2>
          {datos.puedeCrearUsuarios && !creandoUsuario && (
            <button
              type="button"
              onClick={() => setCreandoUsuario(true)}
              className="rounded-md bg-brand-red px-3 py-1.5 text-sm font-semibold text-white"
            >
              + Nuevo usuario
            </button>
          )}
        </div>

        {creandoUsuario && (
          <NuevoUsuarioForm
            roles={datos.roles}
            pendiente={pendiente}
            onCancelar={() => setCreandoUsuario(false)}
            onCrear={(input) =>
              correr(async () => {
                const res = await crearUsuario(input);
                if (res.ok) setCreandoUsuario(false);
                return res;
              }, `Usuario ${input.email.trim()} creado. Pásale la contraseña inicial por privado.`)
            }
          />
        )}

        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {datos.usuarios.length === 0 && (
            <p className="p-4 text-sm text-slate-600">No hay usuarios para mostrar.</p>
          )}
          {datos.usuarios.map((u) => {
            const soyYo = u.id === datos.miId;
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {u.nombre || u.email}
                    {soyYo && <span className="ml-1 text-xs text-slate-500">(tú)</span>}
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        const nuevo = window.prompt("Nombre de la persona", u.nombre ?? "");
                        if (nuevo !== null && nuevo.trim() && nuevo.trim() !== u.nombre) {
                          correr(() => cambiarNombre(u.id, nuevo), "Nombre actualizado");
                        }
                      }}
                      className="ml-2 text-xs font-normal text-slate-500 underline"
                    >
                      {u.nombre ? "cambiar nombre" : "ponerle nombre"}
                    </button>
                  </p>
                  {u.nombre && <p className="truncate text-xs text-slate-600">{u.email}</p>}
                  <p className="text-xs text-slate-600">
                    {u.cedula ? `C.C. ${u.cedula}` : "Sin cédula"}
                    {u.telefono ? ` · ${u.telefono}` : ""}
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        const cedula = window.prompt("Cédula (sale en la firma de las visitas técnicas)", u.cedula ?? "");
                        if (cedula === null) return;
                        const telefono = window.prompt("Teléfono", u.telefono ?? "");
                        if (telefono === null) return;
                        correr(() => cambiarDatosPersonales(u.id, cedula, telefono), "Cédula y teléfono actualizados");
                      }}
                      className="ml-2 text-xs font-normal text-slate-500 underline"
                    >
                      {u.cedula ? "cambiar cédula/teléfono" : "agregar cédula/teléfono"}
                    </button>
                  </p>
                  <p className="text-xs text-slate-500">
                    {u.ultimoIngreso
                      ? `Último ingreso: ${new Date(u.ultimoIngreso).toLocaleDateString("es-CO")}`
                      : "Nunca ha entrado"}
                  </p>
                  {soyYo && (
                    <p className="text-xs text-slate-500">
                      Tu propio rol no se cambia desde aquí, para que no te quites el acceso por error.
                    </p>
                  )}
                </div>
                <select
                  value={u.rolId ?? ""}
                  disabled={soyYo || pendiente}
                  title={soyYo ? "No puedes cambiar tu propio rol" : undefined}
                  onChange={(e) =>
                    correr(
                      () => asignarRol(u.id, e.target.value || null),
                      `Rol de ${u.nombre || u.email} actualizado`,
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">Sin rol (sin acceso)</option>
                  {datos.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {datos.usuarios.length === 1 && datos.usuarios[0].id === datos.miId && (
            <p className="bg-slate-50 p-3 text-sm text-slate-600">
              Todavía no hay otros usuarios.{" "}
              {datos.puedeCrearUsuarios
                ? "Créalo con “+ Nuevo usuario” y aquí mismo le asignas el rol."
                : "Cuando se cree el primero, aparece aquí para asignarle el rol."}
            </p>
          )}
        </div>
        {!datos.puedeCrearUsuarios && (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <span className="font-medium">Crear usuarios desde aquí</span> necesita que la clave
            secreta de Supabase esté configurada en Vercel (variable{" "}
            <code>SUPABASE_SECRET_KEY</code>). Mientras tanto se crean en el panel de Supabase
            (Authentication → Users → Add user) y aparecen en esta lista sin rol, para asignárselo
            aquí. Sin rol no ven ningún módulo.
          </p>
        )}
      </section>

      {/* ---------------- Roles y matriz ---------------- */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Roles y permisos
        </h2>
        <p className="mb-2 text-xs text-slate-600">
          Cada rol se arma chuleando qué módulos puede ver y gestionar. Un módulo sin chulito no
          le aparece a quien tenga ese rol, ni en el inicio ni en el menú.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {datos.roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => elegirRol(r.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                r.id === rolSel
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {r.nombre}
              <span className="ml-1 text-xs opacity-70">
                ({datos.usuarios.filter((u) => u.rolId === r.id).length})
              </span>
            </button>
          ))}
        </div>

        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const nombre = nuevoRol;
            setError(null);
            setMensaje(null);
            if (!nombre.trim()) {
              setError("Escribe el nombre del rol nuevo (ej. Comercial) y vuelve a tocar “+ Crear rol”.");
              return;
            }
            startTransition(async () => {
              const res = await crearRol(nombre);
              if (!res.ok) return setError(res.error);
              setNuevoRol("");
              setRolSel(res.id);
              setMatriz({});
              setSucia(false);
              setMensaje(`Rol "${nombre.trim()}" creado. Márcale los permisos y guarda.`);
            });
          }}
        >
          <input
            value={nuevoRol}
            onChange={(e) => setNuevoRol(e.target.value)}
            placeholder="Nombre del rol nuevo (ej. Comercial)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pendiente}
            className="shrink-0 rounded-md bg-brand-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            + Crear rol
          </button>
        </form>

        {rolActual && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              {nombreEdit === null ? (
                <>
                  <p className="flex-1 text-sm font-semibold text-slate-900">
                    {rolActual.nombre}
                    {rolActual.id === miRolId && (
                      <span className="ml-1 text-xs font-normal text-slate-500">(tu rol)</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setNombreEdit(rolActual.nombre)}
                    className="text-xs text-slate-600 underline"
                  >
                    Renombrar
                  </button>
                  {rolActual.id !== miRolId && (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar el rol "${rolActual.nombre}"?`)) return;
                        const id = rolActual.id;
                        correr(async () => {
                          const res = await eliminarRol(id);
                          if (res.ok) {
                            const otro = datos.roles.find((r) => r.id !== id);
                            setRolSel(otro?.id ?? null);
                            setMatriz(otro ? matrizDeRol(datos.permisos, otro.id) : {});
                            setSucia(false);
                          }
                          return res;
                        }, "Rol eliminado");
                      }}
                      className="text-xs text-red-700 underline"
                    >
                      Eliminar
                    </button>
                  )}
                </>
              ) : (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const id = rolActual.id;
                    const nombre = nombreEdit;
                    correr(async () => {
                      const res = await renombrarRol(id, nombre);
                      if (res.ok) setNombreEdit(null);
                      return res;
                    }, "Rol renombrado");
                  }}
                >
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button type="submit" className="text-sm font-medium text-slate-900">
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setNombreEdit(null)}
                    className="text-sm text-slate-500"
                  >
                    Cancelar
                  </button>
                </form>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="p-2 text-left font-medium">Módulo</th>
                    {NIVELES.map((n) => (
                      <th key={n.key} className="p-2 text-center font-medium" title={n.ayuda}>
                        {n.label}
                      </th>
                    ))}
                    <th className="p-2 text-center font-medium" title="Costos, márgenes y datos reservados del módulo">
                      Datos sensibles
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {datos.modulosParaTodos.map((nombre) => (
                    <tr key={nombre}>
                      <td className="p-2 font-medium text-slate-900">{nombre}</td>
                      <td colSpan={NIVELES.length + 1} className="p-2 text-center text-xs text-slate-500">
                        Todos los usuarios (no se asigna por rol)
                      </td>
                    </tr>
                  ))}
                  {datos.modulos.map((m) => {
                    const p = matriz[m.id];
                    return (
                      <tr key={m.id}>
                        <td className="p-2">
                          <p className="font-medium text-slate-900">{m.nombre}</p>
                          {p ? (
                            <button
                              type="button"
                              onClick={() => quitarAcceso(m.id)}
                              className="text-xs text-slate-500 underline"
                            >
                              Quitar acceso
                            </button>
                          ) : (
                            <p className="text-xs text-slate-400">Sin acceso</p>
                          )}
                        </td>
                        {NIVELES.map((n) => {
                          const marcado = p && RANGO[p.nivel] >= RANGO[n.key];
                          const exacto = p?.nivel === n.key;
                          return (
                            <td key={n.key} className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => marcarNivel(m.id, n.key)}
                                aria-label={`${m.nombre}: ${n.label}`}
                                aria-pressed={exacto}
                                className={`h-9 w-9 rounded-md border text-lg leading-none ${
                                  exacto
                                    ? "border-green-600 bg-green-600 text-white"
                                    : marcado
                                      ? "border-green-300 bg-green-50 text-green-700"
                                      : "border-slate-300 bg-white text-transparent"
                                }`}
                              >
                                ✓
                              </button>
                            </td>
                          );
                        })}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            disabled={!p}
                            onClick={() => alternarSensibles(m.id)}
                            aria-label={`${m.nombre}: ver datos sensibles`}
                            aria-pressed={p?.veDatosSensibles ?? false}
                            className={`h-9 w-9 rounded-md border text-lg leading-none disabled:opacity-30 ${
                              p?.veDatosSensibles
                                ? "border-amber-600 bg-amber-500 text-white"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                          >
                            ✓
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-3">
              <p className="text-xs text-slate-500">
                Los niveles se acumulan: Responsable incluye Trabajar y Consultar.
              </p>
              <div className="flex shrink-0 gap-2">
                {sucia && (
                  <button
                    type="button"
                    onClick={() => {
                      setMatriz(matrizDeRol(datos.permisos, rolActual.id));
                      setSucia(false);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                  >
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  disabled={!sucia || pendiente}
                  onClick={guardarMatriz}
                  className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {pendiente ? "Guardando…" : "Guardar permisos"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Cuatro campos: nombre, correo, contraseña inicial y rol. El usuario entra con esa
// contraseña; se la pasas por privado (no se envía ningún correo).
function NuevoUsuarioForm({
  roles,
  pendiente,
  onCancelar,
  onCrear,
}: {
  roles: { id: string; nombre: string }[];
  pendiente: boolean;
  onCancelar: () => void;
  onCrear: (input: { nombre: string; email: string; password: string; rolId: string | null }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rolId, setRolId] = useState("");
  const [ver, setVer] = useState(false);

  return (
    <form
      className="mb-3 space-y-2 rounded-lg border border-slate-300 bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onCrear({ nombre, email, password, rolId: rolId || null });
      }}
    >
      <p className="text-sm font-semibold text-slate-900">Nuevo usuario</p>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre (ej. Carlos Pérez)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        autoFocus
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Correo con el que va a entrar"
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <input
          type={ver ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña inicial (mínimo 8)"
          autoComplete="new-password"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          className="shrink-0 rounded-md border border-slate-300 px-2 text-xs text-slate-600"
        >
          {ver ? "Ocultar" : "Ver"}
        </button>
      </div>
      <select
        value={rolId}
        onChange={(e) => setRolId(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Sin rol por ahora (no ve ningún módulo)</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="flex-1 rounded-md bg-brand-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pendiente ? "Creando…" : "Crear usuario"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-md px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </form>
  );
}
