import { useEffect, useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import * as datos from '../lib/datos'
import type { CreditoLegal, MetasRecuperacion } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Titulo, TONOS } from './Bloques'
import { MultiSelect } from './Selectores'
import { UMBRAL_AMARILLO, UMBRAL_VERDE } from '../lib/prorrateo'
import {
  COMPROBANTES, ORDEN_CANAL, SIN_ASIGNAR, SIN_CANAL, comprobanteDe, tablaAgente, tablaCanal,
  type FilaAgente, type FilaLegal,
} from '../lib/recaudo'

// Recaudo legal (modules/recuperacion.py → recaudo_legal). Universo fijo: créditos JUR con saldo el primer día.
// Pendiente: el nombre a mostrar de cada agente sale del catálogo de Administración (aún sin portar); por ahora se
// muestra el usuario de la fuente en mayúsculas.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

interface Datos {
  creditos: CreditoLegal[]
  meta: MetasRecuperacion
  vigentes: Map<string, number>
}

export default function RecaudoLegal({ corte, fechaBase, factor }: { corte: string; fechaBase: string; factor: number }) {
  const [datosLegal, setDatosLegal] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canales, setCanales] = useState<string[]>([])
  const [comprobantes, setComprobantes] = useState<string[]>([])

  useEffect(() => {
    let vigente = true
    setError(null)
    Promise.all([
      datos.recaudoLegalBase(corte),
      datos.metasRecuperacion(corte.slice(0, 7)),
      datos.recaudoLegalVigentes(corte),
    ])
      .then(([creditos, meta, vig]) => {
        if (!vigente) return
        setDatosLegal({ creditos, meta, vigentes: new Map(vig.map((v) => [v.credito, v.monto])) })
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte])

  const vista = useMemo(() => {
    if (!datosLegal) return null
    const { creditos, meta, vigentes } = datosLegal
    const canal = tablaCanal(creditos, meta, factor)
    const filtrados = creditos.filter((c) =>
      (canales.length === 0 || canales.includes(canalDeCredito(c, meta))) &&
      (comprobantes.length === 0 || comprobantes.includes(comprobanteDe(c))))
    const agente = tablaAgente(filtrados, meta, factor, vigentes, UMBRAL_VERDE, UMBRAL_AMARILLO)
    return { canal, agente, sinCanal: sinCanalAgentes(creditos, meta) }
  }, [datosLegal, factor, canales, comprobantes])

  if (error) return <div className="error-pantalla">No se pudo cargar el recaudo legal: {error}</div>
  if (!datosLegal || !vista) return <p className="vacio">Cargando recaudo legal…</p>
  if (datosLegal.creditos.length === 0) return <Nota tipo="alerta" texto="No hay créditos JUR con saldo el primer día del mes." />

  const { canal, agente } = vista
  const sinCanal = vista.sinCanal
  const { total } = canal
  const mes = MESES[Number(fechaBase.slice(5, 7)) - 1]
  const tonoCumplF = total.cumplFecha === null ? 'neutro' : total.cumplFecha >= UMBRAL_VERDE ? 'bueno'
    : total.cumplFecha >= UMBRAL_AMARILLO ? 'alerta' : 'malo'

  const dataCanal: Data[] = [
    { type: 'bar', x: canal.filas.map((f) => f.clave), y: canal.filas.map((f) => f.recaudo), name: 'Recaudo',
      marker: { color: '#3f4da8' } } as Data,
    { type: 'bar', x: canal.filas.map((f) => f.clave), y: canal.filas.map((f) => f.metaFecha ?? 0),
      name: 'Meta a la fecha', marker: { color: '#aeb6ec' } } as Data,
    { type: 'bar', x: canal.filas.map((f) => f.clave), y: canal.filas.map((f) => f.metaMes ?? 0),
      name: 'Meta del mes', marker: { color: '#202050' } } as Data,
  ]

  return (
    <>
      <Titulo texto="Recaudo legal"
        ayuda={`Universo: créditos JUR con saldo > 0 el ${fecha(fechaBase)}. Recaudo: pagos de CHIRICO del mes hasta la fecha. Meta a la fecha prorrateada: ${pct(factor)} del mes. No usa los filtros globales.`} />
      {sinCanal.length > 0 && (
        <Nota tipo="alerta" texto={`${sinCanal.length} gestor(es) de la cartera legal sin canal: ${sinCanal.join(', ')}. Asígnalo en Administración → Recaudo legal.`} />
      )}
      <FilaKpi>
        <Kpi etiqueta="Clientes legales" valor={entero(total.clientes)} detalle={dinero(total.saldo)} tono="info" />
        <Kpi etiqueta="Clientes con pago" valor={entero(total.clientesConPago)}
          detalle={`${pct(total.pctClientesConPago, 2)} de los clientes`} />
        <Kpi etiqueta="Recaudo legal" valor={dinero(total.recaudo)}
          detalle={`${pct(total.pctRecaudo, 2)} del saldo`} tono="bueno" />
        <Kpi etiqueta="Cumplimiento a la fecha" valor={pct(total.cumplFecha)}
          detalle={total.metaFecha !== null ? `meta ${dinero(total.metaFecha)}` : 'sin meta'} tono={tonoCumplF} />
        <Kpi etiqueta="Cumplimiento del mes" valor={pct(total.cumplMes)}
          detalle={total.metaMes !== null ? `meta ${dinero(total.metaMes)}` : 'sin meta'} />
      </FilaKpi>

      <div className="dc-tarjeta">
        <Titulo texto="Recaudo legal por canal" />
        <TablaLegal filas={canal.filas} total={total} />
        <p style={{ fontSize: 12, marginTop: 8 }}>
          % de meta del Total = todo el recaudo ÷ suma de las metas de los canales.
          {' '}Origen de la meta: {Object.entries(datosLegal.meta.origenCanal).map(([c, o]) =>
            `${c}: ${o === 'individual' ? 'suma de metas individuales' : 'meta del canal'}`).join('; ') || 'sin metas del mes'}.
        </p>
      </div>

      <div className="dc-tarjeta">
        <Titulo texto="Recaudo legal por agente"
          ayuda="Canal y comprobante filtran los créditos. Canal: el del gestor. Meta: la individual del mes. % Alcance = recuperado ÷ meta del mes; el punto compara el recuperado con la meta a la fecha. Promesas vigentes: última promesa con fecha de pago desde la fecha de corte, de los créditos legales del agente." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 8 }}>
          <MultiSelect etiqueta="Canal" opciones={[...ORDEN_CANAL]} valor={canales} onChange={setCanales}
            placeholder="Todos los canales" />
          <MultiSelect etiqueta="Comprobante" opciones={[...COMPROBANTES]} valor={comprobantes} onChange={setComprobantes}
            placeholder="Todos los comprobantes" />
        </div>
        <TablaAgente mes={mes} filas={agente.filas} total={agente.total} />
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Meta: la individual del mes (Administración → Recaudo legal). Faltante = meta − recuperado.
        </p>
      </div>

      <Grafico titulo="Recaudo legal contra meta por canal" alto={320} data={dataCanal}
        layout={{ barmode: 'group', yaxis: { tickprefix: '$', tickformat: ',.0f' }, xaxis: { type: 'category' } }} />
    </>
  )
}

