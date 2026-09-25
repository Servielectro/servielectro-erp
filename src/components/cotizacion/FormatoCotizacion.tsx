import { formatCOP, type Categoria } from "@/lib/pricing";

const CATEGORIA_LABEL: Record<Categoria, string> = {
  EQUIPO: "Equipos",
  MATERIAL: "Materiales",
  MANO_DE_OBRA: "Mano de obra",
};

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
  };
  items: FormatoCotizacionItem[];
  totales: FormatoCotizacionTotales | null;
  hitos: FormatoCotizacionHito[];
  configuracionEmpresa: FormatoCotizacionConfiguracionEmpresa | null;
  polizas: FormatoCotizacionPoliza[];
}

const CATEGORIAS_ORDEN: Categoria[] = ["EQUIPO", "MATERIAL", "MANO_DE_OBRA"];

/**
 * El documento que ve el cliente — formato "FormatoCotizacion". Es un componente puro
 * (sin fetch propio) para poder usarlo tanto en /cotizaciones/[id]/imprimir (con datos
 * reales de la base) como en la Vista Previa en vivo dentro de la pantalla de cotización
 * (con el estado en memoria, antes de guardar).
 */
export function FormatoCotizacion({
  codigo,
  fecha,
  comercial,
  proyecto,
  cliente,
  items,
  totales,
  hitos,
  configuracionEmpresa,
  polizas,
}: FormatoCotizacionProps) {
  const formaPagoTexto = hitos
    .map((h) => `${h.nombre} ${(h.porcentaje * 100).toFixed(0)}%`)
    .join(", ");

  const datosBancariosTexto =
    configuracionEmpresa?.bancoNombre || configuracionEmpresa?.bancoNumeroCuenta
      ? [
          configuracionEmpresa.bancoNombre,
          configuracionEmpresa.bancoTipoCuenta,
          configuracionEmpresa.bancoNumeroCuenta
            ? `No. ${configuracionEmpresa.bancoNumeroCuenta}`
            : null,
          configuracionEmpresa.bancoTitular
            ? `a nombre de ${configuracionEmpresa.bancoTitular}`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 shadow-sm print:shadow-none">
      <header className="mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Servielectro SAS
            </h1>
            <p className="text-sm text-slate-500">Cotización {codigo}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Fecha: {new Date(fecha).toLocaleDateString("es-CO")}</p>
            {comercial && <p>Comercial: {comercial}</p>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <p>
            <span className="font-medium text-slate-700">Proyecto: </span>
            {proyecto || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Cliente: </span>
            {cliente.nombre || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-700">NIT: </span>
            {cliente.nit || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Dirección: </span>
            {cliente.direccion || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Correo: </span>
            {cliente.email || "—"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Contacto: </span>
            {cliente.contacto || "—"}
          </p>
        </div>
      </header>

      {CATEGORIAS_ORDEN.map((cat) => {
        const itemsCategoria = items.filter((i) => i.categoria === cat);
        if (itemsCategoria.length === 0) return null;
        const subtotal = itemsCategoria.reduce(
          (acc, i) => acc + i.valorCalculoUnitario * i.cantidad,
          0,
        );
        return (
          <section key={cat} className="mb-5">
            <h2 className="mb-1 text-sm font-bold uppercase text-slate-700">
              {CATEGORIA_LABEL[cat]}
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs text-slate-500">
                  <th className="py-1">Descripción</th>
                  <th className="py-1 text-right">Cant.</th>
                  <th className="py-1 text-right">Unidad</th>
                  <th className="py-1 text-right">Valor unitario</th>
                  <th className="py-1 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {itemsCategoria.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">
                      {it.descripcionLarga || it.descripcion}
                    </td>
                    <td className="py-1.5 text-right">{it.cantidad}</td>
                    <td className="py-1.5 text-right">{it.unidad}</td>
                    <td className="py-1.5 text-right">
                      {formatCOP(it.valorCalculoUnitario)}
                    </td>
                    <td className="py-1.5 text-right font-medium">
                      {formatCOP(it.valorCalculoUnitario * it.cantidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-right text-sm font-semibold text-slate-800">
              Subtotal {CATEGORIA_LABEL[cat]}: {formatCOP(subtotal)}
            </p>
          </section>
        );
      })}

      {items.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">
          Todavía no hay líneas cargadas.
        </p>
      )}

      {totales && (
        <section className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
          <FilaTotal label="Subtotal" valor={totales.subtotalCalculo} />
          <FilaTotal label="Administración" valor={totales.valorAdmin} />
          <FilaTotal label="Imprevistos" valor={totales.valorImprevistos} />
          <FilaTotal label="Utilidad" valor={totales.valorUtilidadAiu} />
          <div className="flex justify-between border-t border-slate-300 pt-1 font-medium text-slate-800">
            <span>Subtotal general</span>
            <span>{formatCOP(totales.subtotalGeneral)}</span>
          </div>
          <FilaTotal label="IVA" valor={totales.valorIva} />
          <div className="flex justify-between border-t-2 border-slate-900 pt-1 text-base font-bold text-slate-900">
            <span>TOTAL</span>
            <span>{formatCOP(totales.total)}</span>
          </div>
        </section>
      )}

      {hitos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-bold uppercase text-slate-700">
            Esquema de pagos
          </h2>
          <table className="w-full max-w-sm border-collapse text-sm">
            <tbody>
              {hitos.map((h) => (
                <tr key={h.id} className="border-b border-slate-100">
                  <td className="py-1">
                    {h.nombre} ({(h.porcentaje * 100).toFixed(0)}%)
                  </td>
                  <td className="py-1 text-right font-medium">
                    {formatCOP(h.valorProgramado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6 border-t border-slate-300 pt-4">
        <h2 className="mb-2 text-sm font-bold uppercase text-slate-700">
          Condiciones comerciales
        </h2>
        <div className="space-y-3 text-xs text-slate-600">
          {configuracionEmpresa?.textoDespachoAprobacion && (
            <div>
              <p className="font-semibold text-slate-700">
                Plazos de entrega y aprobación
              </p>
              <p className="whitespace-pre-line">
                {configuracionEmpresa.textoDespachoAprobacion}
              </p>
            </div>
          )}

          {formaPagoTexto && (
            <div>
              <p className="font-semibold text-slate-700">Forma de pago</p>
              <p>{formaPagoTexto}</p>
            </div>
          )}

          {polizas.length > 0 && (
            <div>
              <p className="font-semibold text-slate-700">
                Pólizas disponibles
              </p>
              <p className="text-slate-500">
                Se ofrece la posibilidad de tomar las siguientes pólizas
                (costo asumido por Servielectro):
              </p>
              <ul className="list-disc pl-4">
                {polizas.map((p) => (
                  <li key={p.id}>{p.nombre}</li>
                ))}
              </ul>
            </div>
          )}

          {configuracionEmpresa?.textoGarantia && (
            <div>
              <p className="font-semibold text-slate-700">Garantía</p>
              <p className="whitespace-pre-line">
                {configuracionEmpresa.textoGarantia}
              </p>
            </div>
          )}

          {datosBancariosTexto && (
            <div>
              <p className="font-semibold text-slate-700">Datos bancarios</p>
              <p>{datosBancariosTexto}</p>
            </div>
          )}

          {configuracionEmpresa?.textoValidezOferta && (
            <p className="text-slate-400">
              {configuracionEmpresa.textoValidezOferta}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function FilaTotal({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{formatCOP(valor)}</span>
    </div>
  );
}
