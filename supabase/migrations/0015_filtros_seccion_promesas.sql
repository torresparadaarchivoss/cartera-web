-- 0015_filtros_seccion_promesas.sql
-- Qué hace: filtros propios de la sección Promesas (supervisor, usuario asignado, Cuentas Top) y monto pagado con esos
-- mismos filtros. Agrega gestor y marca Top a promesa_dia y pago, y reemplaza las funciones de promesas y pagado.
-- Regla (services/promesas.py y services/cuentas_top.py): los filtros de la sección se suman a los globales.
-- Orden: después de 0014. La carga (cargar_cobranza.py) llena las columnas nuevas. Quién la ejecuta: el administrador.

alter table public.promesa_dia
  add column if not exists gestor text not null default '',
  add column if not exists top boolean not null default false;

alter table public.pago
  add column if not exists gestor text not null default '',
  add column if not exists top boolean not null default false;

drop function if exists public.cartera_promesas(date, text[], text[], text[]);
drop function if exists public.cartera_promesas_tabla(date, text, text[], text[], text[]);
drop function if exists public.cartera_promesas_serie(date, text[], text[], text[]);
drop function if exists public.cartera_pagado_periodo(date, text[], text[], text[]);

-- Filtro de Cuentas Top: 'Todas' | 'Solo Cuentas Top' | 'Sin Cuentas Top'.
create or replace function public.cartera_top_ok(p_top text, p_marca boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_top = 'Solo Cuentas Top' then coalesce(p_marca, false)
    when p_top = 'Sin Cuentas Top' then not coalesce(p_marca, false)
    else true
  end;
$$;

create or replace function public.promesa_gestores()
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct gestor from public.promesa_dia where gestor <> '' order by 1;
$$;

create or replace function public.cartera_promesas(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null,
  p_sec_supervisor text[] default null,
  p_sec_gestor text[] default null,
  p_top text default 'Todas'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select * from public.promesa_dia
    where f_reporte = p_fecha
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
      and public.coincide(supervisor, p_sec_supervisor)
      and public.coincide(gestor, p_sec_gestor)
      and public.cartera_top_ok(p_top, top)
  ),
  agg as (
    select estado, count(*) as cuentas, sum(monto) as monto, sum(saldo_corte) as saldo, sum(n_promesas) as promesas
    from f group by estado
  ),
  nombres(estado) as (values ('Vencidas'), ('Vigentes'), ('Promesado del mes'), ('Del día'))
  select coalesce(jsonb_object_agg(n.estado, jsonb_build_object(
           'cuentas', coalesce(a.cuentas, 0),
           'monto', coalesce(a.monto, 0),
           'saldo', coalesce(a.saldo, 0),
           'promesas', coalesce(a.promesas, 0))), '{}'::jsonb)
  from nombres n
  left join agg a on a.estado = n.estado;
$$;

create or replace function public.cartera_promesas_tabla(
  p_fecha date,
  p_medida text default 'monto',
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null,
  p_sec_supervisor text[] default null,
  p_sec_gestor text[] default null,
  p_top text default 'Todas'
)
returns table (fila text, vencidas numeric, vigentes numeric, promesado_mes numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select fila,
         coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Vencidas'), 0),
         coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(case when p_medida = 'saldo' then saldo_corte else monto end) filter (where estado = 'Promesado del mes'), 0)
  from public.promesa_dia
  where f_reporte = p_fecha
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
    and public.coincide(supervisor, p_sec_supervisor)
    and public.coincide(gestor, p_sec_gestor)
    and public.cartera_top_ok(p_top, top)
  group by fila;
$$;

create or replace function public.cartera_promesas_serie(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null,
  p_sec_supervisor text[] default null,
  p_sec_gestor text[] default null,
  p_top text default 'Todas'
)
returns table (fecha date, vig_monto numeric, vig_saldo numeric, promesas_dia bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select f_reporte,
         coalesce(sum(monto) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(saldo_corte) filter (where estado = 'Vigentes'), 0),
         coalesce(sum(n_promesas) filter (where estado = 'Del día'), 0)
  from public.promesa_dia
  where f_reporte <= p_fecha
    and f_reporte < current_date
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
    and public.coincide(supervisor, p_sec_supervisor)
    and public.coincide(gestor, p_sec_gestor)
    and public.cartera_top_ok(p_top, top)
  group by f_reporte
  order by f_reporte;
$$;

create or replace function public.cartera_pagado_periodo(
  p_fecha date,
  p_supervisor text[] default null,
  p_tipo_credito text[] default null,
  p_tipo_legal text[] default null,
  p_sec_supervisor text[] default null,
  p_sec_gestor text[] default null,
  p_top text default 'Todas'
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(pago), 0)
  from public.pago
  where fecha <= p_fecha
    and public.coincide(supervisor, p_supervisor)
    and public.coincide(tipo_credito, p_tipo_credito)
    and public.coincide(tipo_legal, p_tipo_legal)
    and public.coincide(supervisor, p_sec_supervisor)
    and public.coincide(gestor, p_sec_gestor)
    and public.cartera_top_ok(p_top, top);
$$;

grant execute on function public.cartera_top_ok(text, boolean) to authenticated;
grant execute on function public.promesa_gestores() to authenticated;
grant execute on function public.cartera_promesas(date, text[], text[], text[], text[], text[], text) to authenticated;
grant execute on function public.cartera_promesas_tabla(date, text, text[], text[], text[], text[], text[], text) to authenticated;
grant execute on function public.cartera_promesas_serie(date, text[], text[], text[], text[], text[], text) to authenticated;
grant execute on function public.cartera_pagado_periodo(date, text[], text[], text[], text[], text[], text) to authenticated;
