-- 0005_gestion_mes.sql
-- Qué hace: agrega a cobranza_diaria las columnas de gestión por crédito y día (del día y acumuladas del mes),
-- y la función de flujo del mes para Resumen gerencial (cobertura, contactabilidad, RPC, promesas).
-- Reglas del Streamlit (services/indicadores.py): cuentas del mes = activas en la fecha + canceladas en el mes
-- (tuvieron saldo y hoy ya no), sin las que están en bucket 0 en la fecha.
-- Orden: después de 0004. Antes de correr la carga nueva. Quién la ejecuta: el administrador.

alter table public.cobranza_diaria
  add column if not exists gestiones_dia integer not null default 0,
  add column if not exists contacto_dia integer not null default 0,
  add column if not exists rpc_dia integer not null default 0,
  add column if not exists promesa_dia integer not null default 0,
  add column if not exists monto_promesa_dia numeric(14, 2) not null default 0,
  add column if not exists gestiones_acum integer not null default 0,
  add column if not exists gestionada_acum integer not null default 0,
  add column if not exists contacto_acum integer not null default 0,
  add column if not exists rpc_acum integer not null default 0,
  add column if not exists promesa_acum integer not null default 0,
  add column if not exists monto_promesa_acum numeric(14, 2) not null default 0;

create or replace function public.cartera_gestion_mes(
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
  with base as (
    select * from public.cobranza_diaria where f_reporte <= p_fecha
  ),
  con_saldo as (select distinct credito from base where saldo > 0),
  activas_hoy as (select credito from base where f_reporte = p_fecha and saldo > 0),
  -- Canceladas: última fila hasta la fecha de cada crédito que tuvo saldo y hoy ya no. Filtros sobre esa fila.
  canceladas as (
    select distinct on (credito) *
    from base
    where credito in (select credito from con_saldo)
      and credito not in (select credito from activas_hoy)
    order by credito, f_reporte desc
  ),
  hoy as (
    select * from base
    where f_reporte = p_fecha and saldo > 0
      and public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  mes as (
    select * from hoy
    union all
    select * from canceladas
    where public.coincide(supervisor, p_supervisor)
      and public.coincide(tipo_credito, p_tipo_credito)
      and public.coincide(tipo_legal, p_tipo_legal)
  ),
  -- La gestión del mes no cuenta las cuentas al día en la fecha (bucket 0 de hoy).
  ajustado as (select * from mes where bucket_actual is distinct from 0)
  select jsonb_build_object(
    'cuentas', count(*),
    'gestiones', coalesce(sum(gestiones_acum), 0),
    'creditos_gestionados', count(*) filter (where gestiones_acum > 0),
    'creditos_contacto', count(*) filter (where contacto_acum > 0),
    'creditos_rpc', count(*) filter (where rpc_acum > 0),
    'creditos_promesa', count(*) filter (where promesa_acum > 0),
    'canceladas', (select count(*) from canceladas
                   where public.coincide(supervisor, p_supervisor)
                     and public.coincide(tipo_credito, p_tipo_credito)
                     and public.coincide(tipo_legal, p_tipo_legal))
  )
  from ajustado;
$$;

revoke execute on function public.cartera_gestion_mes(date, text[], text[], text[]) from anon;
