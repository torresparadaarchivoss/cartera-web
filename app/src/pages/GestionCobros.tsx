import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CuentaListado, GestionMes } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Plot, Tabla, Titulo } from '../components/Bloques'
import { Radios, SelectBox } from '../components/Selectores'
import type { Data, Layout } from 'plotly.js'

// Gestión de cobros (modules/gestiones.py). Pendiente de Administración: el equipo de cobro (agentes con metas del
// mes), los filtros de departamento y tramo, el monto pagado por agente y la productividad por supervisor. Por ahora la
// productividad cuenta a todos los usuarios que registraron gestiones en los créditos del filtro global.

const PERIODOS = ['Acumulado del mes', 'Solo el día de seguimiento'] as const
const TOP = ['Todas', 'Solo cuentas Top', 'Sin cuentas Top'] as const
const ORDEN_DIAS = ['0 a 3 días', '4 a 7 días', '8 a 15 días', 'Más de 15 días', 'Sin gestión en el mes'] as const
const COLOR_PRIORIDAD: Record<string, string> = {
  'Critico Sin Gestion': '#e25c52', 'Critico Sin Contacto': '#f89040', Riesgo: '#f5c451',
  'Seguimiento Promesa': '#3fa04e', Normal: '#aeb6ec',
}

type Periodo = (typeof PERIODOS)[number]
type TopOpc = (typeof TOP)[number]

const etiquetaPrioridad = (p: string) => p.replace('Critico', 'Crítico').replace('Gestion', 'gestión')
  .replace('Contacto', 'contacto').replace('Seguimiento Promesa', 'Seguimiento promesa')

function diasSinGestion(d: number | null): (typeof ORDEN_DIAS)[number] {
  if (d === null) return 'Sin gestión en el mes'
  if (d <= 3) return '0 a 3 días'
  if (d <= 7) return '4 a 7 días'
  if (d <= 15) return '8 a 15 días'
  return 'Más de 15 días'
}

interface FilaAgente {
  gestiones: number
  creditos: number
  contactos: number
  rpc: number
  promesas: number
  monto: number
  dias: number
}

function resumen(xs: GestionMes[]): FilaAgente {
  const cred = new Set(xs.filter((x) => x.gestionada === 1).map((x) => x.credito))
  const dias = new Set(xs.map((x) => x.fecha_actividad.slice(0, 10)))
  return {
    gestiones: xs.length,
    creditos: cred.size,
    contactos: xs.reduce((a, x) => a + x.contacto, 0),
    rpc: xs.reduce((a, x) => a + x.rpc, 0),
    promesas: xs.reduce((a, x) => a + x.promesa, 0),
    monto: xs.reduce((a, x) => a + (x.promesa ? x.monto_promesa : 0), 0),
    dias: dias.size,
  }
}

function valoresDe(r: FilaAgente): (number | null)[] {
  return [
    r.gestiones, r.creditos, r.contactos, r.rpc, r.promesas, r.monto,
    r.creditos ? r.gestiones / r.creditos : null,
    r.dias,
    r.dias ? r.gestiones / r.dias : null,
    r.gestiones ? r.contactos / r.gestiones : null,
    r.gestiones ? r.rpc / r.gestiones : null,
    r.rpc ? r.promesas / r.rpc : null,
  ]
}

const CABECERAS_AGENTE = [
  { etiqueta: 'Gestiones', formato: entero }, { etiqueta: 'Créditos gestionados', formato: entero },
  { etiqueta: 'Contactos', formato: entero }, { etiqueta: 'RPC', formato: entero }, { etiqueta: 'Promesas', formato: entero },
  { etiqueta: 'Monto prometido', formato: (x: number | null) => dinero(x) },
  { etiqueta: 'Intentos por crédito', formato: (x: number | null) => (x === null ? '—' : x.toFixed(1)) },
  { etiqueta: 'Días activos', formato: entero },
  { etiqueta: 'Gestiones por día activo', formato: (x: number | null) => (x === null ? '—' : x.toFixed(1)) },
  { etiqueta: '% contacto', formato: (x: number | null) => pct(x) },
  { etiqueta: '% RPC', formato: (x: number | null) => pct(x) },
  { etiqueta: '% promesa', formato: (x: number | null) => pct(x) },
]

