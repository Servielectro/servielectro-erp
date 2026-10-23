import type { AccesosMenu } from "@/components/MenuPrincipal";

// Las secciones de la navegación global, UNA sola lista para la barra (pantalla ancha) y la
// hamburguesa (pantalla angosta): así nunca muestran cosas distintas. Cada sección aparece
// solo si el usuario tiene ese módulo habilitado (regla de Jhojan: si a Alejandra solo se le
// habilita RRHH y Licitaciones, solo ve eso). Ocultar es comodidad: las rutas igual se
// protegen en el servidor (requierePermiso) y los datos en la base (RLS).

export interface EnlaceMenu {
  nombre: string;
  href: string;
  /** 2 = va debajo de otro hijo (Catálogo, dentro de Cotizaciones). */
  nivel?: 2;
}
export interface SeccionMenu {
  id: string;
  /** Corto, para la barra. */
  nombre: string;
  /** Largo, para la hamburguesa. */
  nombreLargo?: string;
  nota?: string;
  href: string;
  hijos: EnlaceMenu[];
}

export function seccionesMenu(a: AccesosMenu): SeccionMenu[] {
  const s: SeccionMenu[] = [];
  if (a.modulos.includes("comercial")) {
    s.push({
      id: "comercial",
      nombre: "Comercial",
      href: "/comercial",
      hijos: [
        { nombre: "Cotizaciones", href: "/comercial/cotizaciones" },
        { nombre: "Catálogo de ítems", href: "/comercial/catalogo", nivel: 2 },
        { nombre: "CRM", href: "/comercial/crm" },
      ],
    });
  }
  if (a.modulos.includes("rrhh")) {
    s.push({
      id: "rrhh",
      nombre: "RRHH",
      href: "/rrhh",
      hijos: [
        { nombre: "Personal", href: "/rrhh/personal" },
        { nombre: "Contratos laborales", href: "/rrhh/contratos" },
        { nombre: "Plantillas y cláusulas de contrato", href: "/rrhh/contratos/plantillas", nivel: 2 },
        { nombre: "Parámetros de liquidación", href: "/rrhh/parametros" },
        { nombre: "Gastos del personal", href: "/rrhh/gastos" },
        { nombre: "Permisos", href: "/rrhh/permisos" },
        { nombre: "Abonos de nómina", href: "/rrhh/abonos" },
        { nombre: "Documentos del personal", href: "/rrhh/documentos" },
        { nombre: "Plantillas Word (contrato)", href: "/rrhh/plantillas" },
      ],
    });
  }
  // Planificación: solo con planificacion/trabajar (lo que exige su pantalla; el técnico no).
  if (a.planificacion) {
    s.push({ id: "planificacion", nombre: "Planificación", href: "/planificacion", hijos: [{ nombre: "📅 Agenda", href: "/planificacion/agenda" }] });
  }
  if (a.modulos.includes("proyectos")) {
    s.push({ id: "proyectos", nombre: "Proyectos", href: "/proyectos", hijos: [] });
  }
  if (a.modulos.includes("operativo")) {
    s.push({
      id: "operativo",
      nombre: "Operativo",
      nombreLargo: "Operativo — visitas técnicas",
      href: "/operativo",
      hijos: [
        { nombre: "Tablero de tareas", href: "/operativo/tareas" },
        { nombre: "Sugerencias de los técnicos", href: "/operativo/sugerencias" },
        { nombre: "Agenda del equipo", href: "/operativo/agenda" },
      ],
    });
  }
  // Técnico: tecnico/trabajar (con solo "consultar", /tecnico lo devolvería al inicio).
  if (a.campoTecnico) {
    s.push({ id: "tecnico", nombre: "Técnico", nombreLargo: "Técnico — mis visitas", href: "/tecnico", hijos: [] });
  }
  if (a.modulos.includes("licitaciones")) {
    s.push({ id: "licitaciones", nombre: "Licitaciones", nota: "en construcción", href: "/licitaciones", hijos: [] });
  }
  if (a.modulos.includes("configuracion")) {
    s.push({
      id: "configuracion",
      nombre: "Configuración",
      href: "/configuracion",
      hijos: [
        { nombre: "🔐 Usuarios y permisos", href: "/configuracion/usuarios" },
        ...(a.configResponsable
          ? [
              { nombre: "👥 Grupos", href: "/configuracion/grupos" },
              { nombre: "🔁 Transferir tareas", href: "/configuracion/transferir" },
            ]
          : []),
      ],
    });
  }
  return s;
}
