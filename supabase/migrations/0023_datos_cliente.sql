-- 0023_datos_cliente.sql
-- Qué hace: datos del cliente del cierre de loantape del mes, por crédito (Cuentas a gestionar: nombre, edad, género,
-- salario, domicilio, profesión, dirección de trabajo, etc.). DATOS PERSONALES.
-- Acceso: solo administradores generales (perfiles.es_admin) por RLS; el resto de usuarios no ve filas.
-- Nunca se exporta al HTML ni al repositorio. Orden: después de 0022. Quién la ejecuta: el administrador.

create table if not exists public.cliente_loantape (
  credito text not null,
  ciudad text,
  nombre_mod text,
  fecha_renov date,
  nombre_deudor text,
  edad integer,
  genero text,
  salario numeric(14, 2),
  ubicacion text,
  profesion text,
  dire_trabajo text,
  saldopagare numeric(14, 2),
  ruta_domicilio text,
  ruta_trabajo text,
  f_cierre date,
  constraint cliente_loantape_pkey primary key (credito)
);

alter table public.cliente_loantape enable row level security;

create policy cliente_loantape_solo_admin on public.cliente_loantape
  for select to authenticated
  using (public.es_super_admin());

grant select on public.cliente_loantape to authenticated;