function canalDeCredito(c: CreditoLegal, meta: MetasRecuperacion): string {
  if (c.embargo) return 'Embargo'
  if (!c.gestor) return SIN_ASIGNAR
  return meta.canalGestor[c.gestor] || SIN_CANAL
}

function sinCanalAgentes(creditos: CreditoLegal[], meta: MetasRecuperacion): string[] {
  const s = new Set<string>()
  for (const c of creditos) if (c.gestor && !meta.canalGestor[c.gestor]) s.add(c.gestor.toUpperCase())
  return [...s].sort()
}

function TablaLegal({ filas, total }: { filas: FilaLegal[]; total: FilaLegal }) {
  const cab = ['Clientes', 'Clientes con pago', '% clientes con pago', 'Saldo capital', 'Recaudo', '% recaudo',
    'Meta a la fecha', 'Cumpl. a la fecha', 'Meta del mes', 'Cumpl. del mes', 'Recaudo promedio']
  const celdas = (f: FilaLegal) => [
    entero(f.clientes), entero(f.clientesConPago), pct(f.pctClientesConPago, 2), dinero(f.saldo), dinero(f.recaudo),
    pct(f.pctRecaudo, 2), dinero(f.metaFecha), pct(f.cumplFecha), dinero(f.metaMes), pct(f.cumplMes), dinero(f.promedio),
  ]
  const color = (c: number | null) => c === null ? undefined : TONOS[c >= UMBRAL_VERDE ? 'bueno' : c >= UMBRAL_AMARILLO ? 'alerta' : 'malo']
  const fila = (f: FilaLegal, etiqueta: string, clase?: string) => (
    <tr key={etiqueta} className={clase}>
      <td>{etiqueta}</td>
      {celdas(f).map((v, i) => (
        <td key={i} style={(i === 7 || i === 9) ? { color: color(i === 7 ? f.cumplFecha : f.cumplMes), fontWeight: 600 } : undefined}>{v}</td>
      ))}
    </tr>
  )
  return (
    <table className="dc-tabla">
      <thead>
        <tr><th>Canal</th>{cab.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {filas.map((f) => fila(f, f.clave))}
        {fila(total, 'Total', 'total')}
      </tbody>
    </table>
  )
}

function TablaAgente({ mes, filas, total }: { mes: string; filas: FilaAgente[]; total: FilaAgente }) {
  const punto = (s: FilaAgente['semaforo']) => (s ? <span style={{ color: TONOS[s === 'Verde' ? 'bueno' : s === 'Amarillo' ? 'alerta' : 'malo'], fontSize: '1.15em' }}>●</span> : '')
  const fila = (f: FilaAgente, clase?: string) => (
    <tr key={f.agente} className={clase}>
      <td>{f.agente}</td>
      <td>{f.canal}</td>
      <td>{dinero(f.meta)}</td>
      <td>{dinero(f.recuperado)}</td>
      <td style={{ textAlign: 'center' }}>{punto(f.semaforo)}</td>
      <td>{pct(f.alcance)}</td>
      <td>{dinero(f.faltante)}</td>
      <td>{f.vigentes ? dinero(f.vigentes) : '—'}</td>
    </tr>
  )
  return (
    <table className="dc-tabla">
      <thead>
        <tr>
          <th>Agente</th><th>Canal</th><th>Meta</th><th>Recuperado {mes}</th><th>Estado</th><th>% Alcance</th>
          <th>Faltante para meta</th><th>Monto promesas vigentes</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => fila(f))}
        {fila(total, 'total')}
      </tbody>
    </table>
  )
}
