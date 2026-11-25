-- 0030_cuentas_gestiones.sql
-- Qué hace: igual que 0025, pero las gestiones, contactos, RPC y promesas del mes salen de la tabla gestion (como el
-- Streamlit: todas las gestiones hasta la fecha), no del acumulado de cobranza_diaria, que pierde gestiones de días sin
-- fila de cartera. Orden: después de 0029. Quién la ejecuta: el administrador.
-- Tomado de 0025_cuentas_listado.sql:
-- Qué hace: listado de Cuentas a gestionar (services/detalle.listado). Una fila por crédito con su origen y destino,
-- clasificación, saldo congelado y del día, prioridad, estado de cobranza, intentos, marca Top, gestión, visitas y pagos.
-- Poblaciones: 'cohorte' (activas el primer día, atributos del primer día) o 'activa' (activas en la fecha, saldo
-- congelado del primer día activo y cuentas nuevas del mes).
-- Orden: después de 0024. Quién la ejecuta: el administrador.

create or replace function public.cuentas_listado(
  p_fecha date,
  p_vista text default 'cohorte',
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null
)
returns table (
  credito text,
  origen text,
  destino text,
  movimiento text,
  saldo_congelado numeric,
  saldo_dia numeric,
  dias_mora integer,
  prioridad text,
  estado_cobranza text,
  rango_intentos text,
  top boolean,
  gestiones_mes integer,
  contacto_mes integer,
  rpc_mes integer,
  promesa_mes integer,
  monto_prometido numeric,
  monto_pagado numeric,
  ultima_gestion timestamp,
  dias_sin_gestion integer,
  visitas_mes bigint,
  supervisor text,
  tipo_credito text,
  tipo_legal text,
  gestor text
)
language sql
stable
security invoker
set search_path = public
as $$
  with f0 as (
    select min(f_reporte) as f from public.cobranza_diaria
  ),
  -- Atributos y saldo de la población
  pob_coh as (
    select c.credito, c.saldo as saldo_congelado, coalesce(c.bucket_inicial::text, 'Sin referencia') as origen,
           c.supervisor, c.tipo_credito, c.tipo_legal, c.gestor
    from public.cobranza_diaria c cross join f0
    where c.f_reporte = f0.f and c.saldo > 0
      and public.coincide(c.supervisor, p_supervisor)
      and public.coincide(c.tipo_credito, p_tipo_credito)
      and public.coincide(c.tipo_legal, p_tipo_legal)
  ),
  activos_f0 as (
    select c.credito from public.cobranza_diaria c cross join f0
    where c.f_reporte = f0.f and coalesce(c.saldo, 0) > 0
  ),
  congelado as (
    select distinct on (credito) credito, saldo
    from public.cobranza_diaria where coalesce(saldo, 0) > 0
    order by credito, f_reporte
  ),
  pob_act as (
    select c.credito, g.saldo as saldo_congelado,
           case when c.credito not in (select credito from activos_f0) then 'Nuevo en el mes'
                else coalesce(c.bucket_inicial::text, 'Sin referencia') end as origen,
           c.supervisor, c.tipo_credito, c.tipo_legal, c.gestor
    from public.cobranza_diaria c
    join congelado g on g.credito = c.credito
    where c.f_reporte = p_fecha and c.saldo > 0
      and public.coincide(c.supervisor, p_supervisor)
      and public.coincide(c.tipo_credito, p_tipo_credito)
      and public.coincide(c.tipo_legal, p_tipo_legal)
  ),
  pob as (
    select * from pob_coh where p_vista = 'cohorte'
    union all
    select * from pob_act where p_vista = 'activa'
  ),
  obs as (
    select credito, saldo, dias_mora, bucket_actual, estado_cobranza_acum, prioridad_acumulada,
           rango_intentos_acumulado, top, gestiones_acum, contacto_acum, rpc_acum, promesa_acum,
           monto_promesa_acum, monto_pagado_acum
    from public.cobranza_diaria where f_reporte = p_fecha
  ),
  gmes as (
    select g.credito, count(*) as gestiones, max(g.contacto) as contacto, max(g.rpc) as rpc, max(g.promesa) as promesa
    from public.gestion g
    where g.fecha_actividad < p_fecha + 1
    group by g.credito
  ),
  seg as (
    select p.credito, p.origen, p.saldo_congelado, p.supervisor, p.tipo_credito, p.tipo_legal, p.gestor,
           o.credito is not null as tiene_registro,
           coalesce(o.saldo, 0) as saldo_dia,
           o.dias_mora::integer as dias_mora,
           o.bucket_actual,
           o.estado_cobranza_acum, o.prioridad_acumulada, o.rango_intentos_acumulado, o.top,
           coalesce(gm.gestiones, 0) as gestiones_mes,
           coalesce(gm.contacto, 0) as contacto_mes,
           coalesce(gm.rpc, 0) as rpc_mes,
           coalesce(gm.promesa, 0) as promesa_mes,
           coalesce(o.monto_promesa_acum, 0) as monto_prometido,
           coalesce(o.monto_pagado_acum, 0) as monto_pagado
    from pob p
    left join obs o on o.credito = p.credito
    left join gmes gm on gm.credito = p.credito
  ),
  con_mov as (
    select s.*,
      case when s.origen = 'Nuevo en el mes' then 'Nuevo en el mes'
           when s.origen = 'Sin referencia' then 'Sin referencia'
           when p_vista = 'cohorte' and (not s.tiene_registro or s.bucket_actual is null) then 'Sin registro'
           when p_vista = 'activa' and s.bucket_actual is null then 'Sin registro'
           when s.bucket_actual::text::int < s.origen::int then 'Mejora'
           when s.bucket_actual::text::int = s.origen::int then 'Mantiene'
           else 'Desmejora' end as movimiento,
      case when s.bucket_actual is null then (case when p_vista = 'activa' then 'Sin mora' else 'Sin registro' end)
           else s.bucket_actual::text end as destino
    from seg s
  ),
  ult as (
    select g.credito, max(g.fecha_actividad) as ultima
    from public.gestion g
    where g.fecha_actividad < p_fecha + 1
    group by g.credito
  ),
  vis as (
    select v.credito, count(*) as n from public.visita v
    where v.fecha_visita < p_fecha + 1
    group by v.credito
  )
  select
    m.credito,
    m.origen,
    m.destino,
    m.movimiento,
    m.saldo_congelado,
    m.saldo_dia,
    m.dias_mora,
    m.prioridad_acumulada,
    m.estado_cobranza_acum,
    m.rango_intentos_acumulado,
    coalesce(m.top, false),
    m.gestiones_mes::integer,
    m.contacto_mes::integer,
    m.rpc_mes::integer,
    m.promesa_mes::integer,
    m.monto_prometido,
    m.monto_pagado,
    u.ultima,
    (p_fecha - u.ultima::date)::integer as dias_sin_gestion,
    coalesce(vi.n, 0) as visitas_mes,
    m.supervisor, m.tipo_credito, m.tipo_legal, m.gestor
  from con_mov m
  left join ult u on u.credito = m.credito
  left join vis vi on vi.credito = m.credito
  order by m.credito;
$$;

grant execute on function public.cuentas_listado(date, text, text[], text[], text[]) to authenticated;
