-- 0014_cohorte.sql
-- Qué hace: evolución de mora de la cohorte del primer día del mes (Resumen gerencial).
-- Regla (services/cohort_engine.py): población = créditos activos el día 1 (saldo > 0), congelada; bucket inicial =
-- mora del cierre de loantape anterior (sin JUR → Sin referencia); movimiento según el bucket en la fecha de corte:
-- Mejora (baja), Mantiene (igual), Desmejora (sube), Sin registro (no está en la cartera en la fecha).
-- Atributos de filtro congelados el día 1. Orden: después de 0013. Quién la ejecuta: el administrador.

create or replace function public.cartera_cohorte(
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
  with f0 as (select min(f_reporte) as f from public.cobranza_diaria),
  coh as (
    select c.credito, c.saldo as saldo_base, c.bucket_inicial
    from public.cobranza_diaria c
    cross join f0
    where c.f_reporte = f0.f
      and c.saldo > 0
      and public.coincide(c.supervisor, p_supervisor)
      and public.coincide(c.tipo_credito, p_tipo_credito)
      and public.coincide(c.tipo_legal, p_tipo_legal)
  ),
  obs as (
    select credito, bucket_actual from public.cobranza_diaria where f_reporte = p_fecha
  ),
  seg as (
    select coh.credito, coh.saldo_base,
      case
        when coh.bucket_inicial is null then 'Sin referencia'
        when o.credito is null or o.bucket_actual is null then 'Sin registro'
        when o.bucket_actual < coh.bucket_inicial then 'Mejora'
        when o.bucket_actual = coh.bucket_inicial then 'Mantiene'
        else 'Desmejora'
      end as movimiento
    from coh
    left join obs o on o.credito = coh.credito
  ),
  ref as (select * from seg where movimiento <> 'Sin referencia'),
  tot as (select coalesce(sum(saldo_base), 0) as t from ref),
  mv as (
    select movimiento, count(*) as creditos, sum(saldo_base) as saldo from ref group by movimiento
  )
  select jsonb_build_object(
    'creditos_cohorte', (select count(*) from seg),
    'creditos_con_referencia', (select count(*) from ref),
    'creditos_sin_referencia', (select count(*) from seg where movimiento = 'Sin referencia'),
    'saldo_base_con_referencia', (select t from tot),
    'movimientos', coalesce((
      select jsonb_object_agg(mv.movimiento, jsonb_build_object(
        'creditos', mv.creditos,
        'saldo', mv.saldo,
        'pct_saldo', mv.saldo / nullif((select t from tot), 0)
      )) from mv
    ), '{}'::jsonb)
  );
$$;

grant execute on function public.cartera_cohorte(date, text[], text[], text[]) to authenticated;
