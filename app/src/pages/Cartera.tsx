import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { Dimension, FilaGrupo, PuntoSerie, Stock } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Tabla } from '../components/Bloques'
import type { Data } from 'plotly.js'

// Cartera (modules/cartera.py): stock a la fecha de corte por dimensión y su evolución diaria.
// Pendiente: columnas de flujo del mes (cobertura, RPC, montos prometido y pagado).

const DIMENSIONES: { etiqueta: string; valor: Dimension }[] = [
  { etiqueta: 'Bucket de mora', valor: 'bucket' },
  { etiqueta: 'Supervisor', valor: 'supervisor' },
  { etiqueta: 'Tipo de crédito', valor: 'tipo_credito' },
  { etiqueta: 'Tipo de cartera', valor: 'tipo_cartera' },
]

// Colores por bucket 0..6, del verde al vino (components/theme.py COLOR_BUCKET).
const COLOR_BUCKET = ['#3fa04e', '#8cc43f', '#f2c94c', '#f4a63c', '#ee7d4f', '#d9534a', '#c82a59']
const ORDEN_BUCKET = ['0', '1', '2', '3', '4', '5', '6', 'Legal', 'Sin mora']

interface Fila {
  grupo: string
  cuentas: number
  saldo: number
  cuentas_mora: number
  saldo_mora_90: number
  porcentaje: number | null
  indice: number | null
}

function conIndicadores(filas: FilaGrupo[]): Fila[] {
  const total = filas.reduce((a, f) => a + f.saldo, 0)
  return filas.map((f) => ({
    ...f,
    porcentaje: total ? f.saldo / total : null,
    indice: f.saldo ? f.saldo_mora_90 / f.saldo : null,
  }))
}

