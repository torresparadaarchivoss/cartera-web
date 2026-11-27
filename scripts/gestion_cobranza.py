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
    g = g.assign(fecha=g["fecha_actividad"].dt.normalize().astype("datetime64[ns]"))
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


def promesas_filas(gestiones_mes: pd.DataFrame, gestiones_previas: pd.DataFrame, inicio: pd.Timestamp) -> pd.DataFrame:
    """Una fila por promesa (promesa == 1) del mes y del mes anterior con fecha de pago vigente.
    gestiones_mes / gestiones_previas: ya marcadas y preparadas. del_mes = registrada desde el día 1 del mes."""
    partes = []
    for x, es_mes in ((gestiones_previas, False), (gestiones_mes, True)):
        if x is None or x.empty:
            continue
        p = x[x["promesa"] == 1]
        partes.append(pd.DataFrame({
            "credito": p["credito"].to_numpy(),
            "fecha_gestion": pd.to_datetime(p["fecha_actividad"]).to_numpy(),  # con hora: define la última promesa
            "fecha_promesa": pd.to_datetime(p["fecha_promesa"]).dt.normalize().to_numpy(),
            "monto": p["monto_promesa"].astype(float).to_numpy(),
            "del_mes": (pd.to_datetime(p["fecha_actividad"]) >= inicio).to_numpy() if es_mes
            else [False] * len(p),
        }))
    if not partes:
        return pd.DataFrame(columns=["credito", "fecha_gestion", "fecha_promesa", "monto", "del_mes"])
    out = pd.concat(partes, ignore_index=True)
    return out.sort_values("fecha_gestion", kind="stable").reset_index(drop=True)


SIN_ASIGNAR = frozenset({"", "sin asignar"})
DIA_INICIO_GESTOR = 5  # criterio de gestor de cartera (2026-11-27): fotos desde el día 5
FRACCION_CUENTAS_TOP = 0.60
SIN_MORA = "Sin mora"
SIN_REFERENCIA = "Sin referencia"


def _bucket_txt(dias: pd.Series) -> pd.Series:
    """Bucket de mora como texto (0..6 o «Sin mora»), igual que services/calculations.bucket_mora."""
    d = pd.to_numeric(dias, errors="coerce")
    lim = [0, 30, 60, 90, 120, 150]
    out = pd.Series(len(lim), index=d.index, dtype="int64")
    for i in range(len(lim) - 1, -1, -1):
        out = out.where(~(d <= lim[i]), i)
    return out.where(d.notna()).astype("string").fillna(SIN_MORA)


def marcar_top(cartera: pd.DataFrame) -> pd.Series:
    """Cuentas Top (services/cuentas_top.py): por fecha × bucket, las de mayor saldo que suman el 60 % del saldo."""
    out = pd.Series(False, index=cartera.index)
    if cartera.empty:
        return out
    saldo = pd.to_numeric(cartera["saldo"], errors="coerce").fillna(0.0)
    x = pd.DataFrame({"f": cartera["f_reporte"], "credito": cartera["credito"], "s": saldo,
                      "b": _bucket_txt(cartera["dias_mora"])})[saldo > 0]
    x = x.sort_values(["f", "b", "s", "credito"], ascending=[True, True, False, True], kind="stable")
    grupo = x.groupby(["f", "b"], sort=False)["s"]
    previo = grupo.cumsum() - x["s"]
    out.loc[x.index] = (previo < FRACCION_CUENTAS_TOP * grupo.transform("sum")).to_numpy()
    return out


def ultimo_gestor(cartera: pd.DataFrame) -> pd.Series:
    """Por crédito: el PR_MC_UASIGNADO válido con más fotos desde el día 5 del mes (si el crédito no tiene fotos desde
    el día 5, cuentan todas las del mes). Empate: la foto más reciente. Réplica de services/calculations.ultimo_gestor
    (criterio de 2026-11-27)."""
    if cartera.empty:
        return pd.Series(dtype=str)
    g = cartera["gestor"].fillna("").astype(str)
    c = cartera.loc[~g.str.strip().str.lower().isin(SIN_ASIGNAR), ["credito", "f_reporte", "gestor"]].copy()
    if c.empty:
        return pd.Series(dtype=str)
    c["_f"] = pd.to_datetime(c["f_reporte"]).dt.normalize()
    desde5 = c[c["_f"].dt.day >= DIA_INICIO_GESTOR]
    base = pd.concat([desde5, c[~c["credito"].isin(desde5["credito"])]], ignore_index=True)
    cnt = (base.groupby(["credito", "gestor"])["_f"].agg(["nunique", "max"]).reset_index()
           .sort_values(["credito", "nunique", "max"], kind="stable")
           .groupby("credito", as_index=False).tail(1))
    return cnt.set_index("credito")["gestor"]


