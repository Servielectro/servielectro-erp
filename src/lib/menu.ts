import type { AccesosMenu } from "@/components/MenuPrincipal";

// Las secciones de la navegación global, UNA sola lista para la barra (pantalla ancha), la
// hamburguesa (pantalla angosta) y el buscador de secciones: así nunca muestran cosas distintas.
// Cada sección aparece solo si el usuario tiene ese módulo habilitado (regla de Jhojan: si a
// Alejandra solo se le habilita RRHH y Licitaciones, solo ve eso, también al buscar). Ocultar es
// comodidad: las rutas igual se protegen en el servidor (requierePermiso) y los datos en la base.
//
// `palabras`: lo que alguien escribiría para llegar ahí aunque no sea el nombre ("desprendible"
// lleva a Documentos del personal). Solo para el buscador; no se muestran.

export interface EnlaceMenu {
  nombre: string;
  href: string;
  /** 2 = va debajo de otro hijo (Catálogo, dentro de Cotizaciones). */
  nivel?: 2;
  /** Para el buscador: qué hay ahí, en palabras de quien lo busca. */
  palabras?: string;
}
export interface SeccionMenu {
  id: string;
  /** Corto, para la barra. */
  nombre: string;
  /** Largo, para la hamburguesa. */
  nombreLargo?: string;
  nota?: string;
  href: string;
  palabras?: string;
  hijos: EnlaceMenu[];
}

export function seccionesMenu(a: AccesosMenu): SeccionMenu[] {
  const ocultas = new Set(a.seccionesOcultas ?? []);
  // Permisos por sección (migración 122): lo que se le quitó al rol no sale.
  return armarSecciones(a)
    .map((s) => ({ ...s, hijos: s.hijos.filter((h) => !ocultas.has(h.href)) }));
}

