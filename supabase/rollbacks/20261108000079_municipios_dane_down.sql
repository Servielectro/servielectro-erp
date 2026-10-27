-- Rollback de la migración 79: quita la tabla de municipios. Los códigos DANE ya guardados en
-- clientes y sedes se quedan (son texto; no dependen de esta tabla).
drop table if exists public.municipios_dane;
