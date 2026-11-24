-- 0006_flujo_por_dimension.sql
-- Qué hace: flujo del mes por grupo (cobertura, RPC y monto prometido) para la tabla de Cartera.
-- Misma base que cartera_gestion_mes (activas en la fecha + canceladas en el mes), sin excluir bucket 0,
-- igual que services/indicadores.py por_dimension. Monto pagado: pendiente (requiere pagos de CHIRICO).
-- Orden: después de 0005. Quién la ejecuta: el administrador.

create or replace function public.cartera_flujo_por_dimension(
  p_fecha date,
  p_dimension text,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  grupo text,
  cuentas bigint,
  gestionadas bigint,
  rpc bigint,
  monto_prometido numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select * from public.cobranza_diaria where f_reporte <= p_fecha
  ),
  con_saldo as (select distinct credito from base where saldo > 0),
  activas_hoy as (select credito from base where f_reporte = p_fecha and saldo > 0),
  canceladas as (
    select distinct on (credito) *
    from base
    where credito in (select credito from con_saldo)
      and credito not in (select credito from activas_hoy)
    order by credito, f_reporte desc
  ),
  mes as (
    select * from base
    where f_reporte = p_fecha and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
    union all
    select * from canceladas
    where public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  con_grupo as (
    select
      case p_dimension
        when 'bucket' then case when tipo_cartera = 'Legal' then 'Legal'
                                else coalesce(bucket_actual::text, 'Sin mora') end
        when 'supervisor' then coalesce(nullif(supervisor, ''), '(sin dato)')
        when 'tipo_credito' then coalesce(nullif(tipo_credito, ''), '(sin dato)')
        when 'tipo_cartera' then coalesce(nullif(tipo_cartera, ''), '(sin dato)')
      end as grupo,
      gestiones_acum, rpc_acum, monto_promesa_acum
    from mes
  )
  select grupo,
         count(*),
         count(*) filter (where gestiones_acum > 0),
         count(*) filter (where rpc_acum > 0),
         coalesce(sum(monto_promesa_acum), 0)
  from con_grupo
  group by grupo
  order by sum(monto_promesa_acum) desc;
$$;

grant execute on function public.cartera_flujo_por_dimension(date, text, text[], text[], text[]) to authenticated;
