-- 0026_administracion.sql
-- Qué hace: tablas de Administración (antes en data/metas.sqlite del Streamlit): catálogo de usuarios, metas por
-- usuario, asignaciones mensuales (supervisor, tramo, departamento), parámetros de comisión y de coreografía, asuetos y
-- presupuesto FPD. Lectura para todos los usuarios autenticados; escritura solo para administradores generales
-- (es_super_admin). La carga inicial la hace scripts/cargar_administracion.py desde el SQLite del Streamlit.
-- Orden: después de 0025. Quién la ejecuta: el administrador.

create table if not exists public.usuarios (
  id bigint not null,               -- mismo id que el SQLite del Streamlit (la carga lo conserva)
  tipo text not null check (tipo in ('visitador', 'agente')),
  usuario_norm text not null,
  nombre_mostrado text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  constraint usuarios_pkey primary key (id),
  constraint usuarios_tipo_usuario_key unique (tipo, usuario_norm)
);

create table if not exists public.metas_usuario (
  usuario_id bigint not null references public.usuarios (id) on delete cascade,
  periodo text not null,
  indicador text not null,
  valor_meta numeric(16, 6) not null,
  constraint metas_usuario_pkey primary key (usuario_id, periodo, indicador)
);

create table if not exists public.asignaciones (
  usuario_id bigint not null references public.usuarios (id) on delete cascade,
  periodo text not null,
  supervisor text,
  tramo text,
  departamento text,
  constraint asignaciones_pkey primary key (usuario_id, periodo)
);

create table if not exists public.parametros_comision (
  periodo text not null,
  clave text not null,
  valor numeric(16, 6) not null,
  constraint parametros_comision_pkey primary key (periodo, clave)
);

create table if not exists public.parametros_coreografia (
  periodo text not null,
  clave text not null,
  valor numeric(16, 6) not null,
  constraint parametros_coreografia_pkey primary key (periodo, clave)
);

create table if not exists public.asuetos (
  fecha date not null,
  descripcion text,
  constraint asuetos_pkey primary key (fecha)
);

create table if not exists public.presupuesto_fpd (
  mes text not null,                 -- aaaa-mm de la primera cuota
  valor numeric(16, 6) not null,     -- tasa máxima sobre el saldo pagaré (0,045 = 4,5 %)
  constraint presupuesto_fpd_pkey primary key (mes)
);

do $$
declare t text;
begin
  foreach t in array array['usuarios', 'metas_usuario', 'asignaciones', 'parametros_comision',
                           'parametros_coreografia', 'asuetos', 'presupuesto_fpd',
                           'metas_bucket', 'metas_legal', 'legal_canal']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_lectura', t);
    execute format('drop policy if exists %I on public.%I', t || '_escritura_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.es_super_admin()) with check (public.es_super_admin())',
                   t || '_escritura_admin', t);
  end loop;
end $$;
