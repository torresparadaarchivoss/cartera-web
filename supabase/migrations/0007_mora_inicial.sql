-- 0007_mora_inicial.sql
-- Qué hace: guarda el bucket de mora de inicio de mes (loantape, cierre anterior; JUR sin referencia) en
-- cobranza_diaria, y agrega la función del KPI «Bucket 0 que desmejoran sin gestión» de Resumen.
-- Regla (services/indicadores.py): cuentas activas que empezaron el mes en bucket 0 y hoy están en mora (bucket >= 1);
-- «sin gestión» = sin gestiones en el mes.
-- Orden: después de 0006. Quién la ejecuta: el administrador.

alter table public.cobranza_diaria
  add column if not exists bucket_inicial smallint;

alter table public.cobranza_diaria
  drop constraint if exists cobranza_diaria_bucket_inicial_check;
alter table public.cobranza_diaria
  add constraint cobranza_diaria_bucket_inicial_check check (bucket_inicial is null or bucket_inicial between 0 and 6);

create or replace function public.cartera_bucket0_desmejora(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'desmejoran', count(*),
    'sin_gestion', count(*) filter (where gestiones_acum = 0)
  )
  from public.cobranza_diaria
  where f_reporte = p_fecha
    and saldo > 0
    and bucket_inicial = 0
    and bucket_actual >= 1
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal);
$$;

grant execute on function public.cartera_bucket0_desmejora(date, text[], text[], text[]) to authenticated;
