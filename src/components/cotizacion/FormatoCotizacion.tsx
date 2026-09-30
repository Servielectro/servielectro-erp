import { formatCOP, type Categoria } from "@/lib/pricing";

// Réplica del documento formal real (PDF CSE-26-104 "CCTV Analíticas Tintal II",
// generado desde el Excel de Jhojan): carta, página 1 = encabezado + datos + las tres
// secciones de ítems; página 2 = resumen de la oferta con AIU, valores agregados,
// observaciones y condiciones comerciales.

const SECCIONES: { cat: Categoria; titulo: string; total: string }[] = [
  { cat: "EQUIPO", titulo: "SUMINISTRO DE EQUIPOS", total: "TOTAL EQUIPOS" },
  { cat: "MANO_DE_OBRA", titulo: "MANO DE OBRA E INSTALACIÓN", total: "TOTAL MANO DE OBRA" },
  { cat: "MATERIAL", titulo: "MATERIALES PARA INSTALACIÓN", total: "TOTAL MATERIALES" },
];

// Datos fijos de la empresa tal como salen en el encabezado del documento real.
const EMPRESA = {
  razonSocial: "SERVICIOS ELECTRÓNICOS INDUSTRIALES SAS",
  nitDireccion: "NIT: 901.235.322-4 - CALLE 36 SUR NO. 69 A 06, PISO 5, EDIFICIO ZN",
  lineas: [
    "PROYECTOS DE INGENIERÍA ELECTRÓNICA ENFOCADA EN SEGURIDAD Y PROYECTOS EFICIENTES.",
    "GESTIÓN ADMINISTRATIVA Y OPERATIVA DE SEGURIDAD ELECTRÓNICA.",
    "Proyectos Especiales, Capacitaciones. Consultoría - Auditoría e Interventoría - Mano de obra certificada a nivel nacional.",
  ],
  ciudad: "BOGOTÁ",
  correo: "servielectrobogota@gmail.com",
  movil: "300 489 3392",
};

// Textos fijos de la página 2, del documento real. [texto, resaltado en rojo]
type Tramo = [string, boolean?];

const VALORES_AGREGADOS: Tramo[] = [
  ["Se realiza la entrega de la carpeta de ingeniería que incluye: Planimetría de cableado y tubería, posicionamiento en plano de dispositivos, cuadro de conexiones y configuración de colores punto por punto, fichas técnicas de equipos, certificado de capacitación a personal autorizado (Dossier relacionado con un proyecto de seguridad electrónica). "],
  ["ENTREGABLES ADICIONALES COMO VALOR AGREGADO:", true],
  [" • AVANCE PARA GESTIÓN DOCUMENTAL DE MANTENIMIENTOS: • Bitácoras para registro de mantenimientos preventivos y correctivos del sistema • Hoja de vida de equipos para aseguramiento de los mismos en pólizas del conjunto • Viabilidad para procesos predictivos y proactivos del sistema con el fin de obtener el mayor rendimiento en ingeniería de mantenimientos basados en MRR y mejoramiento del sistema. • Programa de Gestión de Activos."],
];

const OBSERVACIONES: Tramo[] = [
  ["Junto con la planeación y para el inicio y durante el proyecto se entrega:", true],
  [" • "],
  ["Acta de constitución de proyecto", true],
  [" mediante metodologías de Gestión de Proyectos (Project Charter - documento formal que autoriza el inicio, objetivos, alcance, gerente asignado y presupuesto inicial) • Cronograma basado en tiempos de ejecución y priorización de costos de activos y mano de obra. • "],
  ["Documentación de Acta de Inicio de obra", true],
  [" para stakeholders del proyecto (involucrados en el proyecto). • Planeación de criticidad y fases de proyecto para seguimiento del mismo; "],
  ["Plan para la Dirección del Proyecto:", true],
  [" El plan integral que guía la ejecución. • "],
  ["Documentación de personal", true],
  [" de ejecución (Parafiscales, certificados de manejo de marca, certificado de EPP's). • "],
  ["Informes de Estado y Progreso:", true],
  [" Documentos periódicos sobre el desempeño (avance, presupuesto, hitos). • "],
  ["Informe Final del Proyecto:", true],
  [" Resumen del desempeño, metas alcanzadas y desviaciones. • Documentación Técnica/Manuales: Manuales de usuario, documentación técnica de producto o planos finales. • "],
  ["Cierre Administrativo y Contractual:", true],
  [" Liquidación de contratos, pagos finales y liberación de recursos."],
];

