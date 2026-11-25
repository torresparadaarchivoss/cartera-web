"""Carga la configuración de Administración (catálogo de usuarios, metas por usuario, asignaciones, parámetros de
comisión y coreografía, asuetos y presupuesto FPD) desde el SQLite del Streamlit a Supabase.

Solo se ejecuta al iniciar o para resincronizar: después, los administradores editan estos datos desde la web.
Los ids de usuario se conservan. Las tablas se vacían y se vuelven a llenar en una sola transacción.

Uso (con SUPABASE_DB_URL definida en el entorno):
    python cargar_administracion.py [--sqlite "C:\\Users\\...\\dashboard_cartera\\data\\metas.sqlite"] [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

ORIGEN_DEFECTO = Path(r"c:\Users\jctorresp\Videos\dashboard_cartera\data\metas.sqlite")

# (tabla Supabase, columnas, consulta SQLite). El orden respeta las llaves foráneas.
TABLAS = [
    ("usuarios", ["id", "tipo", "usuario_norm", "nombre_mostrado", "estado"],
     "select id, tipo, usuario_norm, nombre_mostrado, estado from usuarios"),
    ("metas_usuario", ["usuario_id", "periodo", "indicador", "valor_meta"],
     "select usuario_id, periodo, indicador, valor_meta from metas_usuario"),
    ("asignaciones", ["usuario_id", "periodo", "supervisor", "tramo", "departamento"],
     "select usuario_id, periodo, supervisor, tramo, departamento from asignaciones"),
    ("parametros_comision", ["periodo", "clave", "valor"], "select periodo, clave, valor from parametros_comision"),
    ("parametros_coreografia", ["periodo", "clave", "valor"], "select periodo, clave, valor from parametros_coreografia"),
    ("asuetos", ["fecha", "descripcion"], "select fecha, descripcion from asuetos"),
    ("presupuesto_fpd", ["mes", "valor"], "select mes, valor from presupuesto_fpd"),
]


def _valor(v):
    if v is None:
        return None
    if isinstance(v, float) and v != v:  # NaN
        return None
    return v


def leer(ruta: Path) -> dict[str, list[tuple]]:
    con = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True)
    try:
        datos = {}
        for tabla, _, sql in TABLAS:
            datos[tabla] = [tuple(_valor(v) for v in fila) for fila in con.execute(sql)]
        return datos
    finally:
        con.close()


def cargar(datos: dict[str, list[tuple]]) -> None:
    import psycopg  # solo al escribir

    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        sys.exit("Falta la variable de entorno SUPABASE_DB_URL.")
    with psycopg.connect(url, autocommit=False) as con:
        with con.cursor() as cur:
            for tabla, _, _ in reversed(TABLAS):
                cur.execute(f"delete from public.{tabla}")
            for tabla, columnas, _ in TABLAS:
                filas = datos[tabla]
                if not filas:
                    continue
                with cur.copy(f"copy public.{tabla} ({', '.join(columnas)}) from stdin") as cp:
                    for fila in filas:
                        cp.write_row(fila)
        con.commit()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default=str(ORIGEN_DEFECTO), help="Ruta de metas.sqlite del Streamlit (solo lectura).")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    datos = leer(Path(args.sqlite))
    for tabla, filas in datos.items():
        print(f"{tabla}: {len(filas):,} filas")
    if args.dry_run:
        print("Dry-run: no se escribió nada en Supabase.")
        return
    cargar(datos)
    print("Administración cargada en Supabase.")


if __name__ == "__main__":
    main()