export default function GestionCobros() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [periodo, setPeriodo] = useState<Periodo>(PERIODOS[0])
  const [top, setTop] = useState<TopOpc>('Todas')
  const [gestiones, setGestiones] = useState<GestionMes[] | null>(null)
  const [cuentas, setCuentas] = useState<CuentaListado[] | null>(null)
  const [activas, setActivas] = useState<CuentaListado[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    datos.gestionesMes()
      .then((g) => vigente && setGestiones(g))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    Promise.all([datos.cuentasListado(corte, 'cohorte', filtros), datos.cuentasListado(corte, 'activa', filtros)])
      .then(([a, b]) => {
        if (!vigente) return
        setActivas(b)
        setCuentas([...a, ...b])
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros])

  // Universo de créditos del filtro global (cohorte y cartera activa): la gestión se cuenta sobre ellos.
  const universo = useMemo(() => new Map((cuentas ?? []).map((c) => [c.credito, c] as const)), [cuentas])

  const filtradas = useMemo(() => {
    if (!gestiones || !corte) return []
    return gestiones.filter((g) => {
      const dia = g.fecha_actividad.slice(0, 10)
      if (dia > corte) return false
      if (periodo === PERIODOS[1] && dia !== corte) return false
      const c = universo.get(g.credito)
      if (!c) return false
      if (top === 'Solo cuentas Top' && !c.top) return false
      if (top === 'Sin cuentas Top' && c.top) return false
      return true
    })
  }, [gestiones, corte, periodo, top, universo])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudo cargar la gestión: {error}</div>
  if (!gestiones || !cuentas || !corte || !fechaBase) return <p className="vacio">Cargando la gestión…</p>

  const rango = periodo === PERIODOS[1] ? `el ${fecha(corte)}` : `del ${fecha(fechaBase)} al ${fecha(corte)}`
  const k = resumen(filtradas)

  const hoy = activas.filter((c) => (top === 'Solo cuentas Top' ? c.top : top === 'Sin cuentas Top' ? !c.top : true))
  const sinGestion = hoy.filter((c) => c.gestiones_mes === 0).length

  // Productividad por agente.
  const porAgente = new Map<string, GestionMes[]>()
  for (const g of filtradas) {
    const nombre = g.usuario.trim() || '(sin dato)'
    porAgente.set(nombre, [...(porAgente.get(nombre) ?? []), g])
  }
  const agentes = [...porAgente.entries()].sort((a, b) => b[1].length - a[1].length)
  const filasAgente = agentes.map(([nombre, xs]) => ({ etiqueta: nombre, valores: valoresDe(resumen(xs)) }))
  const totalAgente = { etiqueta: 'Total', valores: valoresDe(k) }

  // Gestiones diarias (solo acumulado) y volumen por agente.
  const porDia = new Map<string, { gestiones: number; contactos: number; rpc: number; promesas: number }>()
  for (const g of filtradas) {
    const d = g.fecha_actividad.slice(0, 10)
    const x = porDia.get(d) ?? { gestiones: 0, contactos: 0, rpc: 0, promesas: 0 }
    x.gestiones += 1
    x.contactos += g.contacto
    x.rpc += g.rpc
    x.promesas += g.promesa
    porDia.set(d, x)
  }
  const dias = [...porDia.keys()].sort()
  const top20 = agentes.slice(0, 20).map(([n, xs]) => ({ n, r: resumen(xs) }))

  // Priorización de cuentas activas.
  const prioridades = new Map<string, { cuentas: number; saldo: number }>()
  for (const c of hoy) {
    const x = prioridades.get(c.prioridad) ?? { cuentas: 0, saldo: 0 }
    x.cuentas += 1
    x.saldo += c.saldo_dia
    prioridades.set(c.prioridad, x)
  }
  const etiquetasPrio = [...prioridades.keys()]
  const treemap: Data[] = [{
    type: 'treemap', labels: etiquetasPrio.map(etiquetaPrioridad), parents: etiquetasPrio.map(() => ''),
    values: etiquetasPrio.map((p) => prioridades.get(p)?.saldo ?? 0),
    customdata: etiquetasPrio.map((p) => prioridades.get(p)?.cuentas ?? 0),
    texttemplate: '%{label}<br>%{value:$,.0f}<br>%{customdata} cuentas',
    hovertemplate: '%{label}: %{value:$,.0f} · %{customdata} cuentas<extra></extra>',
    marker: { colors: etiquetasPrio.map((p) => COLOR_PRIORIDAD[p] ?? '#aeb6ec'), line: { color: '#ffffff', width: 2 } },
  } as unknown as Data]

  const dsg = new Map<string, { cuentas: number; saldo: number }>(ORDEN_DIAS.map((o) => [o, { cuentas: 0, saldo: 0 }]))
  for (const c of hoy) {
    const x = dsg.get(diasSinGestion(c.dias_sin_gestion))!
    x.cuentas += 1
    x.saldo += c.saldo_dia
  }
  const colorDias = ['#3fa04e', '#88c038', '#f5c451', '#f89040', '#e25c52']

  const cruce = (etiqueta: string, campo: (c: CuentaListado) => string) => {
    const m = new Map<string, { cuentas: number; saldo: number }>()
    for (const c of hoy) {
      const key = campo(c) || 'Sin dato'
      const x = m.get(key) ?? { cuentas: 0, saldo: 0 }
      x.cuentas += 1
      x.saldo += c.saldo_dia
      m.set(key, x)
    }
    const totCuentas = hoy.length
    const totSaldo = hoy.reduce((a, c) => a + c.saldo_dia, 0)
    const filas = [...m.entries()].sort((a, b) => b[1].saldo - a[1].saldo).map(([k2, x]) => ({
      etiqueta: k2,
      valores: [x.cuentas, x.saldo, totCuentas ? x.cuentas / totCuentas : null, totSaldo ? x.saldo / totSaldo : null],
    }))
    return (
      <Tabla titulo={etiqueta}
        cabeceras={[{ etiqueta: 'Cuentas', formato: entero }, { etiqueta: 'Saldo del día', formato: (x) => dinero(x) },
          { etiqueta: '% de cuentas', formato: (x) => pct(x) }, { etiqueta: '% del saldo', formato: (x) => pct(x) }]}
        filas={filas}
        total={{ etiqueta: 'Total', valores: [totCuentas, totSaldo, totCuentas ? 1 : null, totSaldo ? 1 : null] }} />
    )
  }

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Gestión de cobros</h1>
      <p className="dc-desc">
        Volumen y efectividad de la gestión telefónica, productividad por agente y priorización de las cuentas activas.
        El agente es quien registró la gestión, no el gestor asignado.
      </p>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Periodo" opciones={[...PERIODOS]} valor={periodo} onChange={setPeriodo} />
          <SelectBox etiqueta="Cuentas Top" opciones={TOP.map((t) => ({ valor: t, etiqueta: t }))} valor={top} onChange={setTop} />
        </div>
      </div>

      <Nota tipo="alerta" texto="Pendiente de Administración: el equipo de cobro (solo agentes con metas), departamento, tramo, monto pagado por agente y productividad por supervisor. Aquí cuentan todos los usuarios que registraron gestiones." />
      <Nota texto={`Gestiones registradas ${rango}, en los créditos del filtro global. Promesa: monto prometido de las gestiones con promesa.`} />
      {filtradas.length === 0 && <Nota tipo="alerta" texto="No hay gestiones con los filtros seleccionados." />}

      <FilaKpi>
        <Kpi etiqueta="Gestiones" valor={entero(k.gestiones)} detalle={`${entero(porAgente.size)} agentes`} />
        <Kpi etiqueta="Créditos gestionados" valor={entero(k.creditos)}
          detalle={k.creditos ? `${(k.gestiones / k.creditos).toFixed(1)} intentos por crédito` : ''} tono="info" />
        <Kpi etiqueta="Contactos" valor={entero(k.contactos)} detalle={k.gestiones ? `${pct(k.contactos / k.gestiones)} de las gestiones` : ''} />
        <Kpi etiqueta="RPC" valor={entero(k.rpc)} detalle={k.gestiones ? `${pct(k.rpc / k.gestiones)} de las gestiones` : ''} />
        <Kpi etiqueta="Promesas" valor={entero(k.promesas)} detalle={k.rpc ? `${pct(k.promesas / k.rpc)} de las RPC` : ''} tono="bueno" />
        <Kpi etiqueta="Cuentas sin gestión en el mes" valor={entero(sinGestion)} detalle={`de ${entero(hoy.length)} activas al ${fecha(corte)}`} tono={sinGestion ? 'malo' : 'bueno'} />
      </FilaKpi>

      <Tabla titulo={`Productividad por agente`} etiquetaFila="Agente" cabeceras={CABECERAS_AGENTE}
        filas={filasAgente} total={totalAgente} />
      <p style={{ fontSize: 12, marginTop: -8 }}>% contacto y % RPC sobre gestiones; % promesa sobre RPC.</p>

      {top20.length > 0 && (
        <Grafico titulo="Volumen y efectividad por agente (20 primeros)"
          data={[
            { type: 'bar', name: 'Gestiones', x: top20.map((t) => t.n), y: top20.map((t) => t.r.gestiones), marker: { color: '#aeb6ec' } },
            { type: 'bar', name: 'Contactos', x: top20.map((t) => t.n), y: top20.map((t) => t.r.contactos), marker: { color: '#4f5bb8' } },
            { type: 'bar', name: 'RPC', x: top20.map((t) => t.n), y: top20.map((t) => t.r.rpc), marker: { color: '#f5c451' } },
            { type: 'bar', name: 'Promesas', x: top20.map((t) => t.n), y: top20.map((t) => t.r.promesas), marker: { color: '#3fa04e' } },
          ]}
          layout={{ barmode: 'group', hovermode: 'x unified', xaxis: { type: 'category' } } as Partial<Layout>} />
      )}

      {periodo === PERIODOS[0] && dias.length > 0 && (
        <Grafico titulo="Gestiones diarias"
          data={[
            { type: 'bar', name: 'Gestiones', x: dias, y: dias.map((d) => porDia.get(d)!.gestiones), marker: { color: '#aeb6ec' } },
            { type: 'scatter', mode: 'lines+markers', name: 'Contactos', x: dias, y: dias.map((d) => porDia.get(d)!.contactos), line: { color: '#4f5bb8' } },
            { type: 'scatter', mode: 'lines+markers', name: 'RPC', x: dias, y: dias.map((d) => porDia.get(d)!.rpc), line: { color: '#f5c451' } },
            { type: 'scatter', mode: 'lines+markers', name: 'Promesas', x: dias, y: dias.map((d) => porDia.get(d)!.promesas), line: { color: '#3fa04e' } },
          ]}
          layout={{ hovermode: 'x unified', yaxis: { rangemode: 'tozero' } } as Partial<Layout>} />
      )}

      <Titulo texto={`Priorización de cuentas activas al ${fecha(corte)}`} />
      <p style={{ fontSize: 12, marginTop: -4 }}>Estado acumulado del mes. El detalle de cada cuenta está en Cuentas a gestionar.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="dc-tarjeta">
          <Titulo texto="Prioridad (saldo)" />
          <Plot data={treemap} layout={{ height: 320, margin: { l: 8, r: 8, t: 8, b: 8 }, paper_bgcolor: '#ffffff' } as Partial<Layout>}
            config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
        </div>
        <Grafico titulo="Días sin gestión" alto={320}
          data={[{ type: 'bar', x: [...dsg.keys()], y: [...dsg.values()].map((x) => x.cuentas),
            marker: { color: colorDias }, customdata: [...dsg.values()].map((x) => x.saldo),
            hovertemplate: '%{x}: %{y} cuentas · %{customdata:$,.0f}<extra></extra>' } as unknown as Data]}
          layout={{ xaxis: { type: 'category' } } as Partial<Layout>} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="dc-tarjeta">{cruce('Estado de cobranza', (c) => c.estado_cobranza)}</div>
        <div className="dc-tarjeta">{cruce('Intentos en el mes', (c) => c.rango_intentos)}</div>
      </div>
    </>
  )
}
