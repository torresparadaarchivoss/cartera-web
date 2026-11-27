-- 0044_modalidad_cuentas.sql
-- Qué hace: clase_cuentas también devuelve la modalidad (nombre_mod, el nombre del producto), para el Excel de Cuentas a
-- gestionar, como en el Streamlit («Modalidad (nombre_mod)»). El administrador lo pidió: el nombre del producto no se
-- considera dato personal. Sigue sin devolver datos de cliente (nombre, salario, domicilio, etc.).
-- Cambia el tipo que devuelve la función, por eso se borra y se vuelve a crear.
-- Orden: después de 0043. Quién la ejecuta: el administrador.

drop function if exists public.clase_cuentas(date);

create or replace function public.clase_cuentas(p_fecha date)
returns table (credito text, modalidad text, clase text, es_prorroga boolean)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select cl.credito,
           coalesce(cl.nombre_mod, '') as modalidad,
           upper(trim(coalesce(cl.nombre_mod, ''))) as nombre,
           upper(trim(coalesce(c.tipo_credito, ''))) as tipo
    from public.cliente_loantape cl
    left join public.cobranza_diaria c on c.credito = cl.credito and c.f_reporte = p_fecha
  ),
  marcada as (
    select credito, modalidad, nombre, tipo,
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
         (left(nombre, 7) = 'PROCATA' or left(nombre, 3) in ('PRG', 'DLO')) as es_prorroga
  from marcada;
$$;

revoke all on function public.clase_cuentas(date) from public;
grant execute on function public.clase_cuentas(date) to authenticated;
