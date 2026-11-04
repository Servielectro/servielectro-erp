/* eslint-disable @next/next/no-img-element */
import type { FormatoCompleto, FirmaRegistrada } from "@/lib/sst/formato-servidor";
import type { Campo } from "@/lib/sst/plantillas";
import {
  cedulaConPuntos,
  dispositivoCorto,
  fechaDMA,
  fechaEnLetras,
  fechaLarga,
  nombresDe,
  parsearAlcance,
  pesos,
  texto,
} from "@/lib/sst/documento";

/**
 * Un formato como DOCUMENTO (vista previa e impresión a PDF), no como formulario. A4 con @page y salto
 * entre hojas. Para PRY-ACTA-INICIO hay una redacción propia (prosa legal, ocho numerales, maqueta de
 * Jhojan del 2026-11-04); el resto de plantillas sale con el genérico (secciones numeradas, tablas).
 *
 * Es el MISMO documento para la empresa y para el cliente: solo usa lo que está en el acta (respuestas
 * y firmas), que es lo que queda sellado. Nada del contrato ni de otras tablas, para que lo impreso
 * por cualquiera de las dos partes sea igual y no cambie después de firmado.
 */
export function DocumentoFormato({ f }: { f: FormatoCompleto }) {
  return (
    <div className="doc-formato">
      <style>{CSS}</style>
      {f.plantilla.codigo === "PRY-ACTA-INICIO" ? <ActaInicio f={f} /> : <Generico f={f} />}
    </div>
  );
}

// ------------------------------------------------------------------ piezas comunes

const SERVIELECTRO = "SERVICIOS ELECTRÓNICOS INDUSTRIALES S.A.S.";

