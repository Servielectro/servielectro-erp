"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activarUsuarioCliente, crearUsuarioCliente, desactivarUsuarioCliente } from "./actions";

const CAMPO = "mt-0.5 w-full min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm";

export interface UsuarioPortal {
  perfilId: string;
  email: string;
  nombre: string | null;
  cliente: string;
  cargo: string | null;
  activo: boolean;
  creadoEn: string;
  ultimoIngreso: string | null;
  desactivadoEn: string | null;
  motivo: string | null;
  /** Si alguien le cambió el rol en Usuarios y permisos, se avisa. */
  rolEsCliente: boolean;
}

const fecha = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(new Date(iso)) : "nunca");

function contrasenaSugerida(): string {
  // Sin caracteres que se confunden al dictarla (0/O, 1/l/I).
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => letras[b % letras.length]).join("");
}

export function UsuariosPortal({
  usuarios,
  clientes,
  puedeCrear,
}: {
  usuarios: UsuarioPortal[];
  clientes: { id: string; nombre: string; nit: string | null }[];
  puedeCrear: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("Administrador");
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [desactivando, setDesactivando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [filtro, setFiltro] = useState("");

  function crear() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const r = await crearUsuarioCliente({ clienteId, nombre, email, password, cargo, cedula });
      if (!r.ok) return setError(r.error);
      setAviso(`Usuario creado: ${email.trim().toLowerCase()}. Entrégale el correo y la contraseña inicial por un canal privado; puede cambiarla al entrar.`);
      setClienteId("");
      setNombre("");
      setEmail("");
      setCedula("");
      setPassword("");
      setAbierto(false);
      router.refresh();
    });
  }

  function desactivar(id: string) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const r = await desactivarUsuarioCliente(id, motivo);
      if (!r.ok) return setError(r.error);
      setDesactivando(null);
      setMotivo("");
      setAviso("Desactivado. Si entra, el portal no le muestra nada.");
      router.refresh();
    });
  }

  function activar(id: string) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const r = await activarUsuarioCliente(id);
      if (!r.ok) return setError(r.error);
      setAviso("Activado de nuevo.");
      router.refresh();
    });
  }

  const f = filtro.trim().toLowerCase();
  const visibles = f ? usuarios.filter((u) => `${u.nombre ?? ""} ${u.email} ${u.cliente}`.toLowerCase().includes(f)) : usuarios;

  return (
    <div className="space-y-3">
      {aviso && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{aviso}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {!abierto ? (
        <button
          type="button"
          disabled={!puedeCrear}
          onClick={() => {
            setAbierto(true);
            setPassword(contrasenaSugerida());
          }}
          className="flex min-h-11 w-full items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          + Crear usuario de cliente
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border-2 border-slate-900 bg-white p-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-600">Cliente</span>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={CAMPO}>
              <option value="">— Escoge —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.nit ? ` · ${c.nit}` : ""}
                </option>
              ))}
            </select>
            {clientes.length === 0 && <span className="text-xs text-slate-500">No hay clientes activos que puedas ver.</span>}
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">Nombre de la persona</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-600">Cargo</span>
              <input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Administrador, Revisor fiscal…" className={CAMPO} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">Cédula (opcional; se precarga al firmar)</span>
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" className={CAMPO} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-600">Correo (con el que entra)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">Contraseña inicial (mínimo 10)</span>
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={`${CAMPO} font-mono`} />
              <button type="button" onClick={() => setPassword(contrasenaSugerida())} className="mt-0.5 min-h-11 shrink-0 rounded-md border border-slate-300 px-2 text-xs">
                Otra
              </button>
            </div>
          </label>
          <p className="text-xs text-slate-500">Se crea con el rol «Cliente» (solo el Portal del cliente) y queda enlazado al cliente escogido. No ve ningún módulo del ERP.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-11 rounded-md border border-slate-300 text-sm font-semibold text-slate-700">
              Cancelar
            </button>
            <button type="button" disabled={pendiente || !clienteId} onClick={crear} className="min-h-11 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:bg-slate-400">
              {pendiente ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </div>
      )}
      {!puedeCrear && <p className="text-xs text-slate-500">Para crear usuarios hace falta la clave secreta de Supabase en el servidor, el rol «Cliente» y que ese rol no tenga módulos del ERP.</p>}

      {usuarios.length > 5 && <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por nombre, correo o cliente" className={CAMPO} />}

      {usuarios.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay usuarios de cliente.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">
          {visibles.map((u) => (
            <li key={u.perfilId} className={`space-y-1 p-3 text-sm ${u.activo ? "" : "bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{u.nombre ?? u.email}</p>
                  <p className="truncate text-xs text-slate-600">{u.email}</p>
                  <p className="text-xs text-slate-700">
                    {u.cliente}
                    {u.cargo ? ` · ${u.cargo}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    Creado {fecha(u.creadoEn)} · último ingreso {fecha(u.ultimoIngreso)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${u.activo ? "bg-green-100 text-green-900" : "bg-slate-200 text-slate-700"}`}>
                  {u.activo ? "Activo" : "Desactivado"}
                </span>
              </div>
              {!u.rolEsCliente && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Su rol ya no es «Cliente» (lo cambiaron en Usuarios y permisos). Revísalo.</p>}
              {u.desactivadoEn && (
                <p className="text-xs text-slate-600">
                  {u.activo ? "Última desactivación" : "Desactivado"} {fecha(u.desactivadoEn)}: {u.motivo}
                </p>
              )}
              {u.activo ? (
                desactivando === u.perfilId ? (
                  <div className="space-y-2 rounded-md bg-slate-50 p-2">
                    <label className="block">
                      <span className="text-xs text-slate-600">Motivo (queda en el registro)</span>
                      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: cambió el administrador del conjunto" className={CAMPO} autoFocus />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setDesactivando(null)} className="min-h-11 rounded-md border border-slate-300 text-xs font-semibold">
                        Cancelar
                      </button>
                      <button type="button" disabled={pendiente || motivo.trim().length < 4} onClick={() => desactivar(u.perfilId)} className="min-h-11 rounded-md bg-red-700 text-xs font-semibold text-white disabled:bg-slate-300">
                        Desactivar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDesactivando(u.perfilId);
                      setMotivo("");
                    }}
                    className="min-h-11 text-xs font-semibold text-red-700 underline"
                  >
                    Desactivar
                  </button>
                )
              ) : (
                <button type="button" disabled={pendiente} onClick={() => activar(u.perfilId)} className="min-h-11 text-xs font-semibold underline">
                  Activar de nuevo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
