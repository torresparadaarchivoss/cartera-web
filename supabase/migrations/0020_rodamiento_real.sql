-- 0020_rodamiento_real.sql
-- Qué hace: Rodamiento real (services/rodamiento_real.py). Cartera activa en la fecha de seguimiento (incluye las
-- cuentas nuevas del mes), con saldo congelado del primer día activo del crédito.
-- Origen: bucket inicial (cierre de loantape); 'Sin referencia' si estaba activo el primer día sin mora de referencia;
-- 'Nuevo en el mes' si no estaba activo el primer día. Destino: bucket en la fecha ('Sin mora' si no tiene mora).
-- Orden: después de 0019. Quién la ejecuta: el administrador.

create or replace function public.rodamiento_real_grilla(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  origen text,
  destino text,
  creditos bigint,
  saldo_congelado numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with f0 as (
    select min(f_reporte) as f from public.cobranza_diaria
  ),
  activos_f0 as (
    select c.credito from public.cobranza_diaria c cross join f0
    where c.f_reporte = f0.f and coalesce(c.saldo, 0) > 0
  ),
  congelado as (
    select distinct on (credito) credito, saldo
    from public.cobranza_diaria
    where coalesce(saldo, 0) > 0
    order by credito, f_reporte
  ),
  corte as (
    select c.credito, c.saldo, c.bucket_actual, c.bucket_inicial,
           (c.credito in (select credito from activos_f0)) as estaba_f0
    from public.cobranza_diaria c
    where c.f_reporte = p_fecha
      and coalesce(c.saldo, 0) > 0
      and public.coincide(c.supervisor, p_supervisor)
      and public.coincide(c.tipo_credito, p_tipo_credito)
      and public.coincide(c.tipo_legal, p_tipo_legal)
  )
  select
    case when not k.estaba_f0 then 'Nuevo en el mes'
         else coalesce(k.bucket_inicial::text, 'Sin referencia') end as origen,
    coalesce(k.bucket_actual::text, 'Sin mora') as destino,
    count(*) as creditos,
    sum(coalesce(g.saldo, k.saldo)) as saldo_congelado
  from corte k
  left join congelado g on g.credito = k.credito
  group by 1, 2;
$$;

grant execute on function public.rodamiento_real_grilla(date, text[], text[], text[]) to authenticated;
