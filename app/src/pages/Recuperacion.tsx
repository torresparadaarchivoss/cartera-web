import { useEffect, useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { BucketRecuperacion, FilaRecuperacion, MetasRecuperacion, PagoDia } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Titulo, TONOS, type Tono } from '../components/Bloques'

// Recuperación (modules/recuperacion.py, tabla por bucket y pagos del mes). Pendiente: recaudo legal por canal y agente.

const BUCKETS: { etiqueta: string; valor: BucketRecuperacion }[] = [
  { etiqueta: 'Del día del pago', valor: 'bucket_pago' },
  { etiqueta: 'Inicial del mes', valor: 'bucket_inicial' },
]

// Filas en el orden del Streamlit: buckets 0-6, Legal, Sin mora y Sin referencia.
const ORDEN = ['0', '1', '2', '3', '4', '5', '6', 'Legal', 'Sin mora', 'Sin referencia']

// Pesos por día (lunes a domingo) y semáforo: valores por defecto de config.py (APP.ENV no se lee desde la web).
// Si el APP.ENV del Streamlit trae otros valores, hay que ajustarlos aquí.
const PESOS_DIAS = [1, 1, 1, 1, 1, 0.5, 0]
const UMBRAL_VERDE = 1.0
const UMBRAL_AMARILLO = 0.8

// Fracción del mes laborable transcurrida a la fecha (services/targets_engine.factor_prorrateo).
function factorProrrateo(inicio: string, corte: string): number {
  const [a, m] = inicio.split('-').map(Number)
  const diasEnMes = new Date(a, m, 0).getDate()
  let total = 0
  let hasta = 0
  for (let d = 1; d <= diasEnMes; d++) {
    const f = new Date(a, m - 1, d)
    const peso = PESOS_DIAS[(f.getDay() + 6) % 7] // getDay: domingo=0; los pesos empiezan en lunes
    total += peso
    const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (iso <= corte) hasta += peso
  }
  return total ? hasta / total : 1
}

function semaforo(c: number | null): Tono {
  if (c === null) return 'neutro'
  if (c >= UMBRAL_VERDE) return 'bueno'
  if (c >= UMBRAL_AMARILLO) return 'alerta'
  return 'malo'
}

interface Fila {
  fila: string
  pagado: number
  metaFecha: number | null
  cumplFecha: number | null
  metaMes: number | null
  cumplMes: number | null
  creditos: number
  pagos: number
  pctTotal: number | null
  promedio: number | null
}

function construirFilas(rows: FilaRecuperacion[], meta: MetasRecuperacion, factor: number) {
  const total = rows.find((r) => r.fila === 'Total')
  const totalPagado = total?.pagado ?? 0
  const metas: Record<string, number> = { ...meta.metaBucket }
  if (meta.metaLegal !== null) metas.Legal = meta.metaLegal
  const porFila = new Map(rows.map((r) => [r.fila, r]))
  const claves = ORDEN.filter((k) => porFila.has(k) || k in metas)

  const filas: Fila[] = claves.map((k) => {
    const r = porFila.get(k)
    const pagado = r?.pagado ?? 0
    const creditos = r?.creditos ?? 0
    const mm = metas[k] ?? null
    const mf = mm !== null ? mm * factor : null
    return {
      fila: k,
      pagado,
      metaFecha: mf,
      cumplFecha: mf ? pagado / mf : null,
      metaMes: mm,
      cumplMes: mm ? pagado / mm : null,
      creditos,
      pagos: r?.pagos ?? 0,
      pctTotal: totalPagado ? pagado / totalPagado : null,
      promedio: creditos ? pagado / creditos : null,
    }
  })

  // Fila Total: créditos y pagos únicos del periodo; cumplimiento = pagado de las filas con meta ÷ suma de sus metas.
  const conFecha = filas.filter((f) => f.metaFecha !== null)
  const conMes = filas.filter((f) => f.metaMes !== null)
  const sumaFecha = conFecha.reduce((a, f) => a + (f.metaFecha ?? 0), 0)
  const sumaMes = conMes.reduce((a, f) => a + (f.metaMes ?? 0), 0)
  const creditosTot = total?.creditos ?? 0
  const pagosTot = total?.pagos ?? 0
  const tot: Fila = {
    fila: 'Total',
    pagado: totalPagado,
    metaFecha: conFecha.length ? sumaFecha : null,
    cumplFecha: sumaFecha ? conFecha.reduce((a, f) => a + f.pagado, 0) / sumaFecha : null,
    metaMes: conMes.length ? sumaMes : null,
    cumplMes: sumaMes ? conMes.reduce((a, f) => a + f.pagado, 0) / sumaMes : null,
    creditos: creditosTot,
    pagos: pagosTot,
    pctTotal: totalPagado ? 1 : null,
    promedio: creditosTot ? totalPagado / creditosTot : null,
  }
  return { filas, tot }
}