function armarSecciones(a: AccesosMenu): SeccionMenu[] {
  const s: SeccionMenu[] = [];
  // Portal del cliente (migración 134): lo único que tiene el rol Cliente. Va primero porque, para
  // ese usuario, es lo único del menú. Ningún rol interno lo trae por defecto.
  if (a.modulos.includes("cliente")) {
    s.push({
      id: "cliente",
      nombre: "Mi portal",
      nombreLargo: "Portal del cliente",
      href: "/cliente/proyectos",
      palabras: "portal cliente conjunto administrador",
      hijos: [
        { nombre: "Mis proyectos", href: "/cliente/proyectos", palabras: "obra contrato estado fechas" },
        { nombre: "Documentos del proyecto", href: "/cliente/documentos", palabras: "descargar contrato póliza acta informe plano factura cronograma" },
        { nombre: "Personal en obra", href: "/cliente/personal", palabras: "técnicos cédula alturas curso afiliación ingreso portería" },
        { nombre: "Documentos por firmar", href: "/cliente/firmas", palabras: "firmar acta contratante pendiente" },
      ],
    });
  }
  if (a.modulos.includes("comercial")) {
    s.push({
      id: "comercial",
      nombre: "Comercial",
      href: "/comercial",
      palabras: "ventas oferta propuesta",
      hijos: [
        { nombre: "Cotizaciones", href: "/comercial/cotizaciones", palabras: "cotización cotizar oferta propuesta presupuesto precio imprimir pdf aiu iva" },
        { nombre: "Catálogo de ítems", href: "/comercial/catalogo", nivel: 2, palabras: "ítems items productos materiales equipos mano de obra precios proveedor lista" },
        { nombre: "CRM", href: "/comercial/crm", palabras: "oportunidades negocios prospectos leads embudo pipeline seguimiento renovación" },
        { nombre: "Clientes del CRM", href: "/comercial/crm/clientes", palabras: "cliente cotizaciones empresa contacto" },
      ],
    });
  }
  // Administrativo (decisión del 2026-10-25): los maestros, "quién es y cómo lo contacto".
  if (a.modulos.includes("administrativo")) {
    s.push({
      id: "administrativo",
      nombre: "Administrativo",
      href: "/administrativo",
      palabras: "maestros terceros proveedores",
      hijos: [
        { nombre: "Clientes", href: "/administrativo/clientes", palabras: "cliente nit dv empresa contacto sedes rut dian dirección facturación electrónica dane exportar excel" },
        ...(a.administrativoTrabajar
          ? [{ nombre: "Importar clientes de SIIGO", href: "/administrativo/clientes/importar", nivel: 2 as const, palabras: "siigo importar excel subir terceros" }]
          : []),
        { nombre: "Referenciados", href: "/administrativo/referidos", palabras: "referido referidos agente comercial freelance comisión plan prospecto registro oportunidad vence" },
        { nombre: "Comisiones", href: "/administrativo/comisiones", palabras: "comisión comisiones referido liquidar pagar aprobar recaudo" },
      ],
    });
  }
  if (a.modulos.includes("rrhh")) {
    s.push({
      id: "rrhh",
      nombre: "RRHH",
      href: "/rrhh",
      palabras: "recursos humanos talento humano nómina empleados",
      hijos: [
        { nombre: "Personal", href: "/rrhh/personal", palabras: "empleado colaborador ficha hoja de vida dotación tallas carnet eps arl pensión salario liquidación" },
        { nombre: "Contratos laborales", href: "/rrhh/contratos", palabras: "contrato término fijo indefinido obra labor prestación de servicios renovar otro sí pólizas cronograma" },
        { nombre: "Plantillas y cláusulas de contrato", href: "/rrhh/contratos/plantillas", nivel: 2, palabras: "cláusulas plantilla texto legal abogado" },
        { nombre: "Parámetros de liquidación", href: "/rrhh/parametros", palabras: "salario mínimo smmlv auxilio de transporte ley porcentajes aportes prestaciones arl recargos" },
        { nombre: "Caja menor (viáticos)", href: "/rrhh/caja-menor", palabras: "viáticos viaje fuera de la ciudad hotel alimentación saldo legalizar" },
        { nombre: "Gastos del personal", href: "/rrhh/gastos", palabras: "gastos compras facturas transportes reembolso materiales" },
        { nombre: "Permisos", href: "/rrhh/permisos", palabras: "permiso calamidad cita médica licencia ausencia aprobar gozado" },
        { nombre: "Abonos de nómina", href: "/rrhh/abonos", palabras: "abono adelanto préstamo anticipo nómina quincena descuento transferencia" },
        { nombre: "Documentos del personal", href: "/rrhh/documentos", palabras: "desprendible desprendibles colilla de pago liquidación certificado firmar" },
        { nombre: "Plantillas Word (contrato)", href: "/rrhh/plantillas", palabras: "word docx modelo plantilla" },
      ],
    });
  }
  // Planificación: solo con planificacion/trabajar (lo que exige su pantalla; el técnico no).
  if (a.planificacion) {
    s.push({
      id: "planificacion",
      nombre: "Planificación",
      href: "/planificacion",
      palabras: "tareas pendientes administrativo",
      hijos: [{ nombre: "📅 Agenda", href: "/planificacion/agenda", palabras: "agenda calendario eventos reuniones" }],
    });
  }
  if (a.modulos.includes("proyectos")) {
    s.push({ id: "proyectos", nombre: "Proyectos", href: "/proyectos", palabras: "proyecto obra obras", hijos: [] });
  }
  if (a.modulos.includes("operativo")) {
    s.push({
      id: "operativo",
      nombre: "Operativo",
      nombreLargo: "Operativo — visitas técnicas",
      href: "/operativo",
      palabras: "visitas técnicas mantenimiento orden de servicio asignar técnico",
      hijos: [
        { nombre: "Tablero de tareas", href: "/operativo/tareas", palabras: "tareas kanban pendientes" },
        { nombre: "Sugerencias de los técnicos", href: "/operativo/sugerencias", palabras: "sugerencias hallazgos recomendaciones" },
        { nombre: "Agenda del equipo", href: "/operativo/agenda", palabras: "agenda calendario programación" },
      ],
    });
  }
  // Técnico: tecnico/trabajar (con solo "consultar", /tecnico lo devolvería al inicio).
  if (a.campoTecnico) {
    s.push({
      id: "tecnico",
      nombre: "Técnico",
      nombreLargo: "Técnico — mis visitas",
      href: "/tecnico",
      palabras: "mis visitas firma fotos entrada salida",
      hijos: [
        { nombre: "Mis gastos y transportes", href: "/tecnico/gastos", palabras: "gasto compra factura transporte taxi" },
        { nombre: "Mis permisos", href: "/tecnico/permisos", palabras: "permiso calamidad cita" },
        { nombre: "Mis abonos de nómina", href: "/tecnico/abonos", palabras: "abono adelanto" },
        { nombre: "Mis documentos y certificados", href: "/tecnico/documentos", palabras: "desprendible certificado firmar" },
        // Migración 131: formatos SG-SST a los que lo convocaron (no le da el módulo SG-SST).
        { nombre: "Documentos por firmar", href: "/tecnico/por-firmar", palabras: "firmar capacitación inducción convocado pendiente sst for-02 material" },
      ],
    });
  }
  if (a.modulos.includes("sgsst")) {
    s.push({
      id: "sgsst",
      nombre: "SG-SST",
      href: "/sgsst",
      palabras: "seguridad y salud en el trabajo sst",
      hijos: [
        ...(a.sgsstTrabajar
          ? [{ nombre: "Llenar formato en sitio", href: "/sgsst/campo", palabras: "ats permiso de trabajo alturas inspección escaleras herramientas trabajo en caliente firmar llenar" }]
          : []),
        { nombre: "Formatos llenados", href: "/sgsst/formatos", palabras: "ats permiso inspección firmado aprobar pdf sellado íntegro" },
        { nombre: "Plantillas de formatos", href: "/sgsst/plantillas", palabras: "armar armador formato plantilla campos" },
        { nombre: "Actos y condiciones inseguras", href: "/sgsst/reportes", palabras: "reporte riesgo inseguro condición acto" },
        { nombre: "Accidentes e incidentes", href: "/sgsst/eventos", palabras: "accidente incidente arl eps furat investigación" },
        { nombre: "Plan de trabajo", href: "/sgsst/plan", palabras: "estándares mínimos 0312 avance evidencias auditoría" },
        { nombre: "Plazos de reporte", href: "/sgsst/plazos", palabras: "plazo días arl eps investigación" },
        { nombre: "Personal", href: "/sgsst/personal", palabras: "examen médico aptitud alturas afiliación eps arl epp capacitación contratista" },
        { nombre: "Equipos contra caídas", href: "/sgsst/equipos", palabras: "arnés eslinga epcc inspección equipo hoja de vida" },
        { nombre: "Capacitaciones e inducción", href: "/sgsst/capacitaciones", palabras: "for-02 inducción reinducción capacitación asistencia firma charla" },
        { nombre: "Materiales de capacitación", href: "/sgsst/materiales", palabras: "material presentación pdf inducción lectura subir" },
        { nombre: "Actas de obra", href: "/sgsst/actas-obra", palabras: "acta obra firmada inicio proyecto técnicos en obra" },
        // Último, a propósito (Jhojan: "en la parte de abajo, el último módulo").
        { nombre: "Sugerencias para la aplicación", href: "/sgsst/sugerencias", palabras: "sugerencia nota mejora libreta idea" },
      ],
    });
  }
  // Contable y Financiero (migraciones 128 y 129): espejo de SOLO LECTURA de Siigo.
  if (a.modulos.includes("contable")) {
    s.push({
      id: "contable",
      nombre: "Contable",
      href: "/contable",
      palabras: "siigo contabilidad contadora",
      hijos: [
        { nombre: "Clientes en Siigo", href: "/contable/clientes", palabras: "terceros siigo clientes nit" },
        { nombre: "Proveedores en Siigo", href: "/contable/proveedores", palabras: "terceros siigo proveedores nit" },
        { nombre: "Cuentas por tercero", href: "/contable/cuentas-tercero", palabras: "balance por tercero cartera 1305 saldo" },
        { nombre: "Balances", href: "/contable/balances", palabras: "balance de prueba puc cuentas saldos cierre" },
        { nombre: "IVA", href: "/contable/iva", palabras: "iva generado descontable dian cuatrimestre bimestre 2408 impuesto" },
        { nombre: "Conciliación con el ERP", href: "/contable/conciliacion", palabras: "cruzar terceros nit diferencias" },
        { nombre: "Conexión con Siigo", href: "/contable/conexion", palabras: "siigo api credenciales partner sincronización configuración" },
      ],
    });
  }
  if (a.modulos.includes("financiero")) {
    s.push({
      id: "financiero",
      nombre: "Financiero",
      href: "/financiero",
      palabras: "plata dinero siigo",
      hijos: [
        { nombre: "Ventas", href: "/financiero/ventas", palabras: "ventas facturado mes año bimestre cuatrimestre clientes ítems" },
        { nombre: "Facturación", href: "/financiero/facturacion", palabras: "facturas venta compra nota crédito documento soporte cufe" },
        { nombre: "Cuentas por pagar", href: "/financiero/cuentas-pagar", palabras: "proveedores deudas vencimiento pagar" },
        { nombre: "Rentabilidad por proyecto", href: "/financiero/rentabilidad", palabras: "margen utilidad costo obra proyecto ganancia" },
      ],
    });
  }
  // Marketing (migraciones 125 y 126): calendario de ideas que sale del trabajo real.
  if (a.modulos.includes("marketing")) {
    s.push({
      id: "marketing",
      nombre: "Marketing",
      href: "/marketing",
      palabras: "redes sociales contenido publicaciones linkedin instagram facebook",
      hijos: [
        { nombre: "Calendario de contenido", href: "/marketing/calendario", palabras: "calendario publicaciones fecha programar semana" },
        { nombre: "Ideas", href: "/marketing/ideas", palabras: "idea guion carrusel video post caso de obra aprobar" },
        { nombre: "Campañas", href: "/marketing/campanas", palabras: "campaña objetivo público" },
        { nombre: "Biblioteca de fotos", href: "/marketing/biblioteca", palabras: "fotos videos material autorización cliente" },
        { nombre: "Cuentas conectadas", href: "/marketing/cuentas", palabras: "cuentas redes linkedin instagram facebook conectar" },
        { nombre: "Reportes", href: "/marketing/reportes", palabras: "métricas alcance interacciones resultados" },
      ],
    });
  }
  if (a.modulos.includes("licitaciones")) {
    s.push({ id: "licitaciones", nombre: "Licitaciones", nota: "en construcción", href: "/licitaciones", palabras: "licitación secop pliegos", hijos: [] });
  }
  if (a.modulos.includes("configuracion")) {
    s.push({
      id: "configuracion",
      nombre: "Configuración",
      href: "/configuracion",
      palabras: "ajustes",
      hijos: [
        { nombre: "🔐 Usuarios y permisos", href: "/configuracion/usuarios", palabras: "usuarios roles permisos acceso contraseña" },
        ...(a.configResponsable
          ? [
              { nombre: "👥 Grupos", href: "/configuracion/grupos", palabras: "grupos equipos" },
              { nombre: "🔁 Transferir tareas", href: "/configuracion/transferir", palabras: "transferir reasignar tareas" },
              { nombre: "🏢 Usuarios del portal del cliente", href: "/configuracion/portal-cliente", palabras: "cliente portal acceso conjunto administrador externo usuario" },
              { nombre: "⚠ Reportes de problema", href: "/configuracion/problemas", palabras: "problema error bug falla daño reporte registrar" },
            ]
          : []),
      ],
    });
  }
  return s;
}

