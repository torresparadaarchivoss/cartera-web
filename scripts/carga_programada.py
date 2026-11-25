"""Carga programada: cartera diaria y detalle del mes en curso, y registro del estado en Supabase (tabla carga_estado).

La corre el Programador de tareas de Windows cada hora, de lunes a viernes, de 8:05 a 18:05 (ver scripts/programar_carga.ps1).
Si un run falla, la app sigue mostrando la fecha del último run que terminó bien (clave ultima_carga_ok); el intento
fallido queda en ultimo_intento.

Requiere la variable de entorno SUPABASE_DB_URL del usuario (no se guarda en el repositorio).
Solo carga cobranza y detalle. Administración y coreografías no: administración se edita en la web, y coreografías
depende de un motor que todavía está cambiando.
"""
from __future__ import annotations

import datetime as dt
import os
import subprocess
import sys
from pathlib import Path

PYTHON_ORIGEN = Path(r"C:\Users\jctorresp\Videos\dashboard_cartera\.venv\Scripts\python.exe")
AQUI = Path(__file__).resolve().parent
BLOQUEO = AQUI / ".carga_en_curso"


def _conectar():
    import psycopg  # noqa: E402

    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        raise RuntimeError("Falta la variable de entorno SUPABASE_DB_URL.")
    return psycopg.connect(url, autocommit=True)


def _registrar(clave: str, estado: str, detalle: str, ahora: dt.datetime) -> None:
    with _conectar() as con:
        con.execute(
            "insert into public.carga_estado (clave, ejecutado_en, estado, detalle) values (%s, %s, %s, %s) "
            "on conflict (clave) do update set ejecutado_en = excluded.ejecutado_en, estado = excluded.estado, "
            "detalle = excluded.detalle",
            (clave, ahora, estado, detalle[:2000]),
        )


def _correr(script: str, *args: str) -> None:
    res = subprocess.run([str(PYTHON_ORIGEN), str(AQUI / script), *args], capture_output=True, text=True,
                         encoding="utf-8", errors="replace", env={**os.environ, "PYTHONUTF8": "1"})
    if res.returncode != 0:
        raise RuntimeError(f"{script} falló:\n{res.stderr[-1500:]}")


def main() -> int:
    if BLOQUEO.exists():
        # Un run anterior sigue activo (o quedó colgado): no se lanza otro encima.
        edad = dt.datetime.now().timestamp() - BLOQUEO.stat().st_mtime
        if edad < 3 * 3600:
            print("Hay una carga en curso; se omite este run.")
            return 0
    BLOQUEO.write_text(str(os.getpid()))
    ahora = dt.datetime.now().astimezone()
    mes = ahora.strftime("%Y-%m")
    try:
        _registrar("ultimo_intento", "en curso", f"Mes {mes}", ahora)
        _correr("cargar_cobranza.py", "--mes", mes)
        _correr("cargar_detalle.py", "--mes", mes)
        fin = dt.datetime.now().astimezone()
        _registrar("ultima_carga_ok", "ok", f"Mes {mes}", fin)
        _registrar("ultimo_intento", "ok", f"Mes {mes}", fin)
        print(f"Carga correcta: {fin:%Y-%m-%d %H:%M}")
        return 0
    except Exception as exc:  # noqa: BLE001 (se registra el error y el run termina con código de fallo)
        fin = dt.datetime.now().astimezone()
        try:
            _registrar("ultimo_intento", "error", str(exc), fin)
        except Exception:  # noqa: BLE001
            pass
        print(f"Carga fallida: {exc}", file=sys.stderr)
        return 1
    finally:
        BLOQUEO.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
