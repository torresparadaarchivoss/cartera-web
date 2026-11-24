"""Gestión de cobranza por crédito y día: marcas, gestiones del día y acumulados del mes.

Réplica de services/codigos.py (marcas), services/data_store.py (_preparar_gestiones) y
services/calculations.py (gestion_diaria, _acumulados, cobranza diaria). Se verifica contra el código original
en scripts/verificar_gestion.py.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

LEGAL = "Legal"
ADMIN_DWH, LEGAL_DWH = "Admin", "Legal"
MARCAS = ["gestionada", "contacto", "rpc", "promesa"]

# Config del Streamlit (config.py)
CODIGOS_PRP = ("PRP", "PPP", "SEG", "PRL", "PPL", "SGL")
CODIGOS_PROMESA_EXTRA = ("SGL",)
USUARIOS_EXCLUIDOS_GESTION = frozenset({"arrivasg", "cdhidalgog", "eabaltodanom", "gssolag", "instacredit",
                                        "jmcastillod", "mggutierrezl", "mncanasg"})


def _codigo(g: pd.DataFrame) -> pd.Series:
    """id_concatenado de cada gestión: acción + resultado sin espacios, en mayúsculas."""
    return (g["codigo_accion"].fillna("").astype(str).str.replace(" ", "")
            + g["codigo_resultado"].fillna("").astype(str).str.replace(" ", "")).str.upper()


def _tipo_dwh(g: pd.DataFrame, cartera: pd.DataFrame) -> pd.Series:
    """Admin / Legal de cada gestión según el tipo de cartera de su crédito el día de la gestión."""
    c = cartera[["credito", "f_reporte", "tipo_cartera"]]
    dia = c.set_index(["credito", "f_reporte"])["tipo_cartera"]
    dia = dia[~dia.index.duplicated(keep="last")]
    ult = c.sort_values("f_reporte").drop_duplicates("credito", keep="last").set_index("credito")["tipo_cartera"]
    llave = pd.MultiIndex.from_arrays([g["credito"], pd.to_datetime(g["fecha_actividad"]).dt.normalize()])
    t = pd.Series(dia.reindex(llave).to_numpy(), index=g.index)
    t = t.fillna(g["credito"].map(ult))
    return t.eq(LEGAL).map({True: LEGAL_DWH, False: ADMIN_DWH})


def marcar(g: pd.DataFrame, codigos: pd.DataFrame, cartera: pd.DataFrame) -> pd.DataFrame:
    """Agrega gestionada, contacto, rpc, promesa según la fila del catálogo de su tipo de cartera.
    El RPC sale siempre de la fila Admin (decisión del 16/11/2026 en services/codigos.py)."""
    g = g.drop(columns=[c for c in MARCAS if c in g]).reset_index(drop=True)
    cod, tipo = _codigo(g), _tipo_dwh(g, cartera)
    cat = codigos.drop_duplicates(["codigo", "tipo_cartera"], keep="last").set_index(["codigo", "tipo_cartera"])
    otro = tipo.map({ADMIN_DWH: LEGAL_DWH, LEGAL_DWH: ADMIN_DWH})
    propio = cat.reindex(pd.MultiIndex.from_arrays([cod, tipo])).reset_index(drop=True)
    alterno = cat.reindex(pd.MultiIndex.from_arrays([cod, otro])).reset_index(drop=True)
    tiene = propio["gestionada"].notna()
    fila = propio.where(tiene, alterno, axis=0)
    out = g.copy()
    for c in MARCAS:
        out[c] = pd.to_numeric(fila[c].to_numpy(), errors="coerce")
        out[c] = out[c].fillna(0).astype(int)
    adm = cat["rpc"].reindex(pd.MultiIndex.from_arrays([cod, pd.Series(ADMIN_DWH, index=g.index)])).to_numpy()
    out["rpc"] = pd.Series(pd.to_numeric(adm, errors="coerce"), index=g.index).fillna(out["rpc"]).astype(int)
    return out


def preparar(g: pd.DataFrame) -> pd.DataFrame:
    """Quita usuarios excluidos, marca PRP y convierte en promesa los códigos de CODIGOS_PROMESA_EXTRA."""
    if g.empty:
        return g
    g = g[~g["usuario"].str.lower().isin(USUARIOS_EXCLUIDOS_GESTION)].reset_index(drop=True)
    codigo = g["codigo_resultado"].astype("string").str.strip().str.upper()
    g["promesa_catalogo"] = g["promesa"].astype(int)
    g["promesa"] = g["promesa"].where(~codigo.isin(CODIGOS_PROMESA_EXTRA).fillna(False), 1).astype(int)
    return g


def _gestion_diaria(g: pd.DataFrame) -> pd.DataFrame:
    g = g.assign(fecha=g["fecha_actividad"].dt.normalize())
    out = g.groupby(["credito", "fecha"], as_index=False).agg(
        gestiones_dia=("fecha_actividad", "size"),
        gestionada_dia=("gestionada", "max"),
        contacto_dia=("contacto", "max"),
        rpc_dia=("rpc", "max"),
        promesa_dia=("promesa", "max"),
    )
    p = g[g["promesa"] == 1].sort_values("fecha_actividad", kind="stable")
    ult = p.groupby(["credito", "fecha"], as_index=False, sort=False)["monto_promesa"].last()
    return out.merge(ult.rename(columns={"monto_promesa": "monto_promesa_dia"}), on=["credito", "fecha"], how="left")


def _acumulados(gd: pd.DataFrame) -> pd.DataFrame:
    a = gd.sort_values(["credito", "fecha"]).copy()
    grp = a.groupby("credito")
    a["gestiones_acum"] = grp["gestiones_dia"].cumsum()
    for c in ("gestionada", "contacto", "rpc", "promesa"):
        a[f"{c}_acum"] = grp[f"{c}_dia"].cummax()
    a["monto_promesa_acum"] = grp["monto_promesa_dia"].ffill().fillna(0.0)
    return a[["credito", "fecha", "gestiones_acum", "gestionada_acum", "contacto_acum", "rpc_acum",
              "promesa_acum", "monto_promesa_acum"]]


def por_credito_dia(cartera: pd.DataFrame, gestiones: pd.DataFrame) -> pd.DataFrame:
    """Para cada fila (credito, f_reporte) de la cartera: gestiones del día y acumulados del mes hasta esa fecha.
    gestiones: ya marcadas y preparadas (marcar + preparar)."""
    base = cartera[["credito", "f_reporte"]].copy()
    if gestiones.empty:
        for c in ["gestiones_dia", "contacto_dia", "rpc_dia", "promesa_dia", "monto_promesa_dia",
                  "gestiones_acum", "gestionada_acum", "contacto_acum", "rpc_acum", "promesa_acum",
                  "monto_promesa_acum"]:
            base[c] = 0
        return base
    gd = _gestion_diaria(gestiones)
    diario = gd.rename(columns={"fecha": "f_reporte"})
    out = base.merge(diario, on=["credito", "f_reporte"], how="left", validate="one_to_one")
    for c in ("gestiones_dia", "gestionada_dia", "contacto_dia", "rpc_dia", "promesa_dia", "monto_promesa_dia"):
        out[c] = out[c].fillna(0)
    acum = _acumulados(gd).sort_values("fecha")
    out = pd.merge_asof(out.sort_values("f_reporte"), acum, left_on="f_reporte", right_on="fecha",
                        by="credito", direction="backward").drop(columns="fecha")
    for c in ("gestiones_acum", "gestionada_acum", "contacto_acum", "rpc_acum", "promesa_acum", "monto_promesa_acum"):
        out[c] = out[c].fillna(0)
    return out.sort_values(["credito", "f_reporte"]).reset_index(drop=True)
