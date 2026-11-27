-- 0045_segmento_cuentas.sql
-- Qué hace: clase_cuentas también devuelve nuevo_mes: el crédito no estaba en la foto del primer día del mes (crédito
-- nuevo del mes, criterio simplificado de FPD). Sirve para el filtro de Segmento de Cuentas a gestionar
-- (Prórroga, FPD, PYME, Otros). Sigue sin devolver datos de cliente.
-- Cambia el tipo que devuelve la función, por eso se borra y se vuelve a crear.
-- Orden: después de 0044. Quién la ejecuta: el administrador.

drop function if exists public.clase_cuentas(date);

create or replace function public.clase_cuentas(p_fecha date)
returns table (credito text, modalidad text, clase text, es_prorroga boolean, nuevo_mes boolean)
language sql
stable
security definer
set search_path = public
as $$
  with f0 as (
    select min(f_reporte) as f from public.cobranza_diaria
  ),
  base as (
    select cl.credito,
           coalesce(cl.nombre_mod, '') as modalidad,
           upper(trim(coalesce(cl.nombre_mod, ''))) as nombre,
           upper(trim(coalesce(c.tipo_credito, ''))) as tipo,
           not exists (
             select 1 from public.cobranza_diaria x, f0
             where x.credito = cl.credito and x.f_reporte = f0.f
           ) as nuevo
    from public.cliente_loantape cl
    left join public.cobranza_diaria c on c.credito = cl.credito and c.f_reporte = p_fecha
  ),
  marcada as (
    select credito, modalidad, nombre, tipo, nuevo,
           (strpos(nombre, 'NO ASALARIADO') > 0 or strpos(nombre, 'NO ASAL') > 0 or strpos(nombre, 'N/ASAL') > 0
            or strpos(nombre, 'NO/ASAL') > 0 or strpos(nombre, 'N-ASAL') > 0) as no_asal
    from base
  )
  select credito,
         modalidad,
         case
           when strpos(nombre, 'PYME') > 0 or tipo = 'PYMES' then 'PYMES'
           when no_asal then 'No Asalariado'
           else 'Asalariado'
         end as clase,
         (left(nombre, 7) = 'PROCATA' or left(nombre, 3) in ('PRG', 'DLO')) as es_prorroga,
         nuevo as nuevo_mes
  from marcada;
$$;

revoke all on function public.clase_cuentas(date) from public;
grant execute on function public.clase_cuentas(date) to authenticated;
