-- 0004_bucket_legal.sql
-- Qué hace: en el desglose por bucket, la cartera legal (tipo_cartera = 'Legal', es decir JUR) se muestra como
-- «Legal» y no como bucket de mora. Solo cambia la agrupación; el stock, el índice 90+ y los días de mora no cambian.
-- Orden: después de 0003. Reemplaza las dos funciones de desglose y serie. Quién la ejecuta: el administrador.

create or replace function public.cartera_por_dimension(
  p_fecha date,
  p_dimension text,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  grupo text,
  cuentas bigint,
  saldo numeric,
  cuentas_mora bigint,
  saldo_mora_90 numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      case p_dimension
        when 'bucket' then case when tipo_cartera = 'Legal' then 'Legal'
                                else coalesce(bucket_actual::text, 'Sin mora') end
        when 'supervisor' then coalesce(nullif(supervisor, ''), '(sin dato)')
        when 'tipo_credito' then coalesce(nullif(tipo_credito, ''), '(sin dato)')
        when 'tipo_cartera' then coalesce(nullif(tipo_cartera, ''), '(sin dato)')
      end as grupo,
      saldo,
      dias_mora
    from public.cobranza_diaria
    where f_reporte = p_fecha
      and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  )
  select grupo,
         count(*),
         coalesce(sum(saldo), 0),
         count(*) filter (where coalesce(dias_mora, 0) > 0),
         coalesce(sum(saldo) filter (where coalesce(dias_mora, 0) > 90), 0)
  from base
  group by grupo
  order by sum(saldo) desc;
$$;

create or replace function public.cartera_serie(
  p_dimension text,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (f_reporte date, grupo text, saldo numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select f_reporte,
         case p_dimension
           when 'bucket' then case when tipo_cartera = 'Legal' then 'Legal'
                                  else coalesce(bucket_actual::text, 'Sin mora') end
           when 'supervisor' then coalesce(nullif(supervisor, ''), '(sin dato)')
           when 'tipo_credito' then coalesce(nullif(tipo_credito, ''), '(sin dato)')
           when 'tipo_cartera' then coalesce(nullif(tipo_cartera, ''), '(sin dato)')
         end,
         sum(saldo)
  from public.cobranza_diaria
  where saldo > 0
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
  group by 1, 2
  order by 1, 2;
$$;
