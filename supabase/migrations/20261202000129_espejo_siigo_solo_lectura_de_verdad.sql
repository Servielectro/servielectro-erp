-- El espejo de Siigo, de solo lectura DE VERDAD (2026-11-01).
-- Escrita y aplicada por el orquestador. Idempotente.
--
-- La 128 revocó privilegios de `public` y `anon`, pero NO de `authenticated`, que es el rol con
-- el que entra cualquier usuario de la app. Supabase concede privilegios por defecto a ese rol
-- sobre las tablas nuevas de `public`, así que la app conservaba INSERT, UPDATE y DELETE sobre el
-- espejo contable.
--
-- Hoy la RLS igual lo frena, porque esas tablas solo tienen política de SELECT y sin política
-- permisiva no se puede escribir. Pero el privilegio no debería estar: el día que alguien agregue
-- una política amplia "para arreglar algo", el espejo se vuelve editable sin que nadie lo note, y
-- este módulo entero existe bajo la promesa de que NO se puede editar.
--
-- Es el mismo descuido de la lección de la migración 54 (revocar desde el primer día), esta vez
-- con `authenticated`. Lo encontró la verificación de la 128, no producción.
do $$
declare t text;
begin
  foreach t in array array['siigo_sincronizaciones','siigo_terceros','siigo_facturas',
                           'siigo_factura_items','siigo_balance','siigo_cuentas_por_pagar'] loop
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
  -- siigo_config es la excepción: la contadora y el responsable de Contable
  -- tienen que poder configurar las subcuentas de IVA.
  revoke all on table public.siigo_config from authenticated;
  grant select, update on table public.siigo_config to authenticated;
end $$;
