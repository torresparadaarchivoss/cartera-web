import { useEffect, useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import * as datos from '../lib/datos'
import type { Filtros, FiltrosSeccion, PromesasResumen, FilaPromesaTabla, PuntoPromesaDia } from '../lib/datos'
import { useDatos } from '../lib/contexto'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Tabla, Titulo } from './Bloques'
import { MultiSelect, SelectBox } from './Selectores'

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
  const [medida, setMedida] = useState<Medida>('Saldo del crédito')
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
  const totVigSaldo = tot('vigentes_saldo')
  const totCartera = tot('cartera_saldo')
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
      name: `Promesas activas (${medidaTexto})`,
      yaxis: 'y2',
      line: { color: '#202050', width: 2.2 },
      marker: { size: 4 },
    } as Data,
  ]

  return (
    <>
      <Titulo texto="Promesas"
        ayuda="En vivo: la foto de cartera del día se toma antes de que empiece la gestión, así que aquí se suman también las promesas registradas durante el día. Vencidas: promesas del mes con fecha de pago anterior al corte, registradas hasta ayer. Promesas activas: todas las promesas (repromesas incluidas) con fecha de pago desde el corte. Promesado del mes: todas las promesas del mes, con repromesas. Monto pagado: pendiente de esta versión." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 8, maxWidth: 900 }}>
        <MultiSelect etiqueta="Supervisor" opciones={opciones?.supervisor ?? []} valor={sec.supervisor}
          formato={(v) => v || '(sin dato)'} onChange={(v) => setSec({ ...sec, supervisor: v })} />
        <MultiSelect etiqueta="Usuario asignado" opciones={gestores} valor={sec.gestor}
          onChange={(v) => setSec({ ...sec, gestor: v })} />
        <SelectBox etiqueta="Cuentas Top" opciones={[
          { valor: 'Todas', etiqueta: 'Todas' },
          { valor: 'Solo Cuentas Top', etiqueta: 'Solo Cuentas Top' },
          { valor: 'Sin Cuentas Top', etiqueta: 'Sin Cuentas Top' },
        ]} valor={sec.top} onChange={(v) => setSec({ ...sec, top: v })} />
        <SelectBox etiqueta="Valores en" opciones={Object.keys(MEDIDAS).map((m) => ({ valor: m as Medida, etiqueta: m }))}
          valor={medida} onChange={setMedida} />
      </div>
      {error && <div className="error-pantalla">No se pudieron cargar las promesas: {error}</div>}
      {cargando && !error && <p className="vacio">Cargando promesas…</p>}
      {resumen && (
        <FilaKpi>
          {kpi('Vigentes', 'Promesas activas', 'info')}
          {kpi('Vencidas', 'Promesas vencidas')}
          {kpi('Promesado del mes', 'Promesado del mes')}
          <Kpi etiqueta="Monto pagado" valor={dinero(pagado)}
            detalle={`${pct(pagado !== null && resumen.Vencidas.monto ? pagado / resumen.Vencidas.monto : null)} de las vencidas`}
            tono="bueno" />
        </FilaKpi>
      )}

      {tabla && <Tabla
        titulo={`Promesas por bucket de inicio · ${medidaTexto} al ${fecha(corte)}`}
        ayuda="Filas: bucket de inicio del mes (mora de referencia del loantape). Del bucket 0 solo las cuentas que hoy están en mora («0 (desmejora)»). % de cartera de las vigentes (en saldo) = saldo de las promesas activas ÷ saldo de la cartera del bucket al corte."
        etiquetaFila="Bucket de inicio"
        cabeceras={[
          { etiqueta: 'Vencidas', formato: (x) => dinero(x) },
          { etiqueta: 'Promesas activas', formato: (x) => dinero(x) },
          { etiqueta: '% de cartera de las vigentes (en saldo)', formato: (x) => pct(x) },
        ]}
        filas={filas.map((f) => ({
          etiqueta: f.fila,
          valores: [f.vencidas, f.vigentes, f.cartera_saldo ? f.vigentes_saldo / f.cartera_saldo : null],
        }))}
        total={{ etiqueta: 'Total', valores: [totVenc, totVig, totCartera ? totVigSaldo / totCartera : null] }}
      />}

      {errorSerie && <div className="error-pantalla">La tendencia por día no se pudo cargar: {errorSerie}</div>}
      {serie && (
        <Grafico
          titulo={`Promesas del día y activas al cierre · ${medidaTexto}`}
          data={ventaDia}
          layout={{
            barmode: 'group',
            yaxis: { title: { text: 'Promesas' }, rangemode: 'tozero' },
            yaxis2: { overlaying: 'y', side: 'right', tickprefix: '$', tickformat: ',.0f', showgrid: false, rangemode: 'tozero' },
          }}
          alto={340}
        />
      )}
      <Nota texto="Barras: promesas registradas cada día. Línea: promesas activas al cierre del día. El día en curso no aparece hasta que cierra." />
    </>
  )
}
