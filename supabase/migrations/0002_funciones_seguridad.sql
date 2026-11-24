-- 0002_funciones_seguridad.sql
-- Qué hace: funciones auxiliares SECURITY DEFINER y políticas RLS de las tablas de 0001.
-- Orden: después de 0001. Las políticas usan las funciones; nunca se repite una subconsulta en cada política.
-- Quién la ejecuta: el administrador del proyecto.

create or replace function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.es_admin from public.perfiles p where p.id = auth.uid()), false
  );
$$;

create or replace function public.paises_del_usuario()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  -- Sin filas en acceso_paises = acceso a todos los países.
  select pa.id
  from public.paises pa
  where public.es_super_admin()
     or not exists (select 1 from public.acceso_paises x where x.usuario_id = auth.uid())
     or exists (select 1 from public.acceso_paises x
                where x.usuario_id = auth.uid() and x.pais_id = pa.id);
$$;

create or replace function public.es_admin_de_pais(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_super_admin()
      or exists (select 1 from public.perfiles pf
                 where pf.id = auth.uid() and pf.es_admin_pais)
         and exists (select 1 from public.acceso_paises x
                     where x.usuario_id = auth.uid() and x.pais_id = p);
$$;

revoke execute on function public.es_super_admin() from anon;
revoke execute on function public.paises_del_usuario() from anon;
revoke execute on function public.es_admin_de_pais(text) from anon;

-- Lectura de países: cualquier usuario autenticado ve solo sus países.
create policy paises_lectura on public.paises
  for select to authenticated
  using (id in (select public.paises_del_usuario()));

-- Perfiles: cada usuario lee el suyo; el administrador lee todos.
create policy perfiles_lectura on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_super_admin());

-- Escritura de perfiles solo para el administrador. Un visualizador no cambia su rol ni su país.
create policy perfiles_escritura_admin on public.perfiles
  for all to authenticated
  using (public.es_super_admin())
  with check (public.es_super_admin());

create policy acceso_paises_lectura on public.acceso_paises
  for select to authenticated
  using (usuario_id = auth.uid() or public.es_super_admin());

create policy acceso_paises_escritura_admin on public.acceso_paises
  for all to authenticated
  using (public.es_super_admin())
  with check (public.es_super_admin());