export default function Cartera() {
  const { fecha: corte, filtros, cargando } = useDatos()
  const [dim, setDim] = useState<Dimension>('bucket')
  const [top, setTop] = useState(15)
  const [stock, setStock] = useState<Stock | null>(null)
  const [filas, setFilas] = useState<FilaGrupo[] | null>(null)
  const [serie, setSerie] = useState<PuntoSerie[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    Promise.all([
      datos.stock(corte, filtros),
      datos.porDimension(corte, dim, filtros),
      datos.serie(dim, filtros),
    ])
      .then(([s, f, sr]) => {
        if (!vigente) return
        setStock(s)
        setFilas(f)
        setSerie(sr)
        setError(null)
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros, dim])

  const tabla = useMemo(() => {
    if (!filas) return []
    const con = conIndicadores(filas)
    if (dim === 'bucket') {
      return ORDEN_BUCKET.map((g) => con.find((f) => f.grupo === g)).filter((f): f is Fila => Boolean(f))
    }
    return con
  }, [filas, dim])

  const total = useMemo(() => {
    const saldo = tabla.reduce((a, f) => a + f.saldo, 0)
    const cuentas = tabla.reduce((a, f) => a + f.cuentas, 0)
    const mora90 = tabla.reduce((a, f) => a + f.saldo_mora_90, 0)
    return {
      grupo: 'Total',
      cuentas,
      saldo,
      cuentas_mora: tabla.reduce((a, f) => a + f.cuentas_mora, 0),
      saldo_mora_90: mora90,
      porcentaje: saldo ? 1 : null,
      indice: saldo ? mora90 / saldo : null,
    } as Fila
  }, [tabla])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!stock || !filas || !serie || !corte) return <p className="vacio">Cargando el mes…</p>
  if (stock.cuentas === 0) return <Nota tipo="alerta" texto="No hay cuentas activas con los filtros seleccionados." />

  const etiquetaDim = DIMENSIONES.find((d) => d.valor === dim)?.etiqueta ?? ''
  const mostrar = dim === 'bucket' ? tabla : tabla.slice(0, top)
  const grupos = mostrar.map((f) => f.grupo)

  const barras: Data[] = [{
    type: 'bar',
    x: mostrar.map((f) => f.grupo),
    y: mostrar.map((f) => f.saldo),
    name: 'Saldo',
    marker: { color: mostrar.map((f) => (dim === 'bucket' && /^\d$/.test(f.grupo) ? COLOR_BUCKET[Number(f.grupo)] : '#4f5bb8')) },
  }]

  const lineas: Data[] = grupos.map((g) => {
    const z = serie.filter((p) => p.grupo === g)
    const color = dim === 'bucket' && /^\d$/.test(g) ? COLOR_BUCKET[Number(g)] : undefined
    return {
      type: 'scatter',
      mode: 'lines',
      name: g,
      x: z.map((p) => p.f_reporte),
      y: z.map((p) => p.saldo),
      line: { width: 2, color },
      stackgroup: dim === 'bucket' ? 'uno' : undefined,
    } as Data
  })

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Cartera</h1>
      <p className="dc-desc">
        Saldo, cuentas y mora a la fecha de corte por supervisor, tipo de crédito, tipo de cartera (Legal = JUR) o
        bucket.
      </p>
      <FilaKpi>
        <Kpi etiqueta="Saldo de cartera" valor={dinero(stock.saldo)} detalle={`al ${fecha(corte)}`} />
        <Kpi etiqueta="Cuentas activas" valor={entero(stock.cuentas)} />
        <Kpi etiqueta="Cuentas en mora" valor={entero(stock.cuentas_mora)}
          detalle={pct(stock.cuentas ? stock.cuentas_mora / stock.cuentas : null)} tono="malo" />
        <Kpi etiqueta="Índice de mora 90+" valor={pct(stock.indice_mora_90)} detalle={dinero(stock.saldo_mora_90)} tono="malo" />
        <Kpi etiqueta={`Grupos (${etiquetaDim.toLowerCase()})`} valor={entero(tabla.length)} tono="info" />
      </FilaKpi>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Desglose
          <select value={dim} onChange={(e) => setDim(e.target.value as Dimension)} style={{ display: 'block', minWidth: 220 }}>
            {DIMENSIONES.map((d) => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
          </select>
        </label>
        {dim !== 'bucket' && (
          <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            Grupos en el gráfico
            <input type="number" min={5} max={50} step={5} value={top}
              onChange={(e) => setTop(Math.min(50, Math.max(5, Number(e.target.value) || 15)))}
              style={{ display: 'block', width: 110 }} />
          </label>
        )}
      </div>

      <Tabla
        titulo={`Cartera por ${etiquetaDim.toLowerCase()} al ${fecha(corte)}`}
        ayuda="Cuentas, saldo, cuentas en mora e índice: stock de las cuentas activas (saldo > 0) en la fecha. Falta el flujo del mes (cobertura, RPC, montos prometido y pagado) en esta versión."
        cabeceras={[
          { etiqueta: 'Cuentas', formato: (x) => entero(x) },
          { etiqueta: 'Saldo', formato: (x) => dinero(x) },
          { etiqueta: '% del saldo', formato: (x) => pct(x) },
          { etiqueta: 'Cuentas en mora', formato: (x) => entero(x) },
          { etiqueta: 'Índice de mora 90+', formato: (x) => pct(x) },
        ]}
        filas={tabla.map((f) => ({
          etiqueta: f.grupo,
          valores: [f.cuentas, f.saldo, f.porcentaje, f.cuentas_mora, f.indice],
        }))}
        total={{ etiqueta: total.grupo, valores: [total.cuentas, total.saldo, total.porcentaje, total.cuentas_mora, total.indice] }}
      />

      <Grafico
        titulo={`Saldo por ${etiquetaDim.toLowerCase()}${dim === 'bucket' ? '' : ` (mayores ${mostrar.length})`}`}
        data={barras}
        layout={{ barmode: 'group', xaxis: { type: 'category' }, yaxis: { tickprefix: '$', tickformat: ',.0f' } }}
      />
      <Grafico
        titulo={`Saldo diario por ${etiquetaDim.toLowerCase()}`}
        data={lineas}
        layout={{ yaxis: { tickprefix: '$', tickformat: ',.0f' } }}
      />
      <Nota texto="Cartera activa de cada día; los atributos son los del día." />
    </>
  )
}
