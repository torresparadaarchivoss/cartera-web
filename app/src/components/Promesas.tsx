import { useEffect, useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import * as datos from '../lib/datos'
import type { Filtros, FiltrosSeccion, PromesasResumen, FilaPromesaTabla, PuntoPromesaDia } from '../lib/datos'
import { useDatos } from '../lib/contexto'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Tabla, Titulo } from './Bloques'

// Sección Promesas de Resumen gerencial (services/promesas.py): filtros propios (supervisor, usuario asignado y
// Cuentas Top) que se suman a los globales.

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

  // Cada consulta va por separado: si la tendencia tarda demasiado, tarjetas y tabla siguen visibles.
  const [errorSerie, setErrorSerie] = useState<string | null>(null)
  const [pagado, setPagado] = useState<number | null>(null)
  const [sec, setSec] = useState<FiltrosSeccion>({ supervisor: [], gestor: [], top: 'Todas' })
  const [gestores, setGestores] = useState<string[]>([])
  const { opciones } = useDatos()

  useEffect(() => {
    datos.promesaGestores().then(setGestores).catch(() => undefined)
  }, [])

  useEffect(() => {
    let vigente = true
    datos.promesasResumen(corte, filtros, sec)
      .then((r) => vigente && setResumen(r))
      .catch((e: Error) => vigente && setError(e.message))
    datos.pagadoPeriodo(corte, filtros, sec)
      .then((p) => vigente && setPagado(p))
      .catch((e: Error) => vigente && setError(e.message))
    datos.promesasTabla(corte, MEDIDAS[medida], filtros, sec)
      .then((t) => vigente && setTabla(t))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros, medida, sec])

  useEffect(() => {
    let vigente = true
    setErrorSerie(null)
    datos.promesasSerie(corte, filtros, sec)
      .then((s) => vigente && setSerie(s))
      .catch((e: Error) => vigente && setErrorSerie(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros, sec])

  const filas = useMemo(() => {
    if (!tabla) return []
    return ORDEN_FILAS.map((f) => tabla.find((x) => x.fila === f)).filter((x): x is FilaPromesaTabla => Boolean(x))
  }, [tabla])

  const cargando = !resumen || !tabla

  const medidaTexto = medida.toLowerCase()
  const tot = (k: keyof FilaPromesaTabla) => filas.reduce((a, f) => a + (f[k] as number), 0)
  const totVig = tot('vigentes')
  const totPromesado = tot('promesado_mes')
  const totVenc = tot('vencidas')

  const kpi = (e: keyof PromesasResumen, etiqueta: string, tono: 'info' | 'neutro' | 'bueno' = 'neutro') => {
    if (!resumen) return null
    const v = resumen[e]
    return (
      <Kpi etiqueta={etiqueta} valor={dinero(v.monto)}
        detalle={`${entero(v.cuentas)} cuentas · saldo ${dinero(v.saldo)}`} tono={tono} />
    )
  }

  const ventaDia: Data[] = [
    {
      type: 'bar',
      x: (serie ?? []).map((p) => p.fecha),
      y: (serie ?? []).map((p) => p.promesas_dia),
      name: 'Promesas del día',
      marker: { color: '#aeb6ec' },
    } as Data,
    {
      type: 'scatter',
      mode: 'lines+markers',
      x: (serie ?? []).map((p) => p.fecha),
      y: (serie ?? []).map((p) => (medida === 'Saldo del crédito' ? p.vig_saldo : p.vig_monto)),
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Supervisor (sección)
          <select multiple value={sec.supervisor} style={{ display: 'block', minWidth: 200, minHeight: 80 }}
            onChange={(e) => setSec({ ...sec, supervisor: Array.from(e.target.selectedOptions, (o) => o.value) })}>
            {(opciones?.supervisor ?? []).map((v) => <option key={v} value={v}>{v || '(sin dato)'}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Usuario asignado (sección)
          <select multiple value={sec.gestor} style={{ display: 'block', minWidth: 200, minHeight: 80 }}
            onChange={(e) => setSec({ ...sec, gestor: Array.from(e.target.selectedOptions, (o) => o.value) })}>
            {gestores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Cuentas Top
          <select value={sec.top} style={{ display: 'block', minWidth: 180 }}
            onChange={(e) => setSec({ ...sec, top: e.target.value as FiltrosSeccion['top'] })}>
            <option value="Todas">Todas</option>
            <option value="Solo Cuentas Top">Solo Cuentas Top</option>
            <option value="Sin Cuentas Top">Sin Cuentas Top</option>
          </select>
        </label>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          Valores en
          <select value={medida} onChange={(e) => setMedida(e.target.value as Medida)} style={{ display: 'block', minWidth: 220 }}>
            {Object.keys(MEDIDAS).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="error-pantalla">No se pudieron cargar las promesas: {error}</div>}
      {cargando && !error && <p className="vacio">Cargando promesas…</p>}
      {resumen && (
        <FilaKpi>
          {kpi('Vigentes', 'Promesas vigentes', 'info')}
          {kpi('Vencidas', 'Promesas vencidas')}
          {kpi('Promesado del mes', 'Promesado del mes')}
          <Kpi etiqueta="Monto pagado" valor={dinero(pagado)}
            detalle={`${pct(pagado !== null && resumen.Vencidas.monto ? pagado / resumen.Vencidas.monto : null)} de las vencidas`}
            tono="bueno" />
        </FilaKpi>
      )}

      {tabla && <Tabla
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
      />}

      {errorSerie && <div className="error-pantalla">La tendencia por día no se pudo cargar: {errorSerie}</div>}
      {serie && (
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
      )}
      <Nota texto="Barras: promesas registradas cada día. Línea: promesas vigentes al cierre del día. El día en curso no aparece hasta que cierra." />
    </>
  )
}
