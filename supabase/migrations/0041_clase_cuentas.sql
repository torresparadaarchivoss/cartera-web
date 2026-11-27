-- 0041_clase_cuentas.sql
-- Qué hace: clase de crédito (PYMES / Asalariado / No Asalariado) por crédito, para el Excel de Cuentas a gestionar.
-- Igual que coreografias.clase_credito del Streamlit: por siglas en nombre_mod (NO ASAL y variantes → No Asalariado;
-- PYME → PYMES; ASAL o sin siglas → Asalariado) y, si MCCOLLECT dice PYMES en tipo_credito, PYMES.
-- Solo devuelve crédito y clase: no expone datos personales de cliente_loantape (que sigue solo para administradores).
-- Orden: después de 0040. Quién la ejecuta: el administrador.

create or replace function public.clase_cuentas(p_fecha date)
returns table (credito text, clase text)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select cl.credito,
           upper(coalesce(cl.nombre_mod, '')) as nombre,
           upper(coalesce(c.tipo_credito, '')) as tipo
    from public.cliente_loantape cl
    left join public.cobranza_diaria c on c.credito = cl.credito and c.f_reporte = p_fecha
  ),
  marcada as (
    select credito, nombre, tipo,
           (strpos(nombre, 'NO ASALARIADO') > 0 or strpos(nombre, 'NO ASAL') > 0 or strpos(nombre, 'N/ASAL') > 0
            or strpos(nombre, 'NO/ASAL') > 0 or strpos(nombre, 'N-ASAL') > 0) as no_asal
    from base
  )
  select credito,
         case
           when strpos(nombre, 'PYME') > 0 or tipo = 'PYMES' then 'PYMES'
           when no_asal then 'No Asalariado'
           else 'Asalariado'
         end as clase
  from marcada;
$$;

revoke all on function public.clase_cuentas(date) from public;
grant execute on function public.clase_cuentas(date) to authenticated;
