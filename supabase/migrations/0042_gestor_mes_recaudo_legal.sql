-- 0042_gestor_mes_recaudo_legal.sql
-- Qué hace: el agente de Recaudo legal usa el criterio de gestor de cartera de 2026-11-27 (igual que Streamlit,
-- services/calculations.ultimo_gestor): por crédito, el PR_MC_UASIGNADO válido con más fotos desde el día 5 (si no tiene
-- fotos desde el día 5, cuentan todas); empate: la foto más reciente. Se ignoran vacíos y «sin asignar».
-- Solo cambia la columna gestor de recaudo_legal_base; el resto de la función queda igual.
-- Orden: después de 0041. Quién la ejecuta: el administrador. Después, correr la carga (scripts/cargar_cobranza.py)
-- para que pago.gestor quede con el mismo criterio.

create or replace function public.recaudo_legal_base(p_fecha date)
returns table (
  credito text,
  saldo numeric,
  gestor text,        -- '' = sin asignar
  recaudo numeric,
  con_pago boolean,
  embargo boolean     -- hubo un pago por el canal legal de CHIRICO
)
language sql
stable
security invoker
set search_path = public
as $$
  with f0 as (
    select min(f_reporte) as f from public.cobranza_diaria
  ),
  universo as (
    select c.credito, c.saldo
    from public.cobranza_diaria c, f0
    where c.f_reporte = f0.f
      and upper(trim(c.tipo_legal)) = 'JUR'
      and coalesce(c.saldo, 0) > 0
  ),
  validas as (
    select c.credito, lower(trim(c.gestor)) as gestor, c.f_reporte
    from public.cobranza_diaria c
    join universo u on u.credito = c.credito
    where c.f_reporte <= p_fecha
      and lower(trim(coalesce(c.gestor, ''))) not in ('', 'sin asignar')
  ),
  con_fin as (
    select v.*, bool_or(extract(day from v.f_reporte) >= 5) over (partition by v.credito) as tiene_desde_5
    from validas v
  ),
  ventana as (
    select credito, gestor, f_reporte
    from con_fin
    where (not tiene_desde_5) or extract(day from f_reporte) >= 5
  ),
  cuentas_gestor as (
    select credito, gestor, count(distinct f_reporte) as fotos, max(f_reporte) as ultima
    from ventana
    group by credito, gestor
  ),
  gest as (
    select distinct on (credito) credito, gestor
    from cuentas_gestor
    order by credito, fotos desc, ultima desc
  ),
  pg as (
    select p.credito,
           sum(p.pago) as recaudo,
           count(*) > 0 as con_pago,
           bool_or(lower(trim(p.canal)) = 'legal') as embargo
    from public.pago p
    join universo u on u.credito = p.credito
    where p.fecha <= p_fecha
    group by p.credito
  )
  select u.credito,
         u.saldo,
         coalesce(g.gestor, '') as gestor,
         coalesce(pg.recaudo, 0) as recaudo,
         coalesce(pg.con_pago, false) as con_pago,
         coalesce(pg.embargo, false) as embargo
  from universo u
  left join gest g on g.credito = u.credito
  left join pg on pg.credito = u.credito;
$$;
