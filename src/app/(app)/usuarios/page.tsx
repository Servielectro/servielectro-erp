import { redirect } from "next/navigation";

// La pantalla se mudó adentro del módulo Configuración; se deja la ruta vieja para
// que no se rompan enlaces guardados.
export default function UsuariosPage() {
  redirect("/configuracion/usuarios");
}