export interface ResultadoBusqueda {
  nombre: string;
  /** Dónde está ("RRHH"), para no confundir dos con el mismo nombre. */
  donde: string | null;
  href: string;
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ");

/**
 * Busca entre las secciones que el usuario tiene (las que ya filtró seccionesMenu). Cada palabra
 * escrita tiene que aparecer, al comienzo de una palabra, en el nombre, en `palabras` o en el
 * nombre de la sección a la que pertenece. Primero las que coinciden por nombre.
 */
export function buscarSecciones(secciones: SeccionMenu[], texto: string): ResultadoBusqueda[] {
  const terminos = normalizar(texto).split(" ").filter(Boolean);
  if (!terminos.length) return [];
  const contiene = (fuente: string, t: string) => (" " + normalizar(fuente)).includes(" " + t);
  const puntos: { r: ResultadoBusqueda; p: number }[] = [];
  for (const s of secciones) {
    const candidatos: { r: ResultadoBusqueda; nombre: string; extra: string }[] = [
      { r: { nombre: s.nombreLargo ?? s.nombre, donde: null, href: s.href }, nombre: `${s.nombre} ${s.nombreLargo ?? ""}`, extra: s.palabras ?? "" },
      ...s.hijos.map((h) => ({
        r: { nombre: h.nombre.replace(/^\p{Extended_Pictographic}\s*/u, ""), donde: s.nombre, href: h.href },
        nombre: h.nombre,
        extra: `${h.palabras ?? ""} ${s.nombre} ${s.palabras ?? ""}`,
      })),
    ];
    for (const c of candidatos) {
      if (!terminos.every((t) => contiene(c.nombre, t) || contiene(c.extra, t))) continue;
      const enNombre = terminos.filter((t) => contiene(c.nombre, t)).length;
      puntos.push({ r: c.r, p: enNombre * 10 + (c.r.donde ? 0 : 1) });
    }
  }
  return puntos.sort((a, b) => b.p - a.p).map((x) => x.r).slice(0, 12);
}
