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

import gestion_cobranza as gc

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

# Gestiones del mes (database/cartera_queries.py SQL_GESTIONES) y catálogo de códigos (SQL_CODIGOS).
SQL_GESTIONES = """
SELECT
      REPLACE(LTRIM(RTRIM(A.credito)), '_', ' ')  AS credito
    , A.fecha_actividad
    , LOWER(LTRIM(RTRIM(A.usuario)))              AS usuario
    , A.codigo_accion
    , A.codigo_resultado
    , A.status_promesa_pago
    , A.fecha_promesa
    , A.estado_promesa
    , CAST(ISNULL(A.monto_promesa, 0) AS FLOAT)   AS monto_promesa
FROM dbo.th_mccollect_gestiones_diarias_regional A
WHERE A.pais = 'El Salvador'
  AND A.fecha_actividad >= ? AND A.fecha_actividad < ?
"""

# Promesas del mes anterior que siguen vigentes: gestiones con fecha de pago desde el día 1 de este mes.
SQL_PROMESAS_PREVIAS = SQL_GESTIONES.rstrip() + "\n  AND A.fecha_promesa >= ?\n"

SQL_CODIGOS = """
SELECT UPPER(REPLACE(id_concatenado, ' ', ''))  AS codigo
     , LTRIM(RTRIM(tipo_cartera))                AS tipo_cartera
     , ISNULL(gestionada, 0) AS gestionada, ISNULL(contacto, 0) AS contacto
     , ISNULL(rpc, 0) AS rpc, ISNULL(promesa, 0) AS promesa
FROM dbo.t_mccollect_codigos_gestiones
"""

# Mora de inicio de mes: último cierre de loantape anterior al día 1 (services/loantape.py + loantape_queries.py).
# Solo se traen crédito, JUR y días de mora: ningún dato personal del deudor sale de la base de origen.
SQL_CIERRES = ("SELECT * FROM OPENQUERY([loantape], 'SELECT rmaster_codigo, MAX(f_reporte) AS f_reporte, "
               "COUNT(*) AS filas FROM informix.loantape_his_musv GROUP BY rmaster_codigo')")
SQL_MORA_LOANTAPE = ("SELECT * FROM OPENQUERY([loantape], 'SELECT comprobante, numero, codubidoc, diasmora "
                     "FROM informix.loantape_his_musv WHERE rmaster_codigo = {codigo}')")

LIMITES_BUCKET = (0, 30, 60, 90, 120, 150)  # igual que config.py del Streamlit
COLUMNAS = ["credito", "f_reporte", "saldo", "saldo_vencido", "dias_mora", "bucket_actual",
            "supervisor", "gestor", "tipo_credito", "tipo_legal", "tipo_cartera"]
COLUMNAS_GESTION = ["gestiones_dia", "contacto_dia", "rpc_dia", "promesa_dia", "monto_promesa_dia",
                    "gestiones_acum", "gestionada_acum", "contacto_acum", "rpc_acum", "promesa_acum",
                    "monto_promesa_acum"]
COLUMNAS_MORA = ["bucket_inicial"]  # nulo = sin referencia (JUR o sin cierre de loantape)


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


def leer_gestion(ini: dt.date, fin: dt.date, cartera: pd.DataFrame) -> pd.DataFrame:
    """Gestiones del mes por crédito y día (marcas del catálogo, del día y acumulados). Réplica verificada en
    gestion_cobranza.py contra el Streamlit."""
    with conexion_origen() as con:
        ge = pd.read_sql_query(SQL_GESTIONES, con, params=[ini, fin])
        cat = pd.read_sql_query(SQL_CODIGOS, con)
    ge["fecha_actividad"] = pd.to_datetime(ge["fecha_actividad"], errors="coerce")
    ge["usuario"] = ge["usuario"].fillna("").astype(str)
    cat["tipo_cartera"] = cat["tipo_cartera"].fillna("").astype(str)
    for c in ("gestionada", "contacto", "rpc", "promesa"):
        cat[c] = pd.to_numeric(cat[c], errors="coerce").fillna(0).astype(int)
    cart = cartera.assign(f_reporte=pd.to_datetime(cartera["f_reporte"]))
    g = gc.preparar(gc.marcar(ge, cat, cart))
    out = gc.por_credito_dia(cart, g)
    out["f_reporte"] = out["f_reporte"].dt.date
    return out[["credito", "f_reporte"] + COLUMNAS_GESTION]


def leer_mora_inicial(ini: dt.date) -> pd.DataFrame:
    """bucket_inicial por crédito: mora del cierre de loantape anterior al día 1. JUR queda sin referencia (nulo)."""
    with conexion_origen() as con:
        cierres = pd.read_sql_query(SQL_CIERRES, con)
        cierres["f_reporte"] = pd.to_datetime(cierres["f_reporte"], errors="coerce")
        cierres["rmaster_codigo"] = pd.to_numeric(cierres["rmaster_codigo"], errors="coerce")
        cierres = cierres.dropna(subset=["rmaster_codigo", "f_reporte"]).sort_values("f_reporte")
        cierres = cierres[cierres["f_reporte"] < pd.Timestamp(ini)]
        if cierres.empty:
            return pd.DataFrame(columns=["credito", "bucket_inicial"]).astype({"bucket_inicial": "Int64"})
        codigo = int(cierres.iloc[-1]["rmaster_codigo"])
        lt = pd.read_sql_query(SQL_MORA_LOANTAPE.format(codigo=codigo), con)
    lt["credito"] = lt.pop("comprobante").astype(str).str.strip() + " " + lt.pop("numero").astype(str).str.strip()
    jur = lt["codubidoc"].fillna("").astype(str).str.strip().str.upper().eq("JUR")
    lt = lt.loc[~jur, ["credito", "diasmora"]]
    lt["bucket_inicial"] = pd.array([bucket(x) for x in pd.to_numeric(lt["diasmora"], errors="coerce")], dtype="Int64")
    return lt[["credito", "bucket_inicial"]].drop_duplicates("credito", keep="last").reset_index(drop=True)


