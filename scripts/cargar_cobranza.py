"""Carga la cartera diaria del mes desde SQL Server (MCCOLLECT) hacia Supabase (tabla cobranza_diaria).

Se ejecuta en TU máquina (es la única que tiene red al SQL Server). La app web solo lee de Supabase.

Variables de entorno (nunca en archivos del repo):
  MCCOLLECT_CONN   cadena ODBC completa a MCCOLLECT (la misma que usa el Streamlit en DWH_CONN, o la armada
                   con DRIVER/SERVER/DATABASE). Ejemplo:
                   DRIVER={ODBC Driver 18 for SQL Server};SERVER=SRV;DATABASE=MCCOLLECT;Trusted_Connection=yes;
                   Encrypt=yes;TrustServerCertificate=yes;
  SUPABASE_DB_URL  cadena de conexión Postgres de Supabase (Settings → Database → Connection string, modo
                   «Session pooler» o directo). Incluye la contraseña de la base: no la pegues en ningún archivo.

Uso:
  python cargar_cobranza.py --dry-run          # lee SQL Server y muestra resumen; no escribe en Supabase
  python cargar_cobranza.py                    # carga el mes en curso y borra meses anteriores (ventana de 1 mes)
  python cargar_cobranza.py --mes 2026-11      # otro mes

Idempotente: vuelve a correrlo las veces que haga falta; hace upsert por (credito, f_reporte).
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys

import pandas as pd
import psycopg
import pyodbc

# Misma consulta de cartera que database/cartera_queries.py del Streamlit (PAIS = 'el salvador').
# Los parámetros :ini y :fin se cambian por ? (pyodbc) en el mismo orden.
SQL_CARTERA = """
SELECT
      LTRIM(RTRIM(C.PR_MC_CREDITO))              AS credito
    , C.F_REPORTE                                AS f_reporte
    , CAST(C.PR_CL_SALDO_DOC AS FLOAT)           AS saldo
    , CAST(C.PR_CL_VALOR_VENCIDO AS FLOAT)       AS saldo_vencido
    , C.PR_CL_DIA_MORA_HOY                       AS dias_mora
    , LTRIM(RTRIM(C.Supervisor))                 AS supervisor
    , LOWER(LTRIM(RTRIM(C.PR_MC_UASIGNADO)))     AS gestor
    , LTRIM(RTRIM(C.PR_CL_TIPO_CREDITO))         AS tipo_credito
    , ISNULL(LTRIM(RTRIM(C.PR_CL_TIPO_CREDITO_LEGAL)), '') AS tipo_legal
FROM dbo.th_mccollect_cartera_diaria_regional C
WHERE C.PAIS = 'el salvador'
  AND C.F_REPORTE >= ? AND C.F_REPORTE < ?