def pagos_enriquecidos(pagos: pd.DataFrame, cartera: pd.DataFrame) -> pd.DataFrame:
    """Pagos con los atributos de cartera del día del pago (réplica de calculations.enriquecer_pagos).
    Si ese día no hay registro del crédito, se toma el anterior más cercano y, si no hay, el siguiente."""
    cols = ["supervisor", "tipo_credito", "tipo_legal", "tipo_cartera", "gestor", "top", "bucket_actual",
            "bucket_inicial"]
    p = pagos.assign(fecha=pd.to_datetime(pagos["fecha"]).dt.normalize().astype("datetime64[ns]")).copy()
    c = cartera.assign(fecha=pd.to_datetime(cartera["f_reporte"]).dt.normalize().astype("datetime64[ns]"))
    c = c[["credito", "fecha"] + cols].sort_values(["fecha"], kind="stable")
    out = p.merge(c, on=["credito", "fecha"], how="left", validate="many_to_one")
    falta = out["supervisor"].isna()
    if falta.any():
        x = out.loc[falta, ["credito", "fecha"]].reset_index().sort_values("fecha")
        for direccion in ("backward", "forward"):
            m = pd.merge_asof(x, c.assign(_hay=True), on="fecha", by="credito", direction=direccion).set_index("index")
            m = m[m["_hay"].eq(True) & out.loc[m.index, "supervisor"].isna()]
            out.loc[m.index, cols] = m[cols].to_numpy()
    for col in ("supervisor", "tipo_credito", "tipo_legal", "tipo_cartera", "gestor"):
        out[col] = out[col].fillna("").astype(str)
    out["top"] = out["top"].fillna(False).astype(bool)
    # Buckets del día del pago (0..6 o «Sin mora») y bucket inicial (0..6 o «Sin referencia»), como en Recuperación.
    out["bucket_pago"] = out["bucket_actual"].astype("string").fillna(SIN_MORA).astype(str)
    out["bucket_inicial"] = out["bucket_inicial"].astype("string").fillna(SIN_REFERENCIA).astype(str)
    return out.reset_index(drop=True)


def pagos_acumulados(pagos: pd.DataFrame, cartera: pd.DataFrame) -> pd.DataFrame:
    """Por fila de cartera (credito, f_reporte): monto pagado ese día y acumulado del mes hasta esa fecha."""
    base = cartera[["credito", "f_reporte"]].assign(f_reporte=lambda d: pd.to_datetime(d["f_reporte"]).astype("datetime64[ns]"))
    if pagos.empty:
        return base.assign(monto_pagado_dia=0.0, monto_pagado_acum=0.0)
    dia = pagos.groupby(["credito", "fecha"], as_index=False)["pago"].sum().rename(columns={"pago": "monto_pagado_dia"})
    dia = dia.assign(fecha=dia["fecha"].astype("datetime64[ns]")).sort_values(["credito", "fecha"])
    dia["monto_pagado_acum"] = dia.groupby("credito")["monto_pagado_dia"].cumsum()
    out = base.merge(dia[["credito", "fecha", "monto_pagado_dia"]].rename(columns={"fecha": "f_reporte"}),
                     on=["credito", "f_reporte"], how="left")
    out["monto_pagado_dia"] = out["monto_pagado_dia"].fillna(0.0)
    out = pd.merge_asof(out.sort_values("f_reporte"), dia[["credito", "fecha", "monto_pagado_acum"]].sort_values("fecha"),
                        left_on="f_reporte", right_on="fecha", by="credito", direction="backward").drop(columns="fecha")
    out["monto_pagado_acum"] = out["monto_pagado_acum"].fillna(0.0)
    return out.sort_values(["credito", "f_reporte"]).reset_index(drop=True)


ESTADOS = ("Vencidas", "Vigentes", "Promesado del mes", "Del día")


