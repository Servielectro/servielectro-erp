import type { Metadata } from "next";
import Link from "next/link";
import { EMPRESA } from "../empresa";

export const metadata: Metadata = {
  title: "Servielectro ERP",
  description: "Sistema interno de gestión de Servielectro S.A.S.: cotizaciones, proyectos, SG-SST, portal de clientes y respaldo de documentos.",
};

const FUNCIONES: [string, string][] = [
  ["Cotizaciones", "Elaboración, aprobación y envío de cotizaciones de proyectos de seguridad electrónica a los clientes de la empresa."],
  ["Proyectos", "Planeación y seguimiento de obras: tareas, visitas técnicas, actas, reuniones y documentos de cada proyecto."],
  ["SG-SST", "Gestión del Sistema de Seguridad y Salud en el Trabajo: personal, capacitaciones, inspecciones, eventos y formatos."],
  ["Portal de clientes", "Espacio donde los clientes consultan y firman los documentos de sus proyectos (contratos, actas, entregables)."],
  ["Respaldo de documentos", "Copia de seguridad automática de los archivos del ERP en el Google Drive de la empresa, con autorización de su titular."],
];

export default function InicioPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Servielectro ERP</h1>
        <p className="text-slate-700">
          Servielectro ERP es el sistema interno de gestión de <strong>{EMPRESA.razonSocial}</strong> ({EMPRESA.marca}), empresa
          colombiana de ingeniería en seguridad electrónica con sede en Bogotá. Lo usan los empleados de la empresa para su trabajo
          diario y los clientes de la empresa para consultar y firmar los documentos de sus proyectos. No es un producto a la venta ni
          admite registro abierto: las cuentas las crea la empresa.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Qué hace</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FUNCIONES.map(([t, d]) => (
            <li key={t} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-900">{t}</p>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Uso de Google Drive</h2>
        <p className="text-sm text-slate-700">
          El ERP se conecta a Google Drive únicamente para guardar copias de respaldo de los documentos que el propio ERP genera o
          almacena, en el Drive de la cuenta de la empresa que lo autorizó. Usa el permiso <code>drive.file</code>, que solo da acceso
          a los archivos que la aplicación crea. El detalle está en la{" "}
          <Link href="/privacidad#google" className="text-brand-red underline">política de privacidad</Link>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Contacto</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-slate-500">Razón social</dt><dd>{EMPRESA.razonSocial}</dd>
          <dt className="text-slate-500">NIT</dt><dd>{EMPRESA.nit}</dd>
          <dt className="text-slate-500">Dirección</dt><dd>{EMPRESA.direccion}, {EMPRESA.ciudad}</dd>
          <dt className="text-slate-500">Correo</dt><dd><a href={`mailto:${EMPRESA.correo}`} className="underline">{EMPRESA.correo}</a></dd>
          <dt className="text-slate-500">Teléfono</dt><dd>{EMPRESA.telefono}</dd>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark">Ingresar al ERP</Link>
        <Link href="/privacidad" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Política de privacidad</Link>
      </div>
    </div>
  );
}