export interface FormatoCotizacionItem {
  id: string;
  categoria: Categoria;
  descripcion: string;
  descripcionLarga: string | null;
  cantidad: number;
  unidad: string;
  valorCalculoUnitario: number;
}

export interface FormatoCotizacionHito {
  id: string;
  nombre: string;
  porcentaje: number;
  valorProgramado: number;
}

export interface FormatoCotizacionTotales {
  subtotalCalculo: number;
  valorAdmin: number;
  valorImprevistos: number;
  valorUtilidadAiu: number;
  subtotalGeneral: number;
  valorIva: number;
  total: number;
}

/** Porcentajes como fracción (0.05 = 5%), para mostrarlos en el resumen. */
export interface FormatoCotizacionPorcentajes {
  admin: number;
  imprevistos: number;
  utilidad: number;
  iva: number;
}

export interface FormatoCotizacionConfiguracionEmpresa {
  textoDespachoAprobacion: string | null;
  bancoNombre: string | null;
  bancoTipoCuenta: string | null;
  bancoNumeroCuenta: string | null;
  bancoTitular: string | null;
  textoGarantia: string | null;
  textoValidezOferta: string | null;
}

export interface FormatoCotizacionPoliza {
  id: string;
  nombre: string;
}

export interface FormatoCotizacionProps {
  codigo: string;
  fecha: string;
  comercial: string | null;
  proyecto: string;
  cliente: {
    nombre: string;
    nit: string | null;
    direccion: string | null;
    email: string | null;
    contacto: string | null;
    telefono?: string | null;
  };
  items: FormatoCotizacionItem[];
  totales: FormatoCotizacionTotales | null;
  porcentajes?: FormatoCotizacionPorcentajes | null;
  diasEjecucion?: number | null;
  /**
   * Valores agregados marcados en la cotización. `null`/omitido = cotización anterior al
   * mecanismo: sale el bloque fijo de siempre. Lista vacía = sin bloque.
   */
  valoresAgregados?: { id?: string; titulo: string; texto: string }[] | null;
  /**
   * Bloques del documento (valores agregados, observaciones, los que haya) marcados en
   * la cotización, en orden. Si viene, manda: cada bloque es una sección y ya no sale
   * ningún texto fijo. Si no viene (cotizaciones guardadas antes), se usa
   * `valoresAgregados` + el bloque fijo de observaciones, como siempre.
   */
  bloquesDocumento?: { id?: string; titulo: string; texto: string }[] | null;
  hitos: FormatoCotizacionHito[];
  configuracionEmpresa: FormatoCotizacionConfiguracionEmpresa | null;
  polizas: FormatoCotizacionPoliza[];
}

const ROJO = "bg-[#953735] text-white";
const BORDE = "border border-black";

/**
 * El documento que ve el cliente. Componente puro (sin fetch propio) para usarlo tanto
 * en /cotizaciones/[id]/imprimir (datos de la base) como en la Vista Previa en vivo del
 * armador (estado en memoria, antes de guardar). Ancho fijo de carta (816px = 8.5in).
 */