def leer_promesas(ini: dt.date, fin: dt.date, cartera: pd.DataFrame) -> pd.DataFrame:
    """Filas de promesa (mes y mes anterior) para la función cartera_promesas. Réplica de services/promesas.py."""
    ini_prev = (ini - dt.timedelta(days=1)).replace(day=1)
    with conexion_origen() as con:
        mes = pd.read_sql_query(SQL_GESTIONES, con, params=[ini, fin])
        prev = pd.read_sql_query(SQL_PROMESAS_PREVIAS, con, params=[ini_prev, ini, ini])
        cat = pd.read_sql_query(SQL_CODIGOS, con)
    cat["tipo_cartera"] = cat["tipo_cartera"].fillna("").astype(str)
    for c in ("gestionada", "contacto", "rpc", "promesa"):
        cat[c] = pd.to_numeric(cat[c], errors="coerce").fillna(0).astype(int)
    cart = cartera.assign(f_reporte=pd.to_datetime(cartera["f_reporte"]))
    listas = []
    for raw in (prev, mes):
        raw["fecha_actividad"] = pd.to_datetime(raw["fecha_actividad"], errors="coerce")
        raw["fecha_promesa"] = pd.to_datetime(raw["fecha_promesa"], errors="coerce")
        raw["usuario"] = raw["usuario"].fillna("").astype(str)
        listas.append(raw if raw.empty else gc.preparar(gc.marcar(raw, cat, cart)))
    previas, del_mes = listas
    return gc.promesas_filas(del_mes, previas, pd.Timestamp(ini))


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


COLUMNAS_ESTADO = ["f_reporte", "credito", "estado", "monto", "n_promesas", "saldo_corte", "supervisor",
                   "tipo_credito", "tipo_legal", "tipo_cartera", "fila"]


def cargar_supabase(df: pd.DataFrame, ini: dt.date, promesas: pd.DataFrame, estado: pd.DataFrame) -> None:
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        sys.exit("Falta la variable de entorno SUPABASE_DB_URL.")
    with psycopg.connect(url, autocommit=False) as con:
        with con.cursor() as cur:
            todas = COLUMNAS + COLUMNAS_GESTION + COLUMNAS_MORA
            cur.execute("create temp table stg_cobranza (like public.cobranza_diaria) on commit drop")
            cur.execute("alter table stg_cobranza drop column id, drop column cargado_en")
            with cur.copy(f"copy stg_cobranza ({', '.join(todas)}) from stdin") as cp:
                for fila in df[todas].itertuples(index=False):
                    cp.write_row([_valor_sql(v) for v in fila])
            cambios = ",\n                  ".join(f"{c} = excluded.{c}" for c in todas if c not in ("credito", "f_reporte"))
            cur.execute(f"""
                insert into public.cobranza_diaria ({', '.join(todas)})
                select {', '.join(todas)} from stg_cobranza
                on conflict (credito, f_reporte) do update set
                  {cambios},
                  cargado_en = now()
            """)
            # Promesas: se reemplazan completas (mes y mes anterior).
            cur.execute("delete from public.promesa")
            with cur.copy("copy public.promesa (credito, fecha_gestion, fecha_promesa, monto, del_mes) from stdin") as cp:
                for fila in promesas.itertuples(index=False):
                    cp.write_row([_valor_sql(v) for v in fila])
            # Estado de promesas por día y crédito: se reemplaza completo.
            cur.execute("delete from public.promesa_dia")
            with cur.copy(f"copy public.promesa_dia ({', '.join(COLUMNAS_ESTADO)}) from stdin") as cp:
                solo_fecha = estado.assign(f_reporte=pd.to_datetime(estado["f_reporte"]).dt.date)
                for fila in solo_fecha[COLUMNAS_ESTADO].itertuples(index=False):
                    cp.write_row([_valor_sql(v) for v in fila])
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
    if not df.empty:
        print("Leyendo gestiones del mes…")
        gest = leer_gestion(ini, fin, df)
        df = df.merge(gest, on=["credito", "f_reporte"], how="left", validate="one_to_one")
        for c in COLUMNAS_GESTION:
            df[c] = df[c].fillna(0).astype("int64" if c not in ("monto_promesa_dia", "monto_promesa_acum") else "float64")
        print("Leyendo mora de inicio de mes (loantape)…")
        mi = leer_mora_inicial(ini)
        df = df.merge(mi, on="credito", how="left")
        df["bucket_inicial"] = df["bucket_inicial"].astype("Int64")
        print(f"Gestiones del mes: {int(df['gestiones_dia'].sum()):,} en días con gestión.")
    if args.dry_run:
        print("Dry-run: no se escribió nada en Supabase.")
        return
    if df.empty:
        sys.exit("Nada que cargar; no se borró nada en Supabase.")
    promesas = leer_promesas(ini, fin, df)
    print(f"Promesas: {len(promesas):,} filas (mes y mes anterior).")
    estado = gc.estado_diario(df, promesas)
    print(f"Estado de promesas por día: {len(estado):,} filas.")
    cargar_supabase(df, ini, promesas, estado)


if __name__ == "__main__":
    main()
