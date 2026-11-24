import { useEffect, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { Stock } from '../lib/datos'
import { dinero, entero, fecha, pct, pp } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Titulo } from '../components/Bloques'

// Sección de stock del Resumen gerencial (modules/resumen.py). Pendiente: flujo del mes,
// promesas en vivo y evolución de mora de la cohorte.
export default function Resumen() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [hoy, setHoy] = useState<Stock | null>(null)
  const [ini, setIni] = useState<Stock | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corte || !fechaBase || !filtros) return
    let vigente = true
    Promise.all([datos.stock(corte, filtros), datos.stock(fechaBase, filtros)])
      .then(([h, i]) => {
        if (!vigente) return
        setHoy(h)
        setIni(i)
        setError(null)
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, fechaBase, filtros])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!hoy || !ini || !corte || !fechaBase) return <p className="vacio">Cargando el mes…</p>
  if (hoy.cuentas === 0) return <Nota tipo="alerta" texto="No hay cuentas activas con los filtros seleccionados." />

  const variacion = ini.saldo ? hoy.saldo / ini.saldo - 1 : null
  const dmora = ini.cuentas ? (hoy.indice_mora_90 ?? 0) - (ini.indice_mora_90 ?? 0) : null

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Resumen gerencial</h1>
      <p className="dc-desc">
        Foto de la cartera a la fecha de corte, gestión acumulada del mes, promesas en vivo y migración de mora de la
        cohorte del primer día.
      </p>
      <Nota texto={`Stock al ${fecha(corte)} (cuentas con saldo > 0). Flujo acumulado del ${fecha(fechaBase)} al ${fecha(corte)} de esas mismas cuentas.`} />
      <Titulo texto="Cartera" />
      <FilaKpi>
        <Kpi etiqueta="Saldo de cartera" valor={dinero(hoy.saldo)}
          detalle={variacion !== null ? `${pct(variacion)} vs ${fecha(fechaBase)}` : undefined} />
        <Kpi etiqueta="Cuentas activas" valor={entero(hoy.cuentas)} detalle={`${entero(ini.cuentas)} al ${fecha(fechaBase)}`} />
        <Kpi etiqueta="Índice de mora 90+" valor={pct(hoy.indice_mora_90)}
          detalle={dmora !== null ? `${pp(dmora)} vs inicio` : undefined}
          tono={(dmora ?? 0) > 0 ? 'malo' : 'bueno'} />
      </FilaKpi>
      <Nota tipo="alerta" texto="Pendiente de esta versión: gestión del mes, promesas, embudo y evolución de mora de la cohorte." />
    </>
  )
}
