-- 0010_permisos_lectura.sql
-- Qué hace: da permiso de lectura a los usuarios que entran a la app (rol authenticated) sobre todas las tablas
-- de negocio y de perfil, y de ejecución sobre las funciones de consulta. Sin esto la app muestra
-- «permission denied for table ...». Es idempotente: se puede correr de nuevo sin efecto.
-- Regla para migraciones futuras: toda tabla nueva lleva su propio «grant select ... to authenticated».
-- Orden: después de 0009. Quién la ejecuta: el administrador.

grant usage on schema public to authenticated;

grant select on
  public.paises,
  public.perfiles,
  public.acceso_paises,
  public.cobranza_diaria,
  public.promesa
to authenticated;

-- Funciones de consulta (todas son SECURITY INVOKER: usan los permisos de lectura de arriba).
grant execute on function
  public.cartera_fechas(),
  public.cartera_opciones(),
  public.cartera_stock(date, text[], text[], text[]),
  public.cartera_por_dimension(date, text, text[], text[], text[]),
  public.cartera_serie(text, text[], text[], text[]),
  public.cartera_gestion_mes(date, text[], text[], text[]),
  public.cartera_flujo_por_dimension(date, text, text[], text[], text[]),
  public.cartera_bucket0_desmejora(date, text[], text[], text[]),
  public.cartera_promesas(date, text[], text[], text[]),
  public.cartera_promesas_tabla(date, text, text[], text[], text[]),
  public.cartera_promesas_serie(date, text[], text[], text[]),
  public.paises_del_usuario(),
  public.es_super_admin(),
  public.es_admin_de_pais(text),
  public.coincide(text, text[])
to authenticated;
