-- 0001_esquema_base.sql
-- Qué hace: crea países, perfiles de usuario y su acceso por país, con RLS habilitado.
-- Orden: primera migración. Ejecutarla en el SQL Editor de Supabase (o con la herramienta de Supabase).
-- Quién la ejecuta: el administrador del proyecto.

create table if not exists public.paises (
  id text not null,
  nombre text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint paises_pkey primary key (id)
);

create table if not exists public.perfiles (
  id uuid not null,
  nombre text not null default '',
  es_admin boolean not null default false,
  es_admin_pais boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_pkey primary key (id),
  constraint perfiles_id_fkey foreign key (id) references auth.users (id) on delete cascade
);

-- Acceso por país. Por defecto un visualizador ve todos los países (sin filas = acceso a todos).
create table if not exists public.acceso_paises (
  usuario_id uuid not null,
  pais_id text not null,
  creado_en timestamptz not null default now(),
  constraint acceso_paises_pkey primary key (usuario_id, pais_id),
  constraint acceso_paises_usuario_fkey foreign key (usuario_id) references public.perfiles (id) on delete cascade,
  constraint acceso_paises_pais_fkey foreign key (pais_id) references public.paises (id)
);

create index if not exists acceso_paises_pais_idx on public.acceso_paises (pais_id);

alter table public.paises enable row level security;
alter table public.perfiles enable row level security;
alter table public.acceso_paises enable row level security;
