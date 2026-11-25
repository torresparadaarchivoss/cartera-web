r"""Calcula las coreografías del mes con el motor del Streamlit (services/coreografias) y guarda el resultado en Supabase:
episodios evaluados (coreo_episodio), cosecha FPD (coreo_fpd) y parámetros (coreo_config).

Mora previa: el motor pide la foto del último día del mes anterior. Aquí se toma dias_mora del loantape (diasmora, cierre
anterior) y el saldo del primer día del mes; con eso no hace falta guardar historial de cartera.

Uso (desde scripts/, con el Python del Streamlit y SUPABASE_DB_URL en el entorno):
    python cargar_coreografias.py --mes 2026-11 [--origen "C:\Users\...\dashboard_cartera"] [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd


def mora_previa_desde_loantape(d) -> pd.DataFrame:
    """Una fila por crédito: mora del cierre anterior (loantape.diasmora) y saldo del primer día del mes."""
    lt = d.loantape[["credito", "diasmora"]].copy()
    lt["credito"] = lt["credito"].astype(str).str.strip()
    saldo0 = d.cartera[d.cartera["f_reporte"] == d.f0].drop_duplicates("credito").set_index("credito")["saldo"]
    return pd.DataFrame({
        "credito": lt["credito"],
        "f_reporte": pd.Timestamp(d.f0) - pd.Timedelta(days=1),
        "dias_mora": pd.to_numeric(lt["diasmora"], errors="coerce"),
        "saldo": lt["credito"].map(saldo0).fillna(0.0).astype(float),
    }).drop_duplicates("credito", keep="last").reset_index(drop=True)


def parametros_web(periodo: str) -> dict:
    """Parámetros de coreografía editados en la web (parametros_coreografia): el último valor de cada clave hasta el mes.
    Sin conexión o sin valores, no cambia nada."""
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        return {}
    import psycopg  # noqa: E402

    with psycopg.connect(url) as con:
        filas = con.execute("select clave, valor, periodo from public.parametros_coreografia where periodo <= %s "
                            "order by periodo desc", (periodo,)).fetchall()
    salida: dict = {}
    for clave, valor, _ in filas:
        salida.setdefault(clave, float(valor))
    return salida


def calcular(origen: str, anio: int, mes: int) -> dict:
    sys.path.insert(0, origen)
    from config import app_config_o_defecto  # noqa: E402  (lectura del Streamlit)
    from database_admin import coreografia_repository as cr  # noqa: E402
    from database_admin import users_repository as ur  # noqa: E402
    from services import coreografias as co  # noqa: E402
    from services.data_store import cargar_mes  # noqa: E402

    d = cargar_mes(anio, mes, usar_cache=False)
    ruta = app_config_o_defecto().metas_db
    prm, origen_params = cr.parametros(ruta, d.periodo)
    prm = {**prm, **parametros_web(d.periodo)}
    cal = co.Calendario(frozenset(cr.dias_no_habiles(ruta)), bool(prm["sabado_habil"]))
    corte = pd.Timestamp(d.cartera["f_reporte"].max())
    d.mora_previa = mora_previa_desde_loantape(d)
    ag = ur.listar(ruta, "agente")
    visitadores = frozenset(ag.loc[ag.get("rol", pd.Series(dtype=str)) == "visitador", "usuario_norm"])
    ep = co.episodios(d, corte, visitadores)
    ev = co.evaluar(ep, corte, prm, cal, None) if not ep.empty else pd.DataFrame()
    fpd = co.fpd_cosecha(d, corte, prm)
    pres = cr.presupuesto_fpd(ruta)
    return {"d": d, "prm": prm, "origen_params": origen_params, "corte": corte, "ev": ev, "fpd": fpd,
            "presupuesto": pres, "ruta": ruta}


# (columna, tipo): d = fecha, n = número, i = entero, b = sí/no, t = texto.
EPISODIO = [("credito", "t"), ("fecha_entrada", "d"), ("segmento", "t"), ("clase", "t"), ("gestor", "t"),
            ("supervisor", "t"), ("tipo_credito", "t"), ("tipo_legal", "t"), ("nombre_mod", "t"), ("fecha_renov", "d"),
            ("primera_cuota", "d"), ("saldopagare", "n"), ("bucket_entrada", "i"), ("saldo_entrada", "n"), ("dia1", "d"),
            ("limite_visita", "d"), ("semana", "d"), ("estado", "t"), ("coreografia", "t"), ("paso_gestion_d1", "t"),
            ("paso_acuerdo_d1", "t"), ("paso_visita", "t"), ("paso_combinado", "t"), ("paso_promesa_pago", "t"),
            ("paso_fallido", "t"), ("fecha_fallo", "d"), ("dias_desde_fallo", "i"), ("dias_sin_gestion_max", "i"),
            ("dias_promesa_pago", "i"), ("gestiones_cc", "i"), ("gestiones_campo", "i"), ("alerta_sin_gestion", "b"),
            ("recup_plazo", "i"), ("fuera_alcance", "b"), ("accion", "t")]
FPD = [("credito", "t"), ("primera_cuota", "d"), ("fecha_renov", "d"), ("saldopagare", "n"), ("nombre_mod", "t"),
       ("fecha_evaluacion", "d"), ("vence_corte", "b"), ("fpd", "b"), ("clase", "t"), ("supervisor", "t"), ("gestor", "t")]


def _celda(v, tipo: str):
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    if tipo == "d":
        return pd.Timestamp(v).date()
    if tipo == "n":
        return float(v)
    if tipo == "i":
        return int(v)
    if tipo == "b":
        return bool(v)
    return str(v)


def _filas(df: pd.DataFrame, cols: list) -> list:
    return [[_celda(v, t) for v, (_, t) in zip(fila, cols)] for fila in df[[c for c, _ in cols]].itertuples(index=False)]


def cargar(r: dict, periodo: str) -> None:
    import psycopg  # solo al escribir

    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        sys.exit("Falta la variable de entorno SUPABASE_DB_URL.")
    ev, fpd, prm = r["ev"], r["fpd"], r["prm"]
    config = [[periodo, k, float(v)] for k, v in prm.items()]
    with psycopg.connect(url, autocommit=False) as con:
        with con.cursor() as cur:
            for tabla in ("coreo_episodio", "coreo_fpd"):
                cur.execute(f"delete from public.{tabla}")
            cur.execute("delete from public.coreo_config where periodo = %s", (periodo,))
            cols = [c for c, _ in EPISODIO]
            with cur.copy(f"copy public.coreo_episodio ({', '.join(cols)}) from stdin") as cp:
                for fila in _filas(ev, EPISODIO):
                    cp.write_row(fila)
            if not fpd.empty:
                cols = [c for c, _ in FPD]
                with cur.copy(f"copy public.coreo_fpd ({', '.join(cols)}) from stdin") as cp:
                    for fila in _filas(fpd, FPD):
                        cp.write_row(fila)
            with cur.copy("copy public.coreo_config (periodo, clave, valor) from stdin") as cp:
                for fila in config:
                    cp.write_row(fila)
        con.commit()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mes", required=True, help="AAAA-MM")
    ap.add_argument("--origen", default=r"c:\Users\jctorresp\Videos\dashboard_cartera")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    anio, mes = (int(x) for x in args.mes.split("-"))
    r = calcular(args.origen, anio, mes)
    ev, fpd = r["ev"], r["fpd"]
    print(f"Episodios en alcance: {len(ev):,} · cosecha FPD: {len(fpd):,} filas · corte {r['corte'].date()}")
    print("Columnas episodio:", list(ev.columns))
    print("Columnas FPD:", list(fpd.columns))
    if args.dry_run:
        print("Dry-run: no se escribió nada en Supabase.")
        return
    cargar(r, args.mes)
    print("Coreografías cargadas en Supabase (episodios, cosecha FPD y parámetros del mes).")


if __name__ == "__main__":
    main()
