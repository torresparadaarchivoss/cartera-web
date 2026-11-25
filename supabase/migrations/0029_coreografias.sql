-- 0029_coreografias.sql
-- Qué hace: resultado mensual de las coreografías de gestión (services/coreografias del Streamlit), calculado en la
-- carga (scripts/cargar_coreografias.py): episodios de mora evaluados, cosecha FPD y parámetros del mes.
-- No guarda historial de cartera ni datos de ruta (domicilio o trabajo). Orden: después de 0028. Quién la ejecuta:
-- el administrador.

create table if not exists public.coreo_episodio (
  credito text not null,
  fecha_entrada date not null,
  segmento text,
  clase text,
  gestor text,
  supervisor text,
  tipo_credito text,
  tipo_legal text,
  nombre_mod text,
  fecha_renov date,
  primera_cuota date,
  saldopagare numeric(14, 2),
  bucket_entrada smallint,
  saldo_entrada numeric(14, 2),
  dia1 date,
  limite_visita date,
  semana date,
  estado text,
  coreografia text,
  paso_gestion_d1 text,
  paso_acuerdo_d1 text,
  paso_visita text,
  paso_combinado text,
  paso_promesa_pago text,
  paso_fallido text,
  fecha_fallo date,
  dias_desde_fallo integer,
  dias_sin_gestion_max integer,
  dias_promesa_pago integer,
  gestiones_cc integer,
  gestiones_campo integer,
  alerta_sin_gestion boolean,
  recup_plazo smallint,
  fuera_alcance boolean,
  constraint coreo_episodio_pkey primary key (credito, fecha_entrada)
);

create table if not exists public.coreo_fpd (
  credito text not null,
  primera_cuota date,
  fecha_renov date,
  saldopagare numeric(14, 2),
  nombre_mod text,
  fecha_evaluacion date,
  vence_corte boolean,
  fpd boolean,
  clase text,
  supervisor text,
  gestor text,
  constraint coreo_fpd_pkey primary key (credito)
);

create table if not exists public.coreo_config (
  periodo text not null,
  clave text not null,
  valor numeric(16, 6) not null,
  constraint coreo_config_pkey primary key (periodo, clave)
);

alter table public.coreo_episodio enable row level security;
alter table public.coreo_fpd enable row level security;
alter table public.coreo_config enable row level security;

create policy coreo_episodio_lectura on public.coreo_episodio for select to authenticated using (true);
create policy coreo_fpd_lectura on public.coreo_fpd for select to authenticated using (true);
create policy coreo_config_lectura on public.coreo_config for select to authenticated using (true);

grant select on public.coreo_episodio, public.coreo_fpd, public.coreo_config to authenticated;
