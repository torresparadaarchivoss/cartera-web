import { useEffect, useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import * as datos from '../lib/datos'
import type { Filtros, PromesasResumen, FilaPromesaTabla, PuntoPromesaDia } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Tabla, Titulo } from './Bloques'

// Sección Promesas de Resumen gerencial (services/promesas.py). Pendiente: filtros propios de la sección
// (supervisor, usuario asignado, Cuentas Top) y monto pagado (CHIRICO).

const ORDEN_FILAS = ['0 (desmejora)', '1', '2', '3', '4', '5', '6', 'Legal', 'Sin referencia']

const MEDIDAS = { 'Monto promesado': 'monto', 'Saldo del crédito': 'saldo' } as const
type Medida = keyof typeof MEDIDAS

interface Props {
  corte: string
  filtros: Filtros
}

export default function Promesas({ corte, filtros }: Props) {
  const [medida, setMedida] = useState<Medida>('Monto promesado')
  const [resumen, setResumen] = useState<PromesasResumen | null>(null)
  const [tabla, setTabla] = useState<FilaPromesaTabla[] | null>(null)
  const [serie, setSerie] = useState<PuntoPromesaDia[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.all([
      datos.promesasResumen(corte, filtros),
      datos.promesasTabla(corte, MEDIDAS[medida], filtros),
      datos.promesasSerie(corte, filtros),
    ])
      .then(([r, t, s]) => {
        if (!vigente) return
        setResumen(r)
        setTabla(t)
        setSerie(s)
        setError(null)
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros, medida])

  const filas = useMemo(() => {
    if (!tabla) return []
    return ORDEN_FILAS.map((f) => tabla.find((x) => x.fila === f)).filter((x): x is FilaPromesaTabla => Boolean(x))
  }, [tabla])

  if (error) return <div className="error-pantalla">No se pudieron cargar las promesas: {error}</div>
  if (!resumen || !tabla || !serie) return <p className="vacio">Cargando promesas…</p>

  const medidaTexto = medida.toLowerCase()
  const tot = (k: keyof FilaPromesaTabla) => filas.reduce((a, f) => a + (f[k] as number), 0)
  const totVig = tot('vigentes')
  const totPromesado = tot('promesado_mes')
  const totVenc = tot('vencidas')

  const kpi = (e: keyof PromesasResumen, etiqueta: string, tono: 'info' | 'neutro' | 'bueno' = 'neutro') => {
    const v = resumen[e]
    return (
      <Kpi etiqueta={etiqueta} valor={dinero(v.monto)}
        detalle={`${entero(v.cuentas)} cuentas · saldo ${dinero(v.saldo)}`} tono={tono} />
    )
  }

  const ventaDia: Data[] = [
    {
      type: 'bar',
      x: serie.map((p) => p.fecha),
      y: serie.map((p) => p.promesas_dia),
      name: 'Promesas del día',
      marker: { color: '#aeb6ec' },
    } as Data,
    {
      type: 'scatter',
      mode: 'lines+markers',
      x: serie.map((p) => p.fecha),
      y: serie.map((p) => (medida === 'Saldo del crédito' ? p.vig_saldo : p.vig_monto)),
      name: `Vigentes (${medidaTexto})`,
      yaxis: 'y2',
      line: { color: '#202050', width: 2.2 },
      marker: { size: 4 },
    } as Data,
  ]

  return (
    <>
      <Titulo texto="Promesas"
        ayuda="En vivo: la foto de cartera del día se toma antes de que empiece la gestión, así que aquí se suman también las promesas registradas durante el día. Vencidas: promesas del mes con fecha de pago anterior al corte. Vigentes: última promesa de cada crédito con fecha de pago desde el corte. Monto pagado: pendiente de esta versión." />
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 8 }}>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Valores en
          <select value={medida} onChange={(e) => setMedida(e.target.value as Medida)} style={{ display: 'block', minWidth: 220 }}>
            {Object.keys(MEDIDAS).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <FilaKpi>
        {kpi('Vigentes', 'Promesas vigentes', 'info')}
        {kpi('Vencidas', 'Promesas vencidas')}
        {kpi('Promesado del mes', 'Promesado del mes')}
        <Kpi etiqueta="Monto pagado" valor="—" detalle="pendiente de pagos" tono="bueno" />
      </FilaKpi>

      <Tabla
        titulo={`Promesas por bucket de inicio · ${medidaTexto} al ${fecha(corte)}`}
        ayuda="Filas: bucket de inicio del mes (mora de referencia del loantape). Del bucket 0 solo las cuentas que hoy están en mora («0 (desmejora)»). % vigentes = vigentes ÷ promesado del mes."
        etiquetaFila="Bucket de inicio"
        cabeceras={[
          { etiqueta: 'Vencidas', formato: (x) => dinero(x) },
          { etiqueta: 'Vigentes', formato: (x) => dinero(x) },
          { etiqueta: '% vigentes', formato: (x) => pct(x) },
        ]}
        filas={filas.map((f) => ({
          etiqueta: f.fila,
          valores: [f.vencidas, f.vigentes, f.promesado_mes ? f.vigentes / f.promesado_mes : null],
        }))}
        total={{ etiqueta: 'Total', valores: [totVenc, totVig, totPromesado ? totVig / totPromesado : null] }}
      />

      <Grafico
        titulo={`Promesas del día y vigentes al cierre · ${medidaTexto}`}
        data={ventaDia}
        layout={{
          barmode: 'group',
          yaxis: { title: { text: 'Promesas' }, rangemode: 'tozero' },
          yaxis2: { overlaying: 'y', side: 'right', tickprefix: '$', tickformat: ',.0f', showgrid: false, rangemode: 'tozero' },
        }}
        alto={340}
      />
      <Nota texto="Barras: promesas registradas cada día. Línea: promesas vigentes al cierre del día. El día en curso no aparece hasta que cierra." />
    </>
  )
}
