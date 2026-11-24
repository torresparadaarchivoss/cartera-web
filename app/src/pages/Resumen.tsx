import { useEffect, useState } from 'react'
import type { Data } from 'plotly.js'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { Bucket0Desmejora, FlujoMes, Stock } from '../lib/datos'
import { dinero, entero, fecha, pct, pp } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Titulo } from '../components/Bloques'
import Promesas from '../components/Promesas'

// Resumen gerencial (modules/resumen.py). Pendiente: promesas en vivo, bucket 0 que desmejoran y evolución
// de mora de la cohorte.
export default function Resumen() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [hoy, setHoy] = useState<Stock | null>(null)
  const [ini, setIni] = useState<Stock | null>(null)
  const [flujo, setFlujo] = useState<FlujoMes | null>(null)
  const [b0, setB0] = useState<Bucket0Desmejora | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corte || !fechaBase || !filtros) return
    let vigente = true
    Promise.all([
      datos.stock(corte, filtros),
      datos.stock(fechaBase, filtros),
      datos.flujoMes(corte, filtros),
      datos.bucket0Desmejora(corte, filtros),
    ])
      .then(([h, i, f, b]) => {
        if (!vigente) return
        setHoy(h)
        setIni(i)
        setFlujo(f)
        setB0(b)
        setError(null)
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, fechaBase, filtros])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!hoy || !ini || !flujo || !b0 || !corte || !fechaBase) return <p className="vacio">Cargando el mes…</p>
  if (hoy.cuentas === 0) return <Nota tipo="alerta" texto="No hay cuentas activas con los filtros seleccionados." />

  const variacion = ini.saldo ? hoy.saldo / ini.saldo - 1 : null
  const dmora = ini.cuentas ? (hoy.indice_mora_90 ?? 0) - (ini.indice_mora_90 ?? 0) : null

  const n = flujo.cuentas
  const cobertura = n ? flujo.creditos_gestionados / n : null
  const contactabilidad = flujo.creditos_gestionados ? flujo.creditos_contacto / flujo.creditos_gestionados : null
  const tasaRpc = flujo.creditos_gestionados ? flujo.creditos_rpc / flujo.creditos_gestionados : null
  const tasaPromesa = flujo.creditos_rpc ? flujo.creditos_promesa / flujo.creditos_rpc : null

  const embudo: Data[] = [{
    type: 'funnel',
    y: ['Cuentas del mes', 'Gestionadas', 'Con contacto', 'Con RPC', 'Con promesa'],
    x: [n, flujo.creditos_gestionados, flujo.creditos_contacto, flujo.creditos_rpc, flujo.creditos_promesa],
    textinfo: 'value+percent initial',
    marker: { color: ['#202050', '#4f5bb8', '#aeb6ec', '#f4a63c', '#3fa04e'] },
  } as Data]

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

      <Titulo texto="Gestión del mes-Bucket 0 en adelante"
        ayuda={`Cuentas del mes: activas en la fecha más las ${entero(flujo.canceladas)} canceladas en el mes (tuvieron saldo y hoy ya no), sin las que están al día (bucket 0 en la fecha).`} />
      <FilaKpi>
        <Kpi etiqueta="Cobertura de gestión" valor={pct(cobertura)} detalle={`${entero(flujo.creditos_gestionados)} cuentas`} tono="info" />
        <Kpi etiqueta="Contactabilidad" valor={pct(contactabilidad)} detalle={`${entero(flujo.creditos_contacto)} con contacto`} />
        <Kpi etiqueta="RPC" valor={pct(tasaRpc)} detalle={`${entero(flujo.creditos_rpc)} cuentas`} />
        <Kpi etiqueta="Promesas" valor={entero(flujo.creditos_promesa)} detalle={`${pct(tasaPromesa)} de las RPC`} tono="bueno" />
        <Kpi etiqueta="Bucket 0 que desmejoran sin gestión" valor={entero(b0.sin_gestion)}
          detalle={`de ${entero(b0.desmejoran)} que pasaron a mora`} tono="malo" />
      </FilaKpi>
      <Grafico titulo="Embudo de gestión del mes" data={embudo} alto={320}
        layout={{ margin: { l: 110, r: 16, t: 20, b: 20 } }} />
      <Promesas corte={corte} filtros={filtros} />
      <Nota tipo="alerta" texto="Pendiente de esta versión: evolución de mora de la cohorte y monto pagado." />
    </>
  )
}