export default function Recuperacion() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [bucket, setBucket] = useState<BucketRecuperacion>('bucket_pago')
  const [rows, setRows] = useState<FilaRecuperacion[] | null>(null)
  const [dias, setDias] = useState<PagoDia[]>([])
  const [meta, setMeta] = useState<MetasRecuperacion | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corte || !fechaBase || !filtros) return
    let vigente = true
    setError(null)
    Promise.all([
      datos.recuperacionPorBucket(corte, bucket, filtros),
      datos.recuperacionPagosDia(corte, filtros),
      datos.metasRecuperacion(corte.slice(0, 7)),
    ])
      .then(([r, d, m]) => {
        if (!vigente) return
        setRows(r)
        setDias(d)
        setMeta(m)
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, fechaBase, filtros, bucket])

  const factor = useMemo(() => (fechaBase && corte ? factorProrrateo(fechaBase, corte) : 1), [fechaBase, corte])
  const vista = useMemo(() => (rows && meta ? construirFilas(rows, meta, factor) : null), [rows, meta, factor])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!vista || !corte || !fechaBase || !filtros) return <p className="vacio">Cargando el mes…</p>

  const { filas, tot } = vista
  if (tot.pagado === 0 && filas.every((f) => f.metaMes === null)) {
    return <Nota tipo="alerta" texto="No hay pagos con los filtros seleccionados." />
  }

  const legal = filas.find((f) => f.fila === 'Legal')?.pagado ?? 0
  const admin = tot.pagado - legal
  const cumpl = tot.cumplFecha
  const tonoCumpl = semaforo(cumpl)
  const metaFechaTot = tot.metaFecha

  const grafico = filas.filter((f) => f.fila !== 'Total')
  const dataBarras: Data[] = [{
    type: 'bar', x: grafico.map((f) => f.fila), y: grafico.map((f) => f.pagado), name: 'Pagado',
    marker: { color: grafico.map((f) => (f.fila === 'Legal' ? TONOS.info : '#3f4da8')) },
  } as Data]
  const dataDias: Data[] = [
    { type: 'bar', x: dias.map((d) => d.fecha), y: dias.map((d) => d.pagado_dia), name: 'Pagado en el día',
      marker: { color: '#4f5bb8' } } as Data,
    { type: 'scatter', mode: 'lines', x: dias.map((d) => d.fecha), y: dias.map((d) => d.pagado_acum),
      name: 'Pagado acumulado', yaxis: 'y2', line: { color: '#3fa04e', width: 2.4 } } as Data,
  ]

  const columnas: { etiqueta: string; clave: keyof Fila; formato: (x: number | null) => string; semaforo?: boolean }[] = [
    { etiqueta: 'Pagado', clave: 'pagado', formato: (x) => dinero(x) },
    { etiqueta: 'Meta a la fecha', clave: 'metaFecha', formato: (x) => dinero(x) },
    { etiqueta: 'Cumpl. a la fecha', clave: 'cumplFecha', formato: (x) => pct(x), semaforo: true },
    { etiqueta: 'Meta del mes', clave: 'metaMes', formato: (x) => dinero(x) },
    { etiqueta: 'Cumpl. del mes', clave: 'cumplMes', formato: (x) => pct(x), semaforo: true },
    { etiqueta: 'Créditos', clave: 'creditos', formato: (x) => entero(x) },
    { etiqueta: 'Pagos', clave: 'pagos', formato: (x) => entero(x) },
    { etiqueta: '% del total', clave: 'pctTotal', formato: (x) => pct(x) },
    { etiqueta: 'Prom. por crédito', clave: 'promedio', formato: (x) => dinero(x) },
  ]

  const celda = (f: Fila, c: (typeof columnas)[number]) => {
    const v = f[c.clave] as number | null
    const color = c.semaforo && v !== null ? TONOS[semaforo(v)] : undefined
    return <td key={c.etiqueta} style={color ? { color, fontWeight: 600 } : undefined}>{c.formato(v)}</td>
  }

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Recuperación</h1>
      <p className="dc-desc">
        Pagos de clientes registrados en CHIRICO del primer día del mes a la fecha de seguimiento, por bucket de mora y
        tipo de cartera del crédito. No se asocia a gestiones.
      </p>
      <Nota texto={`Pagos del ${fecha(fechaBase)} al ${fecha(corte)}. Meta prorrateada a la fecha: ${pct(factor)} del mes.`} />

      <FilaKpi>
        <Kpi etiqueta="Monto pagado" valor={dinero(tot.pagado)} detalle={`${entero(tot.pagos)} pagos`} tono="bueno" />
        <Kpi etiqueta="Cumplimiento de meta" valor={pct(cumpl)}
          detalle={metaFechaTot !== null ? `meta a la fecha ${dinero(metaFechaTot)}` : 'sin meta'} tono={tonoCumpl} />
        <Kpi etiqueta="Créditos con pago" valor={entero(tot.creditos)} tono="info" />
        <Kpi etiqueta="Cartera administrativa" valor={dinero(admin)}
          detalle={tot.pagado ? `${pct(admin / tot.pagado)} del pagado` : undefined} />
        <Kpi etiqueta="Cartera legal" valor={dinero(legal)}
          detalle={tot.pagado ? `${pct(legal / tot.pagado)} del pagado` : undefined} />
        <Kpi etiqueta="Pago promedio por crédito" valor={dinero(tot.promedio)} />
      </FilaKpi>

      <Titulo texto="Pagos y meta por bucket de mora" />
      <div className="dc-tarjeta">
        <div style={{ marginBottom: 8 }}>
          <label>
            Bucket de mora{' '}
            <select value={bucket} onChange={(e) => setBucket(e.target.value as BucketRecuperacion)}>
              {BUCKETS.map((b) => <option key={b.valor} value={b.valor}>{b.etiqueta}</option>)}
            </select>
          </label>
        </div>
        <table className="dc-tabla">
          <thead>
            <tr>
              <th>Bucket</th>
              {columnas.map((c) => <th key={c.etiqueta}>{c.etiqueta}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.fila}>
                <td>{f.fila}</td>
                {columnas.map((c) => celda(f, c))}
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              {columnas.map((c) => celda(tot, c))}
            </tr>
          </tbody>
        </table>
        <p className="dc-nota-pie" style={{ fontSize: 12, marginTop: 8 }}>
          Bucket {BUCKETS.find((b) => b.valor === bucket)?.etiqueta.toLowerCase()}. Cumpl. a la fecha = pagado ÷ meta
          prorrateada. Cumpl. del mes = pagado ÷ meta del mes completo. Un crédito con pagos en buckets distintos cuenta en
          cada uno. La fila «Legal» junta todos los pagos de la cartera legal (JUR el día del pago), en cualquier bucket,
          contra la meta de Recaudo legal.
        </p>
      </div>

      <Grafico titulo="Monto pagado por bucket" alto={320} data={dataBarras}
        layout={{ yaxis: { tickprefix: '$', tickformat: ',.0f' }, xaxis: { type: 'category' }, showlegend: false }} />

      <Grafico titulo="Pagos del mes" alto={300} data={dataDias}
        layout={{
          yaxis: { tickprefix: '$', tickformat: ',.0f' },
          yaxis2: { overlaying: 'y', side: 'right', tickprefix: '$', tickformat: ',.0f', showgrid: false, rangemode: 'tozero' },
        }} />
    </>
  )
}
