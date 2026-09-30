-- Cotizador — valores agregados seleccionables (pedido de Jhojan 2026-09-30).
--
-- Mismo patrón que las pólizas (20260924000020): un catálogo de bloques de "valor
-- agregado" y, por cotización, los que se marcaron con su texto ya editado (snapshot:
-- si el catálogo cambia después, la cotización guardada no se altera).
--
-- `cotizaciones.valores_agregados_definidos` distingue las cotizaciones hechas con este
-- mecanismo de las anteriores: las viejas siguen imprimiendo el bloque fijo de siempre;
-- las nuevas imprimen exactamente los que se marcaron (ninguno = sin bloque).
--
-- Idempotente.

create table if not exists valores_agregados_catalogo (
  id uuid primary key default gen_random_uuid(),
  titulo text not null unique,
  texto text not null,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_valores_agregados_catalogo_updated_at on valores_agregados_catalogo;
create trigger trg_valores_agregados_catalogo_updated_at
  before update on valores_agregados_catalogo
  for each row execute function extensions.moddatetime(updated_at);

-- El bloque que hoy sale fijo en todas las cotizaciones (transcrito del PDF real
-- CSE-26-104). Jhojan agrega los demás desde el armador.
insert into valores_agregados_catalogo (titulo, texto, orden) values (
  'Gerenciamiento y carpeta de ingeniería',
  'Se realiza la entrega de la carpeta de ingeniería que incluye: Planimetría de cableado y tubería, posicionamiento en plano de dispositivos, cuadro de conexiones y configuración de colores punto por punto, fichas técnicas de equipos, certificado de capacitación a personal autorizado (Dossier relacionado con un proyecto de seguridad electrónica). ENTREGABLES ADICIONALES COMO VALOR AGREGADO: • AVANCE PARA GESTIÓN DOCUMENTAL DE MANTENIMIENTOS: • Bitácoras para registro de mantenimientos preventivos y correctivos del sistema • Hoja de vida de equipos para aseguramiento de los mismos en pólizas del conjunto • Viabilidad para procesos predictivos y proactivos del sistema con el fin de obtener el mayor rendimiento en ingeniería de mantenimientos basados en MRR y mejoramiento del sistema. • Programa de Gestión de Activos.',
  1
)
on conflict (titulo) do nothing;

create table if not exists cotizacion_valores_agregados (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones (id) on delete cascade,
  valor_agregado_id uuid references valores_agregados_catalogo (id) on delete set null,
  titulo text not null,
  texto text not null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_cotizacion_valores_agregados_cotizacion
  on cotizacion_valores_agregados (cotizacion_id, orden);

alter table cotizaciones
  add column if not exists valores_agregados_definidos boolean not null default false;

-- RLS: mismo criterio que pólizas y el resto de Comercial mientras la Fase 2b sigue
-- pendiente (cualquier usuario autenticado).
do $$
declare
  t text;
begin
  for t in select unnest(array['valores_agregados_catalogo', 'cotizacion_valores_agregados'])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