export function FormatoCotizacion({
  codigo,
  fecha,
  comercial,
  proyecto,
  cliente,
  items,
  totales,
  porcentajes,
  diasEjecucion,
  valoresAgregados,
  bloquesDocumento,
  hitos,
  configuracionEmpresa: conf,
  polizas,
}: FormatoCotizacionProps) {
  const subtotalDe = (cat: Categoria) =>
    items
      .filter((i) => i.categoria === cat)
      .reduce((acc, i) => acc + i.valorCalculoUnitario * i.cantidad, 0);

  const pct = (v: number | undefined) =>
    v === undefined ? "" : `${Math.round(v * 1000) / 10}%`;

  return (
    <div className="formato-cotizacion mx-auto w-[816px] bg-white p-10 font-sans text-[10px] leading-snug text-black shadow-sm print:w-full print:px-[0.45in] print:py-0 print:shadow-none">
      {/* Tabla externa: el membrete (logos, datos de Servielectro y del cliente) sale
          solo en la hoja 1; las hojas siguientes siguen directo con la tabla. Cada bloque
          es una fila, así ningún bloque se corta feo: las filas de ítems no se parten y
          el título de la sección y los de columna se repiten si la sección continúa. La
          cantidad de hojas crece sola con lo largo de cada bloque. */}
      <table className="w-full border-collapse">
        {/* Espaciadores del margen superior e inferior: se repiten en cada hoja impresa
            (en pantalla no ocupan lugar). El membrete NO va acá: sale solo en la hoja 1. */}
        <thead>
          <tr>
            <td className="p-0">
              <div className="hidden h-[0.45in] print:block" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td className="p-0">
              <div className="hidden h-[0.45in] print:block" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          {/* Membrete de la empresa: solo en la primera hoja. */}
          <tr>
            <td className="p-0">
      {/* ------------------------- Encabezado ------------------------- */}
              <div className={`grid grid-cols-[1.45fr_1fr] ${BORDE}`}>
                <div className="flex flex-col justify-center gap-0.5 border-r border-black px-3 py-2 text-center text-[9px]">
                  <p className="font-bold text-[#953735]">{EMPRESA.razonSocial}</p>
                  <p className="font-bold">{EMPRESA.nitDireccion}</p>
                  <p>{EMPRESA.lineas[0]}</p>
                  <p className="font-bold text-[#953735]">{EMPRESA.lineas[1]}</p>
                  <p>{EMPRESA.lineas[2]}</p>
                </div>
                <div className="flex items-center gap-2 px-2 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- en impresión next/image no aporta y complica el tamaño exacto */}
                  <img src="/logo-servielectro.png" alt="Servielectro" className="w-[62%]" />
                  <div className="flex flex-1 flex-col items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logos/gmi.png" alt="GMI Gestión Mantenimiento Industrial" className="h-[22px] w-auto" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logos/besafe.png" alt="beSafe" className="h-[15px] w-auto" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logos/perimetral.png" alt="Perimetral" className="h-[20px] w-auto" />
                  </div>
                </div>
              </div>

            </td>
          </tr>
          <tr>
            <td className="p-0">
      {/* ------------------------- Datos ------------------------- */}
              <table className={`mt-0 w-full border-collapse ${BORDE} border-t-0`}>
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[45%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                  <col className="w-[19%]" />
                </colgroup>
                <tbody className="[&_td]:border [&_td]:border-black [&_td]:px-1 [&_td]:py-[1px]">
                  <tr>
                    <td className="font-bold">PROYECTO:</td>
                    <td className="text-center font-bold">{cliente.nombre || "—"}</td>
                    <td className="font-bold">COTIZACIÓN</td>
                    <td className="font-bold">CIUDAD:</td>
                    <td className="text-center font-bold">{EMPRESA.ciudad}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="bg-[#d9d9d9] text-center font-bold">CLIENTE</td>
                    <td className="text-center font-bold text-[#c00000]">{codigo}</td>
                    <td colSpan={2} className="bg-[#d9d9d9] text-center font-bold">SERVIELECTRO</td>
                  </tr>
                  <tr>
                    <td className="font-bold">Sr(a):</td>
                    <td className="text-center">{cliente.contacto || ""}</td>
                    <td rowSpan={2} className="text-center font-bold">PROYECTO</td>
                    <td colSpan={2} rowSpan={2} className="text-center font-bold">
                      {proyecto || "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">Empresa</td>
                    <td className="text-center font-bold">{cliente.nombre || ""}</td>
                  </tr>
                  <FilaDato l="NIT" v={cliente.nit} r="Fecha:" rv={new Date(fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" })} />
                  <FilaDato l="Dirección:" v={cliente.direccion} r="Comercial:" rv={comercial?.toUpperCase()} />
                  <FilaDato l="Celular:" v={cliente.telefono} r="Correo:" rv={EMPRESA.correo} />
                  <FilaDato l="Email:" v={cliente.email} r="Móvil:" rv={EMPRESA.movil} />
                </tbody>
              </table>

            </td>
          </tr>
      {/* ------------------------- Secciones de ítems ------------------------- */}
      {SECCIONES.map(({ cat, titulo, total }) => {
        const lineas = items.filter((i) => i.categoria === cat);
        if (lineas.length === 0) return null;
        return (
          <tr key={cat}><td className="p-0"><section className="mt-4">
            <table className="w-full border-collapse">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[45%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className={ROJO}>
                <tr>
                  <th colSpan={6} className="pt-1 text-center font-bold">{titulo}</th>
                </tr>
                <tr className="[&_th]:px-1 [&_th]:pb-1 [&_th]:font-bold">
                  <th>Ítem</th>
                  <th>Descripción</th>
                  <th>Unidades</th>
                  <th>Cantidad</th>
                  <th>Valor Unidad</th>
                  <th>V/r. Total</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((it) => (
                  <tr key={it.id} className="break-inside-avoid border-b border-slate-300 align-middle">
                    <td className="px-1 py-1 text-center font-bold">{it.descripcion}</td>
                    <td className="px-1 py-1 text-center">{it.descripcionLarga || it.descripcion}</td>
                    <td className="px-1 py-1 text-center">{it.unidad}</td>
                    <td className="px-1 py-1 text-center">{it.cantidad}</td>
                    <td className="px-1 py-1 text-right">{formatCOP(it.valorCalculoUnitario)}</td>
                    <td className="px-1 py-1 text-right font-bold">
                      {formatCOP(it.valorCalculoUnitario * it.cantidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 flex break-before-avoid justify-end">
              <div className="flex w-[44%] border-2 border-black font-bold">
                <span className="flex-1 px-2 py-0.5 text-center">{total}</span>
                <span className="border-l-2 border-black px-2 py-0.5 text-right">
                  {formatCOP(subtotalDe(cat))}
                </span>
              </div>
            </div>
          </section></td></tr>
        );
      })}

      {items.length === 0 && (
        <tr><td className="py-10 text-center text-sm text-slate-600">Todavía no hay líneas cargadas.</td></tr>
      )}


          {/* Separador visual en pantalla; al imprimir, la fila siguiente empieza hoja. */}
          <tr className="print:hidden">
            <td className="py-6">
              <div className="border-t-2 border-dashed border-slate-300 text-center text-[9px] text-slate-400">
                hoja del resumen
              </div>
            </td>
          </tr>

          <tr className="salto-pagina">
            <td className="p-0">
      {/* ------------------------- Resumen oferta ------------------------- */}
      {totales && (
        <section className="mt-4 break-inside-avoid">
          <p className={`${ROJO} py-0.5 text-center font-bold`}>RESUMEN OFERTA</p>
          <div className="grid grid-cols-[1fr_auto]">
            <div className="text-center [&>p]:py-[1px]">
              <p>SUMINISTROS DE EQUIPOS</p>
              <p>MATERIALES PARA PROYECTO</p>
              <p>MANO DE OBRA PARA PROYECTO</p>
            </div>
            <div className="w-[34%] min-w-[240px] text-right [&>p]:py-[1px]">
              <p>{formatCOP(subtotalDe("EQUIPO"))}</p>
              <p>{formatCOP(subtotalDe("MATERIAL"))}</p>
              <p>{formatCOP(subtotalDe("MANO_DE_OBRA"))}</p>
            </div>
          </div>
          <CajaTotal label="PROYECTO" valor={totales.subtotalCalculo} />
          <div className="mt-2">
            {[
              ["ADMINISTRACIÓN", porcentajes?.admin, totales.valorAdmin],
              ["IMPREVISTOS", porcentajes?.imprevistos, totales.valorImprevistos],
              ["UTILIDAD", porcentajes?.utilidad, totales.valorUtilidadAiu],
            ]
              .filter(([, , v]) => (v as number) > 0)
              .map(([label, p, v]) => (
                <FilaResumen key={label as string} label={label as string} pct={pct(p as number | undefined)} valor={v as number} />
              ))}
          </div>
          <CajaTotal label="SUBTOTAL" valor={totales.subtotalGeneral} />
          <div className="mt-2">
            <FilaResumen label="IVA" pct={pct(porcentajes?.iva)} valor={totales.valorIva} negrita />
          </div>
          <CajaTotal label="TOTAL PROYECTO" valor={totales.total} />
        </section>
      )}

      {/* ------------------------- Bloques del documento ------------------------- */}
      {bloquesDocumento ? (
        // Esquema actual: cada bloque marcado es su propia sección, en el orden elegido.
        // El título es el encabezado de la sección; lo que va entre **…** sale en rojo.
        bloquesDocumento.map((b, i) => (
          <section key={b.id ?? i} className={`${i === 0 ? "mt-8" : "mt-6"} break-inside-avoid border border-black`}>
            <p className={`${ROJO} whitespace-pre-line py-0.5 text-center font-bold uppercase`}>
              {b.titulo}
            </p>
            <p className="whitespace-pre-line px-3 py-3 text-center font-bold">
              <TextoMarcado texto={b.texto} />
            </p>
          </section>
        ))
      ) : (
        <>
      {/* ---- Cotizaciones guardadas antes de los bloques: se imprimen como siempre ---- */}
      {valoresAgregados === undefined || valoresAgregados === null ? (
        <section className="mt-8 break-inside-avoid border border-black">
          <div className={`${ROJO} py-0.5 text-center font-bold`}>
            <p>VALORES AGREGADOS</p>
            <p>GERENCIAMIENTO Y CARPETA DE INGENIERÍA</p>
          </div>
          <p className="px-3 py-3 text-center font-bold">
            <Tramos tramos={VALORES_AGREGADOS} />
          </p>
        </section>
      ) : (
        valoresAgregados.length > 0 && (
          <section className="mt-8 border border-black">
            <p className={`${ROJO} py-0.5 text-center font-bold`}>VALORES AGREGADOS</p>
            {valoresAgregados.map((v, i) => (
              <div key={v.id ?? i} className={`break-inside-avoid ${i > 0 ? "border-t border-black" : ""}`}>
                <p className="pt-2 text-center font-bold uppercase text-[#953735]">{v.titulo}</p>
                <p className="whitespace-pre-line px-3 pb-3 pt-1 text-center font-bold">
                  <TextoConResaltado texto={v.texto} />
                </p>
              </div>
            ))}
          </section>
        )
      )}

      <section className="mt-6 break-inside-avoid border border-black">
        <p className={`${ROJO} py-0.5 text-center font-bold`}>
          OBSERVACIONES ADICIONALES DE LA EMPRESA CON EL PROYECTO:
        </p>
        <p className="px-3 py-3 text-center font-bold">
          <Tramos tramos={OBSERVACIONES} />
        </p>
      </section>
        </>
      )}

      {/* ------------------------- Condiciones comerciales ------------------------- */}
      <table className={`mt-6 w-full break-inside-avoid border-collapse ${BORDE}`}>
        <colgroup>
          <col className="w-[53%]" />
          <col className="w-[47%]" />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} className="border border-black py-0.5 text-center font-bold">
              CONDICIONES COMERCIALES
            </th>
          </tr>
        </thead>
        <tbody className="[&_td]:border [&_td]:border-black [&_td]:px-1 [&_td]:py-1">
          {conf?.textoDespachoAprobacion && (
            <FilaCondicion titulo="PLAZOS DE ENTREGA">
              <p>Plazos de entrega:</p>
              <p className="whitespace-pre-line">{conf.textoDespachoAprobacion}</p>
            </FilaCondicion>
          )}
          {(conf?.bancoNombre || conf?.bancoNumeroCuenta) && (
            <FilaCondicion titulo="DATOS BANCARIOS">
              <p>Cuentas Bancarias:</p>
              <p>
                <b>
                  {[conf.bancoNombre, conf.bancoTipoCuenta, conf.bancoNumeroCuenta && `No. ${conf.bancoNumeroCuenta}`]
                    .filter(Boolean)
                    .join(" ")}
                </b>
                {conf.bancoTitular && (
                  <>
                    {" "}a nombre de <b className="text-[#c00000]">{conf.bancoTitular}.</b>
                  </>
                )}
              </p>
            </FilaCondicion>
          )}
          {conf?.textoGarantia && (
            <FilaCondicion titulo="GARANTÍA">
              <p className="whitespace-pre-line">{conf.textoGarantia}</p>
            </FilaCondicion>
          )}
          {polizas.length > 0 && (
            <tr>
              <td className="text-center font-bold">Pólizas disponibles:</td>
              <td className="text-center">
                {polizas.map((p) => `*Póliza de ${p.nombre.toLowerCase()}`).join(" - ")}
              </td>
            </tr>
          )}
          {diasEjecucion ? (
            <tr>
              <td className="text-center font-bold">TIEMPO DE PROYECTO</td>
              <td className="text-center font-bold">
                Tiempo de ejecución del proyecto: {diasEjecucion} días hábiles laborales.
              </td>
            </tr>
          ) : null}
          {hitos.length > 0 && (
            <FilaCondicion titulo="FORMA DE PAGO">
              {hitos.map((h) => (
                <p key={h.id} className="text-center">
                  <b>{Math.round(h.porcentaje * 100)}%</b> {h.nombre}
                </p>
              ))}
            </FilaCondicion>
          )}
          {conf?.textoValidezOferta && (
            <FilaCondicion titulo="VALIDEZ OFERTA">
              <p className="text-center font-bold text-[#c00000]">{conf.textoValidezOferta}</p>
            </FilaCondicion>
          )}
        </tbody>
      </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FilaDato({ l, v, r, rv }: { l: string; v?: string | null; r: string; rv?: string | null }) {
  return (
    <tr>
      <td className="font-bold">{l}</td>
      <td className="text-center">{v || ""}</td>
      <td />
      <td className="text-right font-bold">{r}</td>
      <td className="text-center font-bold">{rv || ""}</td>
    </tr>
  );
}

function CajaTotal({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="mt-1 flex justify-end">
      <div className="flex w-[44%] border-2 border-black font-bold">
        <span className="flex-1 px-2 py-0.5 text-center">{label}</span>
        <span className="border-l-2 border-black px-2 py-0.5 text-right">{formatCOP(valor)}</span>
      </div>
    </div>
  );
}

function FilaResumen({
  label,
  pct,
  valor,
  negrita,
}: {
  label: string;
  pct: string;
  valor: number;
  negrita?: boolean;
}) {
  return (
    <div className="flex justify-end py-[1px]">
      <span className="w-[16%] text-right">{label}</span>
      <span className="w-[8%] text-right">{pct}</span>
      <span className={`w-[20%] text-right ${negrita ? "font-bold" : ""}`}>{formatCOP(valor)}</span>
    </div>
  );
}

function FilaCondicion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <tr className="break-inside-avoid">
      <td className="text-center align-middle font-bold">{titulo}</td>
      <td>{children}</td>
    </tr>
  );
}

function Tramos({ tramos }: { tramos: Tramo[] }) {
  return (
    <>
      {tramos.map(([t, rojo], i) =>
        rojo ? (
          <span key={i} className="text-[#c00000]">
            {t}
          </span>
        ) : (
          <span key={i}>{t}</span>
        ),
      )}
    </>
  );
}

// Resalta en rojo la frase de "entregables adicionales" como en el documento original.
// Bloques del documento: lo que va entre **dobles asteriscos** sale en rojo.
function TextoMarcado({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*([\s\S]+?)\*\*/);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-[#c00000]">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function TextoConResaltado({ texto }: { texto: string }) {
  const marca = "ENTREGABLES ADICIONALES COMO VALOR AGREGADO:";
  const i = texto.indexOf(marca);
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <span className="text-[#c00000]">{marca}</span>
      {texto.slice(i + marca.length)}
    </>
  );
}
