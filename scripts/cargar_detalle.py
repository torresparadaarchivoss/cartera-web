"""Carga el detalle de gestiones y visitas del mes en Supabase (tablas gestion y visita).

Usa la misma lectura del Streamlit (services/data_store.cargar_mes), así los datos son los mismos que muestra
Cuentas a gestionar. Las tablas gestion y visita no llevan datos personales. Los datos del cliente del loantape van a
cliente_loantape, con acceso solo para administradores generales (RLS). No se cargan coordenadas ni comentarios libres
de visita.

Uso (desde scripts/, con SUPABASE_DB_URL definida en el entorno):
    python cargar_detalle.py --mes 2026-11 [--origen "C:\\Users\\...\\dashboard_cartera"] [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd


GESTION = ["credito", "fecha_actividad", "usuario", "accion", "resultado", "contacto", "rpc", "promesa",
           "monto_promesa", "fecha_promesa", "prp", "promesa_catalogo"]
CLIENTE = ["credito", "ciudad", "nombre_mod", "fecha_renov", "nombre_deudor", "edad", "genero", "salario",
           "ubicacion", "profesion", "dire_trabajo", "saldopagare", "ruta_domicilio", "ruta_trabajo", "f_cierre"]
UBICACION = ["credito", "fecha_visita", "visitador", "resultado", "latitud", "longitud"]
LAT, LON = (13.0, 14.6), (-90.3, -87.5)  # rango válido (services/visitas.py)
VISITA = ["credito", "fecha_visita", "visitador", "accion", "resultado", "causa_no_pago", "parentesco", "num_fotos",
          "kilometros"]


def preparar_gestion(g: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame({
        "credito": g["credito"].astype(str).str.strip(),
        "fecha_actividad": pd.to_datetime(g["fecha_actividad"], errors="coerce"),
        "usuario": g["usuario"].fillna("").astype(str),
        "accion": g["descripcion_accion"].fillna("").astype(str),
        "resultado": g["descripcion_resultado"].fillna("").astype(str),
        "contacto": pd.to_numeric(g["contacto"], errors="coerce").fillna(0).astype(int),
        "rpc": pd.to_numeric(g["rpc"], errors="coerce").fillna(0).astype(int),
        "promesa": pd.to_numeric(g["promesa"], errors="coerce").fillna(0).astype(int),
        "monto_promesa": pd.to_numeric(g["monto_promesa"], errors="coerce").fillna(0.0),
        "fecha_promesa": pd.to_datetime(g["fecha_promesa"], errors="coerce").dt.date,
        "prp": pd.to_numeric(g["prp"], errors="coerce").fillna(0).astype(int),
        "promesa_catalogo": pd.to_numeric(g["promesa_catalogo"], errors="coerce").fillna(0).astype(int),
    })
    return out.dropna(subset=["fecha_actividad"])[GESTION]


def preparar_visita(v: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame({
        "credito": v["credito"].astype(str).str.strip(),
        "fecha_visita": pd.to_datetime(v["fecha_visita"], errors="coerce"),
        "visitador": v["visitador"].fillna("").astype(str),
        "accion": v["accion"].fillna("").astype(str),
        "resultado": v["resultado"].fillna("").astype(str),
        "causa_no_pago": v["causa_no_pago"].fillna("").astype(str),
        "parentesco": v["parentesco"].fillna("").astype(str),
        "num_fotos": pd.to_numeric(v["num_fotos"], errors="coerce").fillna(0).astype(int),
        "kilometros": pd.to_numeric(v["kilometros"], errors="coerce"),
    })
    return out.dropna(subset=["fecha_visita"])[VISITA]


def preparar_ubicacion(v: pd.DataFrame) -> pd.DataFrame:
    """Coordenadas válidas de cada visita (restringidas a administradores)."""
    out = pd.DataFrame({
        "credito": v["credito"].astype(str).str.strip(),
        "fecha_visita": pd.to_datetime(v["fecha_visita"], errors="coerce"),
        "visitador": v["visitador"].fillna("").astype(str),
        "resultado": v["resultado"].fillna("").astype(str),
        "latitud": pd.to_numeric(v["latitud"], errors="coerce"),
        "longitud": pd.to_numeric(v["longitud"], errors="coerce"),
    }).dropna(subset=["fecha_visita", "latitud", "longitud"])
    ok = out["latitud"].between(*LAT) & out["longitud"].between(*LON)
    return out[ok][UBICACION]


def preparar_cliente(lt: pd.DataFrame) -> pd.DataFrame:
    """Datos personales del cierre de loantape: solo para la tabla restringida cliente_loantape."""
    out = lt.assign(credito=lt["credito"].astype(str).str.strip())
    for c in ("fecha_renov", "f_cierre"):
        out[c] = pd.to_datetime(out[c], errors="coerce").dt.date
    for c in ("edad", "salario", "saldopagare"):
        out[c] = pd.to_numeric(out[c], errors="coerce")
    out["edad"] = out["edad"].astype("Int64")
    return out.drop_duplicates("credito", keep="last")[CLIENTE]


def _valor(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT:
        return None
    if hasattr(v, "item"):
        return v.item()
    return v


def usuario_de_nombre(nombre) -> str:
    """Usuario institucional desde el nombre (igual que database_admin/users_repository del Streamlit):
    «Celia Dolores Hidalgo Guzman» -> cdhidalgog."""
    import unicodedata
    base = unicodedata.normalize("NFD", str(nombre or "").lower())
    base = "".join(c for c in base if unicodedata.category(c) != "Mn")
    t = [x for x in base.split() if x.isalpha()]
    if len(t) < 3:
        return ""
    return "".join(x[0] for x in t[:-2]) + t[-2] + t[-1][0]


def usuarios_del_mes(d) -> tuple[set[str], set[str], set[str]]:
    """Agentes (gestiones), visitadores (visitas) y supervisores (cartera) que aparecen en el mes."""
    agentes = {str(u).strip().lower() for u in d.gestiones["usuario"].dropna() if str(u).strip()}
    visitadores = {str(u).strip().upper() for u in d.visitas["visitador"].dropna() if str(u).strip()} if not d.visitas.empty else set()
    supervisores = set(d.cartera["supervisor"].dropna().unique().tolist()) if not d.cartera.empty else set()
    return agentes, visitadores, supervisores


def sincronizar_usuarios(cur, agentes: set[str], visitadores: set[str], supervisores: set[str]) -> dict[str, int]:
    """Alta de usuarios nuevos del mes y rol de los agentes sin rol (reglas del Streamlit, users_repository).
    Nunca cambia usuarios existentes ni roles ya definidos."""
    cur.execute("select id, tipo, usuario_norm, rol from public.usuarios")
    existentes = {(tipo, u): (id_, rol) for id_, tipo, u, rol in cur.fetchall()}
    siguiente = max([v[0] for v in existentes.values()] or [0]) + 1
    altas = {"agente": 0, "visitador": 0}
    for tipo, lista in (("agente", agentes), ("visitador", visitadores)):
        for u in sorted(lista):
            if (tipo, u) in existentes:
                continue
            rol = "visitador" if tipo == "visitador" else "agente"
            cur.execute("insert into public.usuarios (id, tipo, usuario_norm, nombre_mostrado, estado, rol) "
                        "values (%s, %s, %s, %s, 'activo', %s)", (siguiente, tipo, u, u, rol))
            existentes[(tipo, u)] = (siguiente, rol)
            siguiente += 1
            altas[tipo] += 1
    sup = {usuario_de_nombre(s) for s in supervisores} - {""}
    vis = {u.lower() for (tipo, u) in existentes if tipo == "visitador"}
    roles = 0
    for (tipo, u), (id_, rol) in list(existentes.items()):
        if tipo != "agente" or rol:
            continue
        nuevo = "visitador" if u in vis else "supervisor" if u in sup else "agente"
        cur.execute("update public.usuarios set rol = %s where id = %s", (nuevo, id_))
        roles += 1
    return {"altas_agente": altas["agente"], "altas_visitador": altas["visitador"], "roles_asignados": roles}


def cargar(gestion: pd.DataFrame, visita: pd.DataFrame, cliente: pd.DataFrame, ubicacion: pd.DataFrame,
           usuarios: tuple[set[str], set[str], set[str]] | None = None) -> None:
    import psycopg  # solo al escribir: el dry-run no lo necesita

    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        sys.exit("Falta la variable de entorno SUPABASE_DB_URL.")
    with psycopg.connect(url, autocommit=False) as con:
        with con.cursor() as cur:
            cur.execute("delete from public.gestion")
            with cur.copy(f"copy public.gestion ({', '.join(GESTION)}) from stdin") as cp:
                for fila in gestion.itertuples(index=False):
                    cp.write_row([_valor(v) for v in fila])
            cur.execute("delete from public.visita_ubicacion")
            with cur.copy(f"copy public.visita_ubicacion ({', '.join(UBICACION)}) from stdin") as cp:
                for fila in ubicacion.itertuples(index=False):
                    cp.write_row([_valor(v) for v in fila])
            cur.execute("delete from public.cliente_loantape")
            with cur.copy(f"copy public.cliente_loantape ({', '.join(CLIENTE)}) from stdin") as cp:
                for fila in cliente.itertuples(index=False):
                    cp.write_row([_valor(v) for v in fila])
            cur.execute("delete from public.visita")
            with cur.copy(f"copy public.visita ({', '.join(VISITA)}) from stdin") as cp:
                for fila in visita.itertuples(index=False):
                    cp.write_row([_valor(v) for v in fila])
            if usuarios is not None:
                r = sincronizar_usuarios(cur, *usuarios)
                print(f"Usuarios: altas agente {r['altas_agente']}, altas visitador {r['altas_visitador']}, "
                      f"roles asignados {r['roles_asignados']}.")
        con.commit()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mes", required=True, help="AAAA-MM")
    ap.add_argument("--origen", default=r"c:\Users\jctorresp\Videos\dashboard_cartera",
                    help="Carpeta del tablero Streamlit (lectura de SQL Server).")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    anio, mes = (int(x) for x in args.mes.split("-"))

    sys.path.insert(0, args.origen)
    from services.data_store import cargar_mes  # noqa: E402  (lectura del Streamlit, solo lectura)

    d = cargar_mes(anio, mes, usar_cache=False)
    gestion = preparar_gestion(d.gestiones)
    visita = preparar_visita(d.visitas)
    cliente = preparar_cliente(d.loantape)
    ubicacion = preparar_ubicacion(d.visitas)
    print(f"Gestiones: {len(gestion):,} filas (de {len(d.gestiones):,} leídas).")
    print(f"Visitas: {len(visita):,} filas (de {len(d.visitas):,} leídas).")
    print(f"Clientes (datos personales, acceso restringido): {len(cliente):,} filas.")
    print(f"Visitas con coordenadas válidas (acceso restringido): {len(ubicacion):,} filas.")
    agentes, visitadores, supervisores = usuarios_del_mes(d)
    print(f"Usuarios del mes: {len(agentes):,} agentes, {len(visitadores):,} visitadores, {len(supervisores):,} supervisores.")
    if args.dry_run:
        print("Dry-run: no se escribió nada en Supabase.")
        return
    cargar(gestion, visita, cliente, ubicacion, (agentes, visitadores, supervisores))
    print("Detalle cargado en Supabase (gestion y visita del mes).")


if __name__ == "__main__":
    main()
