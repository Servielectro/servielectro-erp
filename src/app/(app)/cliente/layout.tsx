import { requierePermiso, seccionesOcultas } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { PestanasPortal } from "./PestanasPortal";

// Portal del cliente (migración 134). Dos candados, los dos del lado del servidor:
//  1) el rol tiene que tener el módulo "cliente" (el layout de (app) además corta las secciones
//     recortadas al rol);
//  2) la cuenta tiene que estar ENLAZADA y ACTIVA en cliente_usuarios (fn_cliente_actual). Sin eso
//     las vistas devuelven vacío; aquí se dice por qué en lugar de mostrar pantallas vacías.
// Lo que de verdad protege los datos son las vistas v_cliente_* y la RLS: esto es la puerta.
export default async function ClienteLayout({ children }: { children: React.ReactNode }) {
  await requierePermiso("cliente", "consultar");
  const supabase = await createClient();
  const [{ data: clienteId }, { ocultas }] = await Promise.all([supabase.rpc("fn_cliente_actual"), seccionesOcultas()]);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-24 pt-3 lg:max-w-3xl">
      {clienteId ? (
        <>
          <PestanasPortal ocultas={ocultas} />
          {children}
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
          <p className="font-bold">Tu acceso al portal no está activo.</p>
          <p className="mt-1 text-sm">
            Esta cuenta no está enlazada a un cliente, o el acceso se desactivó. Comunícate con Servielectro para que lo revisen.
          </p>
        </div>
      )}
    </div>
  );
}
