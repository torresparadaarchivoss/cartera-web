import { useEffect, useState } from 'react'
import type { Data } from 'plotly.js'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { Bucket0Desmejora, Cohorte, FlujoMes, Stock } from '../lib/datos'
import { dinero, entero, fecha, pct, pp } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Titulo } from '../components/Bloques'
import Promesas from '../components/Promesas'

// Resumen gerencial (modules/resumen.py). Pendiente: filtros propios de Promesas (supervisor, usuario asignado,
// Cuentas Top) y monto pagado dentro de la sección Promesas por filtros propios.
interface Datos {
  hoy: Stock
  ini: Stock
  flujo: FlujoMes
  b0: Bucket0Desmejora
  coh: Cohorte
}

export default function Resumen() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [datosMes, setDatosMes] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mora90, setMora90] = useState<datos.PuntoMora90[] | null>(null)

  useEffect(() => {
    if (!corte || !fechaBase || !filtros) return
    let vigente = true
    setError(null)
    Promise.all([
      datos.stock(corte, filtros),
      datos.stock(fechaBase, filtros),
      datos.flujoMes(corte, filtros),
      datos.bucket0Desmejora(corte, filtros),
      datos.cohorte(corte, filtros),
    ])
      .then(([hoy, ini, flujo, b0, coh]) => {
        if (vigente) setDatosMes({ hoy, ini, flujo, b0, coh })
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, fechaBase, filtros])

  useEffect(() => {
    if (!corte || !fechaBase || !filtros) return
    let vigente = true
    datos.mora90Serie(fechaBase, corte, filtros)
      .then((s) => vigente && setMora90(s))
      .catch(() => vigente && setMora90(null))
    return () => {
      vigente = false
    }
  }, [corte, fechaBase, filtros])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!datosMes || !corte || !fechaBase || !filtros) return <p className="vacio">Cargando el mes…</p>

  const { hoy, ini, flujo, b0, coh } = datosMes
  if (hoy.cuentas === 0) return <Nota tipo="alerta" texto="No hay cuentas activas con los filtros seleccionados." />

  const variacion = ini.saldo ? hoy.saldo / ini.saldo - 1 : null
  const dmora = ini.cuentas ? (hoy.indice_mora_90 ?? 0) - (ini.indice_mora_90 ?? 0) : null

  const n = flujo.cuentas
  const cobertura = n ? flujo.creditos_gestionados / n : null
  const contactabilidad = flujo.creditos_gestionados ? flujo.creditos_contacto / flujo.creditos_gestionados : null
  const tasaRpc = flujo.creditos_gestionados ? flujo.creditos_rpc / flujo.creditos_gestionados : null
  const tasaPromesa = flujo.creditos_rpc ? flujo.creditos_promesa / flujo.creditos_rpc : null

  const mv = (k: string) => coh.movimientos[k] ?? { creditos: 0, saldo: 0, pct_saldo: null }

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
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 520, flex: '1 1 420px' }}>
          <Grafico titulo="Embudo de gestión del mes" data={embudo} alto={320}
            layout={{ margin: { l: 110, r: 16, t: 20, b: 20 } }} />
        </div>
        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          {mora90 && (
            <Grafico titulo="Evolución del índice de mora 90+ en el mes"
              data={[{
                type: 'scatter', mode: 'lines+markers', name: 'Mora 90+',
                x: mora90.map((p) => p.f_reporte),
                y: mora90.map((p) => p.indice_mora_90),
                line: { color: '#06255B', width: 2.2 }, marker: { size: 4, color: '#4B9D45' },
              } as Data]}
              layout={{ yaxis: { tickformat: '.1%', rangemode: 'tozero' }, margin: { l: 60, r: 16, t: 20, b: 40 } }}
              alto={320}
            />
          )}
        </div>
      </div>

      <Promesas corte={corte} filtros={filtros} />

      <Titulo texto="Evolución de mora (cohorte del primer día)"
        ayuda="Cohorte congelada: créditos activos el primer día del mes, con su bucket de inicio (loantape). Mejora, mantiene o desmejora según el bucket a la fecha de corte; saldo y cuentas sobre la base del primer día." />
      <FilaKpi>
        <Kpi etiqueta="Mejora" valor={pct(mv('Mejora').pct_saldo)} detalle={`${entero(mv('Mejora').creditos)} cuentas`} tono="bueno" />
        <Kpi etiqueta="Mantiene" valor={pct(mv('Mantiene').pct_saldo)} detalle={`${entero(mv('Mantiene').creditos)} cuentas`} />
        <Kpi etiqueta="Desmejora" valor={pct(mv('Desmejora').pct_saldo)} detalle={`${entero(mv('Desmejora').creditos)} cuentas`} tono="malo" />
        <Kpi etiqueta="Cuentas en la cohorte" valor={entero(coh.creditos_con_referencia)} detalle={`${entero(coh.creditos_sin_referencia)} sin referencia`} />
      </FilaKpi>
    </>
  )
}
