-- 0016_metas.sql
-- Qué hace: metas de recuperación por bucket, metas de recaudo legal por canal y gestor, y canal de cada gestor
-- legal. Son configuración del mes (antes en data/metas.sqlite del Streamlit). La carga las copia desde ese archivo.
-- Orden: después de 0015. Quién la ejecuta: el administrador.

create table if not exists public.metas_bucket (
  bucket text not null,              -- '0'..'6' y '6 Legal'
  periodo text not null,             -- aaaa-mm
  indicador text not null,           -- recuperacion | mejora_saldo | mantiene_max | desmejora_max
  valor_meta numeric(16, 6),
  constraint metas_bucket_pkey primary key (bucket, periodo, indicador)
);

create table if not exists public.metas_legal (
  llave text not null,               -- canal (Interno, Externo, Embargo) o gestor
  periodo text not null,
  indicador text not null,           -- canal | gestor
  valor_meta numeric(16, 6),
  constraint metas_legal_pkey primary key (llave, periodo, indicador)
);

create table if not exists public.legal_canal (
  gestor text not null,
  periodo text not null,
  canal text not null,
  constraint legal_canal_pkey primary key (gestor, periodo)
);

alter table public.metas_bucket enable row level security;
alter table public.metas_legal enable row level security;
alter table public.legal_canal enable row level security;

create policy metas_bucket_lectura on public.metas_bucket for select to authenticated using (true);
create policy metas_legal_lectura on public.metas_legal for select to authenticated using (true);
create policy legal_canal_lectura on public.legal_canal for select to authenticated using (true);

grant select on public.metas_bucket, public.metas_legal, public.legal_canal to authenticated;