"""

LIMITES_BUCKET = (0, 30, 60, 90, 120, 150)  # igual que config.py del Streamlit
COLUMNAS = ["credito", "f_reporte", "saldo", "saldo_vencido", "dias_mora", "bucket_actual",
            "supervisor", "gestor", "tipo_credito", "tipo_legal", "tipo_cartera"]


def bucket(dias) -> int | None:
    """0: <=0 · 1: 1-30 · 2: 31-60 · 3: 61-90 · 4: 91-120 · 5: 121-150 · 6: >150 · None si no hay mora."""
    if dias is None or pd.isna(dias):
        return None
    for i, lim in enumerate(LIMITES_BUCKET):
        if dias <= lim:
            return i
    return len(LIMITES_BUCKET)


def limites_mes(anio: int, mes: int) -> tuple[dt.date, dt.date]:
    ini = dt.date(anio, mes, 1)
    fin = dt.date(anio + (mes == 12), 1 if mes == 12 else mes + 1, 1)
    return ini, fin


def conexion_origen() -> pyodbc.Connection:
    cadena = os.environ.get("MCCOLLECT_CONN", "").strip()
    if not cadena:
        sys.exit("Falta la variable de entorno MCCOLLECT_CONN (cadena ODBC a MCCOLLECT).")
    return pyodbc.connect(cadena, timeout=30)


def leer_cartera(ini: dt.date, fin: dt.date) -> pd.DataFrame:
    with conexion_origen() as con:
        df = pd.read_sql_query(SQL_CARTERA, con, params=[ini, fin])
    df["f_reporte"] = pd.to_datetime(df["f_reporte"]).dt.normalize().dt.date
    df["credito"] = df["credito"].astype(str).str.strip()
    df["saldo"] = pd.to_numeric(df["saldo"], errors="coerce").fillna(0.0)
    df["saldo_vencido"] = pd.to_numeric(df["saldo_vencido"], errors="coerce")
    df["dias_mora"] = pd.to_numeric(df["dias_mora"], errors="coerce")
    for c in ("supervisor", "gestor", "tipo_credito", "tipo_legal"):
        df[c] = df[c].fillna("").astype(str)
    # Mismas reglas que services/calculations.py: bucket de mora y tipo de cartera (JUR = Legal).
    df["bucket_actual"] = pd.array([bucket(x) for x in df["dias_mora"]], dtype="Int64")
    df["tipo_cartera"] = df["tipo_legal"].str.strip().str.upper().map(
        lambda t: "Legal" if t == "JUR" else "Administrativa")
    # Enteros sin decimales (un 3.0 rompe la carga en Postgres).
    df["dias_mora"] = df["dias_mora"].round().astype("Int64")
    # Los créditos aparecen una vez por fecha; si el origen repite, se queda la última fila.
    df = df.drop_duplicates(["credito", "f_reporte"], keep="last")
    return df[COLUMNAS]


def _valor_sql(v):
    """Convierte un valor de pandas/numpy a algo que psycopg acepte; nulos → None."""
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, float) and v != v:  # NaN
        return None
    return v.item() if hasattr(v, "item") else v


def resumen(df: pd.DataFrame, ini: dt.date) -> None:
    if df.empty:
        print("No hay cartera para el mes seleccionado.")
        return
    ultima = df["f_reporte"].max()
    d = df[(df["f_reporte"] == ultima) & (df["saldo"] > 0)]
    m90 = d.loc[d["dias_mora"].fillna(0) > 90, "saldo"].sum()
    print(f"Filas: {len(df):,} · fechas: {df['f_reporte'].nunique()} · primera {df['f_reporte'].min()} · última {ultima}")
    print(f"Stock del {ultima} (saldo > 0, sin filtros): cuentas {len(d):,} · saldo {d['saldo'].sum():,.2f} · "
          f"índice 90+ {m90 / d['saldo'].sum() * 100:.2f} %" if d["saldo"].sum() else "Sin saldo en la última fecha.")
    if df["bucket_actual"].isna().all():
        print("Aviso: ningún registro tiene días de mora.")


def cargar_supabase(df: pd.DataFrame, ini: dt.date) -> None:
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        sys.exit("Falta la variable de entorno SUPABASE_DB_URL.")
    with psycopg.connect(url, autocommit=False) as con:
        with con.cursor() as cur:
            cur.execute("create temp table stg_cobranza (like public.cobranza_diaria) on commit drop")
            cur.execute("alter table stg_cobranza drop column id, drop column cargado_en")
            with cur.copy(f"copy stg_cobranza ({', '.join(COLUMNAS)}) from stdin") as cp:
                for fila in df.itertuples(index=False):
                    cp.write_row([_valor_sql(v) for v in fila])
            cur.execute(f"""
                insert into public.cobranza_diaria ({', '.join(COLUMNAS)})
                select {', '.join(COLUMNAS)} from stg_cobranza
                on conflict (credito, f_reporte) do update set
                  saldo = excluded.saldo,
                  saldo_vencido = excluded.saldo_vencido,
                  dias_mora = excluded.dias_mora,
                  bucket_actual = excluded.bucket_actual,
                  supervisor = excluded.supervisor,
                  gestor = excluded.gestor,
                  tipo_credito = excluded.tipo_credito,
                  tipo_legal = excluded.tipo_legal,
                  tipo_cartera = excluded.tipo_cartera,
                  cargado_en = now()
            """)
            # Ventana de 1 mes: se borra lo anterior al mes cargado.
            cur.execute("delete from public.cobranza_diaria where f_reporte < %s", (ini,))
            cur.execute("analyze public.cobranza_diaria")
        con.commit()
    print(f"Cargadas {len(df):,} filas en Supabase (ventana desde {ini}).")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mes", help="AAAA-MM. Por defecto, el mes en curso.")
    ap.add_argument("--dry-run", action="store_true", help="Lee SQL Server y muestra el resumen; no escribe.")
    args = ap.parse_args()

    hoy = dt.date.today()
    anio, mes = (int(x) for x in args.mes.split("-")) if args.mes else (hoy.year, hoy.month)
    ini, fin = limites_mes(anio, mes)

    print(f"Leyendo cartera de {ini} a {fin - dt.timedelta(days=1)} desde MCCOLLECT…")
    df = leer_cartera(ini, fin)
    resumen(df, ini)
    if args.dry_run:
        print("Dry-run: no se escribió nada en Supabase.")
        return
    if df.empty:
        sys.exit("Nada que cargar; no se borró nada en Supabase.")
    cargar_supabase(df, ini)


if __name__ == "__main__":
    main()
