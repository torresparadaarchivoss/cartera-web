-- 0011_indices_promesas.sql
-- Qué hace: índices para que las consultas de promesas no superen el tiempo máximo de Supabase
-- («canceling statement due to statement timeout»). Sin cambios de datos ni de reglas.
-- Orden: después de 0010. Quién la ejecuta: el administrador.

create index if not exists cobranza_diaria_credito_fecha_desc_idx
  on public.cobranza_diaria (credito, f_reporte desc);

create index if not exists promesa_fecha_idx
  on public.promesa (fecha_gestion);

analyze public.cobranza_diaria;
analyze public.promesa;