def estado_diario(cartera: pd.DataFrame, promesas: pd.DataFrame) -> pd.DataFrame:
    """Estado de promesas de cada día del mes (réplica de services/promesas.py detalle(), día por día).
    Una fila por (día, crédito, estado), con los atributos y el saldo de la foto de ese día (o la última anterior).
    cartera: una fila por crédito y día, con f_reporte, saldo, dias_mora (o bucket_actual), tipo_cartera,
    supervisor, tipo_credito, tipo_legal y bucket_inicial. promesas: salida de promesas_filas."""
    cart = cartera.assign(f_reporte=pd.to_datetime(cartera["f_reporte"]))
    cart = cart.sort_values(["credito", "f_reporte"], kind="stable")
    dias = sorted(cart["f_reporte"].unique())
    partes = []
    for t in dias:
        t = pd.Timestamp(t)
        # Atributos: última fila de cada crédito hasta el día t (como _cuentas en services/promesas.py).
        c = cart[cart["f_reporte"] <= t].drop_duplicates("credito", keep="last").copy()
        en_corte = c["f_reporte"].eq(t).to_numpy()
        saldo = c["saldo"].astype(float).where(en_corte, 0.0).clip(lower=0.0).to_numpy()
        bucket_hoy = pd.to_numeric(c["bucket_actual"], errors="coerce").where(en_corte & (saldo > 0)).to_numpy()
        ini = pd.to_numeric(c["bucket_inicial"], errors="coerce").to_numpy()
        legal = c["tipo_cartera"].eq("Legal").to_numpy()
        fila = np.where(legal, "Legal",
                np.where(pd.isna(ini), "Sin referencia",
                np.where(ini == 0, np.where(np.nan_to_num(bucket_hoy, nan=0) >= 1, "0 (desmejora)", "0 (al día)"),
                         pd.Series(ini).astype("Int64").astype(str).to_numpy())))
        gestor = c["gestor_mes"].where(c["gestor_mes"].notna(), c["gestor"]).fillna("").astype(str)
        top = c["top"].fillna(False).astype(bool).to_numpy() & en_corte  # como _cuentas: Top solo en la foto del día
        base = pd.DataFrame({"credito": c["credito"].to_numpy(), "en_corte": en_corte, "saldo_corte": saldo,
                             "supervisor": c["supervisor"].to_numpy(), "tipo_credito": c["tipo_credito"].to_numpy(),
                             "tipo_legal": c["tipo_legal"].to_numpy(), "tipo_cartera": c["tipo_cartera"].to_numpy(),
                             "fila": fila, "gestor": gestor.to_numpy(), "top": top})
        g = promesas[promesas["fecha_gestion"].dt.normalize() <= t] if not promesas.empty else promesas
        if g.empty:
            continue
        ult = g.drop_duplicates("credito", keep="last")
        ult_mes = g[g["del_mes"]].drop_duplicates("credito", keep="last")
        def agg(x):
            return x.groupby("credito", as_index=False).agg(monto=("monto", "sum"), n_promesas=("monto", "size"))
        por_estado = {
            "Vencidas": agg(g[g["del_mes"] & (g["fecha_promesa"] < t)]),
            "Vigentes": agg(ult[ult["fecha_promesa"] >= t]),
            "Promesado del mes": agg(ult_mes),
            "Del día": agg(g[g["fecha_gestion"].dt.normalize() == t]),
        }
        for estado, x in por_estado.items():
            if x.empty:
                continue
            m = x.merge(base, on="credito", how="inner")
            if estado == "Vigentes":
                m = m[m["en_corte"]]  # como PR_MC_DTEPP: solo créditos en la foto del día
            if m.empty:
                continue
            m = m.assign(f_reporte=t, estado=estado)
            partes.append(m)
    cols = ["f_reporte", "credito", "estado", "monto", "n_promesas", "saldo_corte", "supervisor", "tipo_credito",
            "tipo_legal", "tipo_cartera", "fila", "gestor", "top"]
    if not partes:
        return pd.DataFrame(columns=cols)
    return pd.concat(partes, ignore_index=True)[cols]


def por_credito_dia(cartera: pd.DataFrame, gestiones: pd.DataFrame) -> pd.DataFrame:
    """Para cada fila (credito, f_reporte) de la cartera: gestiones del día y acumulados del mes hasta esa fecha.
    gestiones: ya marcadas y preparadas (marcar + preparar)."""
    base = cartera[["credito", "f_reporte"]].copy()
    base["f_reporte"] = pd.to_datetime(base["f_reporte"]).dt.normalize().astype("datetime64[ns]")
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


def estado_cuenta(cartera: pd.DataFrame) -> dict:
    """Réplica de services/calculations (estado de cobranza, rango de intentos y prioridad acumulados del mes)."""
    n = cartera["gestiones_acum"].fillna(0)
    contacto = cartera["contacto_acum"].fillna(0)
    promesa = cartera["promesa_acum"].fillna(0)
    rpc = cartera["rpc_acum"].fillna(0)
    estado = np.select(
        [n == 0, contacto == 0, (contacto == 1) & (promesa == 0), promesa == 1],
        ["Sin Gestión", "Gestión Sin Contacto", "Contacto Sin Promesa", "Con Promesa"], default="Otro")
    rango = np.select(
        [n == 0, n <= 10, n <= 20, n <= 30],
        ["0. Sin Gestión", "A. Hasta 10 Intentos", "B. Hasta 20 Intentos", "C. Hasta 30 Intentos"],
        default="D. Más de 30 Intentos")
    mora = pd.to_numeric(cartera["dias_mora"], errors="coerce")
    critico = (mora > 90).fillna(False).to_numpy()
    b_ini = cartera["bucket_inicial"].astype("Float64")
    b_act = cartera["bucket_actual"].astype("Float64")
    riesgo = (b_act > b_ini).fillna(False).to_numpy()
    prioridad = np.select(
        [critico & (n == 0).to_numpy(), critico & (rpc == 0).to_numpy(), (promesa == 1).to_numpy(), riesgo],
        ["Critico Sin Gestion", "Critico Sin Contacto", "Seguimiento Promesa", "Riesgo"], default="Normal")
    return {"estado_cobranza_acum": estado, "rango_intentos_acumulado": rango, "prioridad_acumulada": prioridad}