function Encabezado({ f, titulo }: { f: FormatoCompleto; titulo: string }) {
  const c = f.control ?? {};
  const version = c.version ?? String(f.plantilla.version).padStart(2, "0");
  return (
    <table className="control">
      <tbody>
        <tr>
          <td className="marca">
            <img src="/logo-servielectro.png" alt="Servielectro" />
          </td>
          <td className="titulo">{titulo}</td>
          <td className="meta">
            <div>
              <b>Código:</b> {c.codigo ?? f.plantilla.codigo}
            </div>
            <div>
              <b>Versión:</b> {version}
            </div>
            <div>
              <b>Fecha:</b> {fechaDMA(c.fecha ?? f.fecha)}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Lo que falta se ve como línea para llenar a mano, no como vacío. */
const Linea = ({ ancho = 20 }: { ancho?: number }) => <span className="pend">{"_".repeat(ancho)}</span>;
const Val = ({ v, ancho }: { v: unknown; ancho?: number }) => {
  const t = texto(v);
  return t ? <>{t}</> : <Linea ancho={ancho} />;
};

interface Firmante {
  rol: string;
  etiqueta: string;
  nombre: string | null;
  documento: string | null;
  /** "de Bogotá": lugar de expedición de la cédula, si el acta lo trae. */
  expedida?: string | null;
  detalle: (string | null)[];
}

function BloqueFirma({ p, firma }: { p: Firmante; firma: FirmaRegistrada | undefined }) {
  // Firmada: manda lo que quedó con la firma (nombre, cédula, cargo y empresa que escribió quien firmó).
  const nombre = firma?.nombre ?? p.nombre;
  const doc = cedulaConPuntos(firma?.documento ?? p.documento);
  const detalle = firma ? [firma.cargo, firma.empresa] : p.detalle;
  return (
    <div className="firma">
      <div className="rol">{p.etiqueta}</div>
      <div className="espacio">{firma ? firma.url ? <img src={firma.url} alt={`Firma de ${firma.nombre}`} /> : <span>(firma registrada)</span> : <span>— pendiente de firma —</span>}</div>
      <div className="n">{nombre ? nombre.toUpperCase() : <Linea ancho={28} />}</div>
      <div className="c">
        C.C. {doc ?? <Linea />}
        {doc && p.expedida ? ` de ${p.expedida}` : ""}
      </div>
      {detalle.filter(Boolean).map((d, i) => (
        <div key={i} className="c">
          {d}
        </div>
      ))}
      {firma && (
        <div className="registro">
          Firmó el {fechaHoraCorta(firma.firmada_en_dispositivo)}
          {firma.dispositivo ? ` · ${dispositivoCorto(firma.dispositivo)}` : ""}
        </div>
      )}
    </div>
  );
}

function fechaHoraCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function Pie({ f }: { f: FormatoCompleto }) {
  return (
    <div className="pie">
      Documento generado por el sistema de gestión de Servicios Electrónicos Industriales S.A.S. Firma manuscrita digitalizada con registro
      íntegro de autor, fecha, hora, dispositivo y huella del contenido, conforme a la Ley 527 de 1999. Una vez firmado, este documento queda
      sellado: cualquier modificación posterior invalida la huella y el sistema lo advierte. No es firma digital con certificado.
      {f.hash_contenido && (
        <>
          <br />
          Sellada el {f.sellado_en ? fechaHoraCorta(f.sellado_en) : "—"} · Huella del contenido: <span className="huella">{f.hash_contenido}</span>
          {f.integro === false && <b className="no"> · ATENCIÓN: el contenido NO coincide con lo firmado.</b>}
        </>
      )}
      {!f.hash_contenido && f.estado === "borrador" && (
        <>
          <br />
          <b>Borrador sin firmar:</b> este documento todavía puede cambiar.
        </>
      )}
    </div>
  );
}

function Estado({ f }: { f: FormatoCompleto }) {
  if (f.estado === "anulado") return <div className="sello anulado">ANULADA · {f.motivo_anulacion}</div>;
  if (f.estado === "borrador") return <div className="sello borrador">BORRADOR</div>;
  return null;
}

// ------------------------------------------------------------------ acta de inicio

function ActaInicio({ f }: { f: FormatoCompleto }) {
  const r = f.respuestas;
  const t = (k: string) => texto(r[k]);
  const firma = (rol: string) => f.firmas.find((x) => x.rol === rol);
  const etiqueta = (rol: string, def: string) => f.plantilla.firmas.find((x) => x.rol === rol)?.etiqueta ?? def;

  const referencia = t("referencia");
  // "Contrato CSE-26-151 · Cotización …" → "Contrato CSE-26-151" para la prosa.
  const contrato = referencia?.match(/contrato\s+(?:n\.?[ºo°]?\s*)?([A-Z0-9][\w-]*)/i)?.[1] ?? null;
  const ciudad = t("ciudad");
  const alcance = parsearAlcance(t("alcance"));
  const personal = nombresDe(t("req_personal_nombres"));
  const multa = pesos(r.multa_diaria);

  const siNo = (k: string) => (r[k] === true ? <td className="r si">SÍ</td> : r[k] === false ? <td className="r no">NO</td> : <td className="r pend">—</td>);

  const contratanteCedula = cedulaConPuntos(firma("sst_cliente")?.documento ?? t("contratante_cedula"));
  const contratistaCedula = cedulaConPuntos(firma("responsable_sst")?.documento ?? t("contratista_cedula"));

  return (
    <>
      <div className="hoja">
        <Estado f={f} />
        <Encabezado f={f} titulo="ACTA DE INICIO DE OBRA" />

        <p className="intro">
          En la ciudad de <b>{ciudad ?? <Linea />}</b>, a los <b>{fechaEnLetras(f.fecha)}</b>, se reunieron las partes que adelante se identifican, con
          el propósito de dejar constancia del inicio de la ejecución de las obras contratadas mediante el{" "}
          <b>{contrato ? `Contrato ${contrato}` : "contrato referido en el numeral 2"}</b>, y de la verificación del cumplimiento de los requisitos previos
          pactados para tal efecto.
        </p>

        <h2>1. Partes que comparecen</h2>
        <table className="datos">
          <tbody>
            <tr>
              <td className="et">Contratante</td>
              <td>
                <Val v={r.contratante_razon_social} ancho={36} />
              </td>
            </tr>
            <tr>
              <td className="et">NIT</td>
              <td>
                <Val v={r.contratante_nit} />
              </td>
            </tr>
            <tr>
              <td className="et">Representado por</td>
              <td>
                <b>{t("contratante_nombre")?.toUpperCase() ?? <Linea ancho={28} />}</b>, identificado con cédula de ciudadanía N.º{" "}
                {contratanteCedula ? <b>{contratanteCedula}</b> : <Linea />}, obrando en calidad de <b>{t("contratante_calidad") ?? <Linea />}</b>.
              </td>
            </tr>
            <tr>
              <td className="et">Contratista</td>
              <td>
                <b>{t("contratista_nombre")?.toUpperCase() ?? <Linea ancho={28} />}</b>, identificado con cédula de ciudadanía N.º{" "}
                {contratistaCedula ? <b>{contratistaCedula}</b> : <Linea />}
                {t("contratista_expedida_en") ? ` expedida en ${t("contratista_expedida_en")}` : ""}, obrando en nombre de <b>{SERVIELECTRO}</b>
              </td>
            </tr>
          </tbody>
        </table>

        <h2>2. Objeto, lugar y referencia contractual</h2>
        <table className="datos">
          <tbody>
            <tr>
              <td className="et">Proyecto</td>
              <td>{f.proyecto ? f.proyecto.replace(" · ", " — ") : <Linea ancho={36} />}</td>
            </tr>
            <tr>
              <td className="et">Lugar de ejecución</td>
              <td>
                <Val v={r.lugar_nombre} ancho={36} />
              </td>
            </tr>
            <tr>
              <td className="et">Dirección</td>
              <td>
                <Val v={r.lugar_direccion} ancho={36} />
                {t("lugar_direccion") && ciudad && !t("lugar_direccion")!.toLowerCase().includes(ciudad.toLowerCase()) ? `, ${ciudad}` : ""}
              </td>
            </tr>
            <tr>
              <td className="et">Referencia</td>
              <td>
                <Val v={referencia} ancho={36} />
              </td>
            </tr>
          </tbody>
        </table>

        <h2>3. Alcance de los trabajos</h2>
        {alcance.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {alcance.bloques.length > 0 && (
          <div className="alcance">
            {alcance.bloques.map((b, i) => (
              <div key={i}>
                {b.encabezado && <div className={b.items.length ? "enc" : "parrafo"}>{b.encabezado}</div>}
                {b.items.length > 0 && (
                  <ul>
                    {b.items.map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {!alcance.intro.length && !alcance.bloques.length && (
          <p>
            <Linea ancho={60} />
          </p>
        )}
        <div className="pagina">Página 1 de 2</div>
      </div>

      <div className="hoja">
        <h2>4. Verificación de requisitos previos</h2>
        <table className="req">
          <tbody>
            <tr>
              <td className="q">Pólizas entregadas y aprobadas por el contratante</td>
              {siNo("req_polizas")}
              <td className="d">{fechaDMA(t("req_polizas_fecha")) ? `Aprobadas el ${fechaDMA(t("req_polizas_fecha"))}` : ""}</td>
            </tr>
            <tr>
              <td className="q">Anticipo girado</td>
              {siNo("req_anticipo")}
              <td className="d">{[fechaDMA(t("req_anticipo_fecha")), pesos(r.req_anticipo_valor)].filter(Boolean).join(" · ")}</td>
            </tr>
            <tr>
              <td className="q">Relación del personal con sus planillas de seguridad social, entregada</td>
              {siNo("req_personal_planillas")}
              <td className="d">{personal.length ? `${personal.length} persona${personal.length === 1 ? "" : "s"}` : ""}</td>
            </tr>
          </tbody>
        </table>
        {personal.length > 0 && (
          <table className="datos" style={{ marginTop: 6 }}>
            <tbody>
              <tr>
                <td className="et">Personal relacionado</td>
                <td>{personal.join(" · ")}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="nota">
          El personal queda acreditado mediante la relación entregada a la administración con sus respectivas planillas de seguridad social, conforme
          al contrato. El cronograma detallado de ejecución se entrega como anexo independiente de esta acta.
        </p>

        <h2>5. Supervisión del contrato</h2>
        <table className="datos">
          <tbody>
            <tr>
              <td className="et">Supervisor designado por el contratante</td>
              <td>
                <Val v={r.supervisor_nombre} ancho={36} />
              </td>
            </tr>
            <tr>
              <td className="et">Cargo o calidad</td>
              <td>
                <Val v={r.supervisor_cargo} ancho={36} />
              </td>
            </tr>
            <tr>
              <td className="et">Teléfono o correo de contacto</td>
              <td>
                <Val v={r.supervisor_contacto} ancho={36} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="nota">
          Este apartado lo diligencia el contratante. No constituye requisito para la suscripción de la presente acta; se registra para efectos de
          dirigir las comunicaciones propias de la obra.
        </p>

        <h2>6. Plazo de ejecución</h2>
        <table className="datos">
          <tbody>
            <tr>
              <td className="et ancho">Inicio de labores</td>
              <td>
                <Val v={r.inicio_labores} />
              </td>
            </tr>
            <tr>
              <td className="et ancho">Fecha de inicio oficial</td>
              <td>{fechaLarga(t("fecha_inicio_oficial")) ? <b>{fechaLarga(t("fecha_inicio_oficial"))}</b> : <Linea />}</td>
            </tr>
            <tr>
              <td className="et ancho">Plazo contractual</td>
              <td>{t("plazo_dias_habiles") ? <b>{t("plazo_dias_habiles")} días hábiles</b> : <Linea />}</td>
            </tr>
            <tr>
              <td className="et ancho">Fecha estimada de terminación</td>
              <td>{fechaLarga(t("fecha_terminacion_estimada")) ? <b>{fechaLarga(t("fecha_terminacion_estimada"))}</b> : <Linea />}</td>
            </tr>
          </tbody>
        </table>
        <div className="aviso">
          A partir de la fecha de inicio oficial corre el plazo contractual y, en caso de mora imputable al contratista, la multa pactada en el
          contrato
          {multa ? (
            <>
              {" "}
              (<b>{multa}</b> diarios
              {texto(r.multa_tope_pct) ? `, con tope del ${texto(r.multa_tope_pct)}%` : ""})
            </>
          ) : null}
          .
        </div>

        <h2>7. Constancia</h2>
        <p>
          Verificado el cumplimiento de los requisitos previos relacionados en el numeral 4, las partes dejan constancia del{" "}
          <b>inicio de la ejecución {contrato ? `del Contrato ${contrato}` : "del contrato"}</b> a partir de la fecha de inicio oficial señalada en
          el numeral 6, y suscriben la presente acta en señal de conformidad.
        </p>

        <h2>8. Observaciones</h2>
        <table className="datos">
          <tbody>
            <tr>
              <td className="et">Del contratante</td>
              <td className={t("observaciones_cliente") ? "multi" : "pend"}>{t("observaciones_cliente") ?? "Sin observaciones"}</td>
            </tr>
            <tr>
              <td className="et">Del contratista</td>
              <td className={t("observaciones_tecnico") ? "multi" : "pend"}>{t("observaciones_tecnico") ?? "Sin observaciones"}</td>
            </tr>
          </tbody>
        </table>

        <div className="firmas">
          <BloqueFirma
            firma={firma("sst_cliente")}
            p={{
              rol: "sst_cliente",
              etiqueta: etiqueta("sst_cliente", "Por el contratante"),
              nombre: t("contratante_nombre"),
              documento: t("contratante_cedula"),
              detalle: [t("contratante_calidad"), t("contratante_razon_social")],
            }}
          />
          <BloqueFirma
            firma={firma("responsable_sst")}
            p={{
              rol: "responsable_sst",
              etiqueta: etiqueta("responsable_sst", "Por el contratista"),
              nombre: t("contratista_nombre"),
              documento: t("contratista_cedula"),
              expedida: t("contratista_expedida_en"),
              detalle: ["Servicios Electrónicos Industriales S.A.S."],
            }}
          />
        </div>

        <Pie f={f} />
        <div className="pagina">Página 2 de 2</div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ genérico (cualquier plantilla)

function valorGenerico(c: Campo, v: unknown): React.ReactNode {
  if (c.tipo === "si_no") return v === true ? <b className="si">SÍ</b> : v === false ? <b className="no">NO</b> : <Linea ancho={8} />;
  if (c.tipo === "fecha") return fechaLarga(texto(v)) ?? <Linea />;
  if (Array.isArray(v)) return v.length ? (v.every((x) => typeof x !== "object") ? v.join(" · ") : `${v.length} registro(s)`) : <Linea />;
  if (v && typeof v === "object") return "(ver el registro en el sistema)";
  const t = texto(v);
  return t ? <span className="multi">{t}</span> : <Linea />;
}

function Generico({ f }: { f: FormatoCompleto }) {
  // Secciones numeradas con sus campos en tabla. Fotos, ubicación y firmas-dato no van en el papel.
  const secciones: { titulo: string; campos: Campo[] }[] = [];
  for (const c of f.plantilla.campos) {
    if (c.tipo === "seccion") secciones.push({ titulo: c.etiqueta, campos: [] });
    else if (!["foto", "ubicacion", "firma"].includes(c.tipo as string)) {
      if (!secciones.length) secciones.push({ titulo: "Datos generales", campos: [] });
      secciones[secciones.length - 1].campos.push(c);
    }
  }
  return (
    <div className="hoja">
      <Estado f={f} />
      <Encabezado f={f} titulo={f.plantilla.nombre.toUpperCase()} />
      <table className="datos">
        <tbody>
          <tr>
            <td className="et">Fecha</td>
            <td>{fechaLarga(f.fecha)}</td>
          </tr>
          <tr>
            <td className="et">Proyecto</td>
            <td>{f.proyecto ? f.proyecto.replace(" · ", " — ") : "—"}</td>
          </tr>
          {f.lugar && (
            <tr>
              <td className="et">Lugar</td>
              <td>{f.lugar}</td>
            </tr>
          )}
        </tbody>
      </table>
      {secciones
        .filter((s) => s.campos.length)
        .map((s, i) => (
          <div key={i}>
            <h2>
              {i + 1}. {s.titulo}
            </h2>
            <table className="datos">
              <tbody>
                {s.campos.map((c) => (
                  <tr key={c.id}>
                    <td className="et">{c.etiqueta}</td>
                    <td>{valorGenerico(c, f.respuestas[c.id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      <div className="firmas">
        {f.plantilla.firmas.map((p, i) => (
          <BloqueFirma key={i} firma={f.firmas.find((x) => x.rol === p.rol)} p={{ rol: p.rol, etiqueta: p.etiqueta, nombre: null, documento: null, detalle: [] }} />
        ))}
      </div>
      <Pie f={f} />
    </div>
  );
}

// ------------------------------------------------------------------ estilos (los de la maqueta, acotados a .doc-formato)

const CSS = `
.doc-formato{--rojo:#a82323;--azul:#1d2d40;--negro:#1d1d1b;--g700:#334155;--g600:#475569;--g500:#64748b;--g300:#cbd5e1;--g100:#f1f5f9;
  font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--negro);font-size:10.5pt;line-height:1.5}
.doc-formato *{box-sizing:border-box}
.doc-formato .hoja{width:21cm;max-width:100%;min-height:29.7cm;margin:18px auto;background:#fff;padding:1.6cm 1.9cm 1.3cm;box-shadow:0 2px 14px rgba(0,0,0,.3);position:relative}
.doc-formato .control{width:100%;border-collapse:collapse;margin-bottom:18px}
.doc-formato .control td{border:1px solid var(--negro);padding:5px 8px;vertical-align:middle}
.doc-formato .control .marca{width:26%;text-align:center}
.doc-formato .control .marca img{max-height:44px;max-width:100%;display:inline-block}
.doc-formato .control .titulo{text-align:center;font-weight:700;font-size:12pt;letter-spacing:.3px}
.doc-formato .control .meta{width:24%;font-size:8pt;padding:0}
.doc-formato .control .meta div{border-bottom:1px solid var(--negro);padding:3.5px 8px}
.doc-formato .control .meta div:last-child{border-bottom:none}
.doc-formato h2{font-size:9.5pt;text-transform:uppercase;letter-spacing:.8px;color:#fff;background:var(--azul);margin:16px 0 8px;padding:4px 9px;border-radius:2px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-after:avoid}
.doc-formato p{margin:0 0 9px;text-align:justify}
.doc-formato .intro{margin-bottom:4px}
.doc-formato .nota{margin-top:8px;font-size:9.5pt;color:var(--g600)}
.doc-formato table.datos{width:100%;border-collapse:collapse;margin:0 0 6px}
.doc-formato table.datos td{border:1px solid var(--g300);padding:5px 8px;vertical-align:top}
.doc-formato table.datos td.et{background:var(--g100);font-weight:600;width:33%;color:var(--g700);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc-formato table.datos td.et.ancho{width:52%}
.doc-formato .multi{white-space:pre-wrap}
.doc-formato .alcance{border:1px solid var(--g300);padding:10px 12px;background:#fcfcfd}
.doc-formato .alcance .enc{font-weight:700;margin:9px 0 3px;color:var(--azul)}
.doc-formato .alcance .parrafo{margin:9px 0 3px;text-align:justify}
.doc-formato .alcance > div:first-child .enc,.doc-formato .alcance > div:first-child .parrafo{margin-top:0}
.doc-formato .alcance ul{margin:0 0 4px;padding-left:17px}
.doc-formato .alcance li{margin-bottom:2px;text-align:justify}
.doc-formato .req{width:100%;border-collapse:collapse}
.doc-formato .req td{border:1px solid var(--g300);padding:5px 8px}
.doc-formato .req td.q{width:62%}
.doc-formato .req td.r{width:14%;text-align:center;font-weight:700}
.doc-formato .req td.d{width:24%;font-size:9pt;color:var(--g600)}
.doc-formato .si{color:#15803d}
.doc-formato .no{color:var(--rojo)}
.doc-formato .pend{color:var(--g500);font-weight:400;font-style:italic}
.doc-formato .aviso{border-left:3px solid var(--rojo);background:#fef2f2;padding:8px 11px;margin:9px 0;font-size:9.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc-formato .firmas{display:flex;gap:26px;margin-top:26px;break-inside:avoid}
.doc-formato .firma{flex:1;border:1px solid var(--g300);padding:10px 12px;min-height:148px;display:flex;flex-direction:column;justify-content:flex-start}
.doc-formato .firma .rol{font-size:8.5pt;text-transform:uppercase;letter-spacing:.6px;color:var(--g600);font-weight:700;margin-bottom:6px}
.doc-formato .firma .espacio{flex:none;height:76px;border-bottom:1px solid var(--negro);margin-bottom:5px;display:flex;align-items:center;justify-content:center;color:var(--g300);font-size:8pt}
.doc-formato .firma .espacio img{max-height:70px;max-width:100%;object-fit:contain}
.doc-formato .firma .n{font-weight:700;font-size:10pt}
.doc-formato .firma .c{font-size:9pt;color:var(--g600)}
.doc-formato .firma .registro{font-size:7.5pt;color:var(--g500);margin-top:4px}
.doc-formato .pie{margin-top:20px;border-top:1px solid var(--g300);padding-top:8px;font-size:8pt;color:var(--g500);text-align:justify}
.doc-formato .huella{font-family:ui-monospace,monospace;word-break:break-all}
.doc-formato .pagina{position:absolute;bottom:.75cm;right:1.9cm;font-size:8pt;color:var(--g500)}
.doc-formato .sello{position:absolute;top:.55cm;right:1.9cm;font-size:8pt;font-weight:700;letter-spacing:1px;padding:2px 8px;border:1.5px solid}
.doc-formato .sello.borrador{color:#b45309;border-color:#b45309}
.doc-formato .sello.anulado{color:var(--rojo);border-color:var(--rojo)}
@media screen and (max-width:820px){.doc-formato .hoja{padding:1cm .9cm;min-height:0;margin:10px auto}.doc-formato .firmas{flex-direction:column;gap:14px}}
@media print{
  .doc-formato .hoja{margin:0;box-shadow:none;width:auto;min-height:0;padding:1.4cm 1.6cm;break-after:page}
  .doc-formato .hoja:last-child{break-after:auto}
  .doc-formato .pagina{bottom:.6cm}
}
@page{size:A4;margin:0}
`;
