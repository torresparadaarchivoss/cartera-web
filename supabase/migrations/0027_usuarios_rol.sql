-- 0027_usuarios_rol.sql
-- Qué hace: agrega el rol de cada usuario (agente, supervisor o visitador), que el Streamlit guarda aparte del tipo.
-- La carga de cargar_detalle.py asigna rol a los usuarios nuevos del mes; la carga inicial lo copia del SQLite.
-- Orden: después de 0026. Quién la ejecuta: el administrador.

alter table public.usuarios add column if not exists rol text;

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol is null or rol in ('agente', 'supervisor', 'visitador'));
