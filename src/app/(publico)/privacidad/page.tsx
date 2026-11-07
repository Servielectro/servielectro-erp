import type { Metadata } from "next";
import { EMPRESA } from "../empresa";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos — Servielectro ERP",
  description: "Política de tratamiento de datos personales (Ley 1581 de 2012) y uso de datos de Google de Servielectro ERP.",
};

const VIGENCIA = "7 de noviembre de 2026";

function S({ id, titulo, children }: { id?: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <article className="space-y-7">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Política de tratamiento de datos personales y privacidad</h1>
        <p className="text-sm text-slate-600">
          Servielectro ERP · Vigente desde el {VIGENCIA}. Expedida en cumplimiento de la Ley 1581 de 2012 y del Decreto 1377 de 2013
          (compilado en el Decreto 1074 de 2015).
        </p>
      </header>

      <S titulo="1. Responsable del tratamiento">
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-slate-500">Razón social</dt><dd>{EMPRESA.razonSocial} ({EMPRESA.marca})</dd>
          <dt className="text-slate-500">NIT</dt><dd>{EMPRESA.nit}</dd>
          <dt className="text-slate-500">Domicilio</dt><dd>{EMPRESA.direccion}, {EMPRESA.ciudad}</dd>
          <dt className="text-slate-500">Correo</dt><dd><a className="underline" href={`mailto:${EMPRESA.correo}`}>{EMPRESA.correo}</a></dd>
          <dt className="text-slate-500">Teléfono</dt><dd>{EMPRESA.telefono}</dd>
        </dl>
        <p>
          Esta política aplica a los datos personales que la empresa trata por medio de Servielectro ERP, su sistema interno de
          gestión, al que acceden sus empleados y, por medio del portal de clientes, sus clientes.
        </p>
      </S>

      <S titulo="2. Datos que tratamos">
        <p><strong>Empleados, aspirantes y contratistas:</strong> nombre, documento de identidad, datos de contacto, cargo, contrato,
          información de nómina y pagos, afiliaciones a seguridad social, hoja de vida y soportes, y la información que exige el Sistema
          de Gestión de Seguridad y Salud en el Trabajo (SG-SST): capacitaciones, inspecciones, entrega de dotación, y reportes de
          incidentes y accidentes de trabajo. Para el personal de campo, las fotografías, firmas y la ubicación que se registran al
          documentar una visita técnica.</p>
        <p><strong>Clientes:</strong> razón social o nombre, NIT o documento, datos tributarios del RUT, dirección y sedes, y los datos
          de sus contactos y representantes (nombre, cargo, correo, teléfono), además de las cotizaciones, contratos, actas, firmas y
          demás documentos de sus proyectos.</p>
        <p><strong>Contactos comerciales y prospectos:</strong> nombre, empresa, cargo, correo y teléfono, y el registro de las
          gestiones comerciales con ellos.</p>
        <p><strong>Usuarios del sistema:</strong> correo de acceso, permisos y registros de actividad necesarios para la seguridad
          del sistema. El ERP usa únicamente las cookies técnicas indispensables para mantener la sesión iniciada; no usa cookies de
          publicidad ni de analítica de terceros.</p>
      </S>

      <S titulo="3. Finalidades">
        <ul className="list-disc space-y-1 pl-5">
          <li>Elaborar cotizaciones, celebrar y ejecutar contratos y prestar los servicios contratados.</li>
          <li>Planear y documentar proyectos y visitas técnicas: actas, informes, registros fotográficos y firmas.</li>
          <li>Gestionar la relación laboral o contractual con empleados y contratistas, incluida la nómina.</li>
          <li>Cumplir las obligaciones del SG-SST (Decreto 1072 de 2015) y las demás obligaciones legales, contables y tributarias.</li>
          <li>Facturar, cobrar y llevar la contabilidad de la empresa.</li>
          <li>Permitir que los clientes consulten y firmen los documentos de sus proyectos en el portal de clientes.</li>
          <li>Atender solicitudes comerciales y mantener contacto con clientes y prospectos sobre los servicios de la empresa.</li>
          <li>Conservar copias de respaldo de los documentos del sistema para que no se pierdan (ver sección 5).</li>
        </ul>
      </S>

      <S titulo="4. Datos sensibles y de menores">
        <p>Algunos datos del SG-SST (por ejemplo, los relacionados con accidentes o con la salud en el trabajo), la imagen, la firma y
          la ubicación pueden ser datos sensibles. Se tratan solo para las finalidades de esta política, con la autorización previa,
          expresa e informada del titular o cuando la ley lo permita sin ella. El titular no está obligado a autorizar el tratamiento de
          datos sensibles. El ERP no está dirigido a menores de edad y no recolecta intencionalmente sus datos.</p>
      </S>

      <S id="google" titulo="5. Uso de datos de Google (Google Drive)">
        <p>Servielectro ERP se conecta a Google Drive <strong>con un único fin: subir copias de respaldo de los documentos del
          propio ERP</strong> (fotos de visitas, firmas, actas, contratos, RUT, pólizas, grabaciones de reuniones y demás archivos que el
          sistema almacena) <strong>al Google Drive de la cuenta de la empresa cuyo titular lo autorizó</strong> expresamente en la
          pantalla de consentimiento de Google.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Permiso usado:</strong> <code>https://www.googleapis.com/auth/drive.file</code>. Este permiso <strong>solo da acceso a
            los archivos que la propia aplicación crea</strong> en Drive. <strong>No permite ver, leer, modificar ni borrar el resto de
            los archivos del Drive</strong> del titular. El ERP no solicita ningún otro permiso de Google.</li>
          <li><strong>Qué hace con ese acceso:</strong> crea la carpeta de respaldo, sube las copias y consulta los datos técnicos de esas
            mismas copias (identificador, tamaño y suma de verificación) para comprobar que quedaron completas y siguen existiendo.</li>
          <li><strong>No se comparten con terceros:</strong> los datos obtenidos por medio de las API de Google no se venden, no se
            transfieren ni se comparten con terceros, no se usan para publicidad y no se usan para entrenar modelos de inteligencia
            artificial. Solo se usan para prestar la función de respaldo descrita.</li>
          <li><strong>Uso limitado:</strong> el uso y la transferencia que hace Servielectro ERP de la información recibida de las API de
            Google se ajustan a la{" "}
            <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Política de datos de usuario de los servicios de API de Google</a>, incluidos los requisitos de Uso limitado.</li>
          <li><strong>Credenciales:</strong> la autorización de Google se guarda cifrada en los servidores del ERP, solo la usa el
            proceso automático de respaldo y nunca se muestra a los usuarios.</li>
          <li><strong>Cómo revocar el acceso:</strong> el titular de la cuenta puede retirarlo en cualquier momento desde su cuenta de
            Google, en <strong>Seguridad → Accesos de terceros</strong> (o en{" "}
            <a className="underline" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">myaccount.google.com/connections</a>),
            eligiendo «Servielectro ERP» y quitando el acceso. Desde ese momento el ERP deja de subir copias. Las copias ya subidas
            quedan en el Drive del titular, que puede borrarlas cuando quiera. También puede pedir la desconexión escribiendo a{" "}
            <a className="underline" href={`mailto:${EMPRESA.correo}`}>{EMPRESA.correo}</a>.</li>
        </ul>
      </S>

      <S titulo="6. Encargados y transferencias">
        <p>Para funcionar, el ERP se apoya en proveedores que tratan datos por cuenta de la empresa y bajo sus instrucciones:
          alojamiento de la aplicación y de la base de datos (Vercel y Supabase), almacenamiento de respaldos (Google Drive, sección 5),
          lectura automática de documentos como el RUT y transcripción de grabaciones de reuniones (servicios de inteligencia artificial de
          Google y OpenAI, por medio de sus API) y el software contable de la empresa (Siigo). Algunos de estos proveedores tienen
          servidores fuera de Colombia, por lo que puede haber transmisión internacional de datos, que se hace conforme a la Ley 1581
          de 2012 y sus decretos. La empresa no vende datos personales.</p>
      </S>

      <S titulo="7. Tiempo de conservación">
        <p>Los datos se conservan mientras dure la relación con el titular (laboral, contractual o comercial) y, después, durante el
          tiempo necesario para cumplir las obligaciones legales: los documentos contables y comerciales por diez (10) años (artículo
          28 de la Ley 962 de 2005) y los registros del SG-SST por veinte (20) años desde el retiro del trabajador (artículo
          2.2.4.6.13 del Decreto 1072 de 2015). Los datos de prospectos que no llegan a ser clientes se eliminan cuando el titular lo
          pida. Las copias de respaldo en Google Drive se conservan con el mismo criterio.</p>
      </S>

      <S titulo="8. Derechos del titular">
        <p>Según el artículo 8 de la Ley 1581 de 2012, el titular de los datos tiene derecho a:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Conocer</strong> los datos personales suyos que la empresa trata y acceder a ellos gratuitamente.</li>
          <li><strong>Actualizar</strong> y <strong>rectificar</strong> sus datos cuando estén incompletos, sean inexactos o induzcan a error.</li>
          <li>Solicitar prueba de la autorización otorgada y ser informado del uso que se les ha dado a sus datos.</li>
          <li><strong>Revocar</strong> la autorización y/o solicitar la <strong>supresión</strong> de sus datos, salvo cuando exista un
            deber legal o contractual de conservarlos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley, después de agotar el
            trámite ante la empresa.</li>
        </ul>
      </S>

      <S titulo="9. Cómo ejercer los derechos">
        <p>Escriba a <a className="underline" href={`mailto:${EMPRESA.correo}`}>{EMPRESA.correo}</a> o envíe una comunicación
          escrita a {EMPRESA.direccion}, {EMPRESA.ciudad}, indicando su nombre, documento de identidad, la solicitud concreta y un
          medio de respuesta. Si actúa en nombre de otra persona, adjunte el soporte que lo acredite.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Consultas:</strong> se responden en máximo diez (10) días hábiles, prorrogables por cinco (5) días hábiles más
            informando el motivo (artículo 14 de la Ley 1581 de 2012).</li>
          <li><strong>Reclamos</strong> (corrección, actualización, supresión o revocatoria): se responden en máximo quince (15) días
            hábiles, prorrogables por ocho (8) días hábiles más informando el motivo (artículo 15 de la Ley 1581 de 2012).</li>
        </ul>
      </S>

      <S titulo="10. Seguridad">
        <p>El acceso al ERP exige usuario y contraseña; cada usuario ve solo las secciones que su cargo requiere y la base de datos
          aplica reglas de acceso por fila. Las comunicaciones viajan cifradas (HTTPS) y las sesiones se cierran por inactividad.</p>
      </S>

      <S titulo="11. Cambios a esta política">
        <p>Cualquier cambio sustancial se publicará en esta página con su nueva fecha de vigencia y, cuando la ley lo exija, se
          informará a los titulares antes de aplicarlo.</p>
      </S>
    </article>
  );
}
