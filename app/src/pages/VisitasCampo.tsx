import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CuentaListado, UbicacionDetalle, VisitaDetalle } from '../lib/datos'
import { entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Plot, Tabla, Titulo } from '../components/Bloques'
import { MultiSelect, Radios, SelectBox } from '../components/Selectores'
import type { Data, Layout } from 'plotly.js'

// Visitas de campo (modules/visitas.py). Adaptado a lo que hay en la base: la visita trae su crédito, visitador,
// acción, resultado, causa de no pago, parentesco, fotos y km. El filtro de bucket de mora, el saldo visitado, el
// supervisor y los comentarios libres aún no están en la base y se dejan pendientes.

const PERIODOS = ['Acumulado del mes', 'Solo el día de seguimiento'] as const
const TOP = ['Todas', 'Solo cuentas Top', 'Sin cuentas Top'] as const
const COLORES = ['#4f5bb8', '#3fa04e', '#f89040', '#e25c52', '#88c038', '#aeb6ec', '#9C3352']

type Periodo = (typeof PERIODOS)[number]
type TopOpc = (typeof TOP)[number]

const esPromesa = (resultado: string) => resultado.toLowerCase().includes('promesa')

function conteo(xs: string[]): { etiqueta: string; n: number }[] {
  const m = new Map<string, number>()
  for (const x of xs) {
    const k = x.trim() || 'Sin dato'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([etiqueta, n]) => ({ etiqueta, n })).sort((a, b) => a.n - b.n)
}

function barrasH(xs: { etiqueta: string; n: number }[], color: string): Data[] {
  return [{ type: 'bar', orientation: 'h', x: xs.map((x) => x.n), y: xs.map((x) => x.etiqueta), marker: { color },
    hovertemplate: '%{y}: %{x}<extra></extra>' } as unknown as Data]
}

const layoutBarras: Partial<Layout> = { margin: { l: 8, r: 16, t: 16, b: 30 }, hovermode: 'closest', yaxis: { automargin: true } }

export default function VisitasCampo() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const { perfil } = useAuth()
  const esAdmin = perfil?.es_admin === true
  const [periodo, setPeriodo] = useState<Periodo>(PERIODOS[0])
  const [visitadores, setVisitadores] = useState<string[]>([])
  const [top, setTop] = useState<TopOpc>('Todas')
  const [agrupacion] = useState<'Visitador'>('Visitador')
  const [visitas, setVisitas] = useState<VisitaDetalle[] | null>(null)
  const [ubicaciones, setUbicaciones] = useState<UbicacionDetalle[]>([])
  const [cuentas, setCuentas] = useState<CuentaListado[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    setError(null)
    datos.visitasMes()
      .then((v) => vigente && setVisitas(v))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    if (!esAdmin) return
    let vigente = true
    datos.ubicacionesMes()
      .then((u) => vigente && setUbicaciones(u))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [esAdmin])

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    Promise.all([datos.cuentasListado(corte, 'cohorte', filtros), datos.cuentasListado(corte, 'activa', filtros)])
      .then(([a, b]) => vigente && setCuentas([...a, ...b]))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros])

  // Créditos que pasan los filtros globales (atributos de la cuenta) y el marcador de Cuentas Top.
  const cuentaPorCredito = useMemo(() => {
    const m = new Map<string, CuentaListado>()
    for (const c of cuentas ?? []) m.set(c.credito, c)
    return m
  }, [cuentas])

  const visitasFiltradas = useMemo(() => {
    if (!visitas || !corte || !cuentas) return []
    return visitas.filter((v) => {
      const dia = v.fecha_visita.slice(0, 10)
      if (dia > corte) return false
      if (periodo === PERIODOS[1] && dia !== corte) return false
      if (!cuentaPorCredito.has(v.credito)) return false
      if (visitadores.length && !visitadores.includes(v.visitador)) return false
      const c = cuentaPorCredito.get(v.credito)
      if (top === 'Solo cuentas Top' && !c?.top) return false
      if (top === 'Sin cuentas Top' && c?.top) return false
      return true
    })
  }, [visitas, corte, cuentas, cuentaPorCredito, periodo, visitadores, top])

  const creditosVisitados = useMemo(() => new Set(visitasFiltradas.map((v) => v.credito)), [visitasFiltradas])

  const ubicacionesFiltradas = useMemo(() => {
    if (!esAdmin || !visitasFiltradas.length) return []
    const claves = new Set(visitasFiltradas.map((v) => `${v.credito}|${v.fecha_visita}|${v.visitador}`))
    return ubicaciones.filter((u) => claves.has(`${u.credito}|${u.fecha_visita}|${u.visitador}`))
  }, [esAdmin, ubicaciones, visitasFiltradas])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar las visitas: {error}</div>
  if (!visitas || !cuentas || !corte || !fechaBase) return <p className="vacio">Cargando las visitas…</p>

  const v = visitasFiltradas
  const visitadoresOpc = [...new Set(visitas.map((x) => x.visitador))].filter(Boolean).sort()
  const diasActivos = new Set(v.map((x) => `${x.visitador}|${x.fecha_visita.slice(0, 10)}`)).size
  const km = v.reduce((a, x) => a + (x.kilometros ?? 0), 0)
  const fotos = v.reduce((a, x) => a + x.num_fotos, 0)
  const conFoto = v.filter((x) => x.num_fotos > 0).length
  const promesas = v.filter((x) => esPromesa(x.resultado)).length
  const rango = periodo === PERIODOS[1] ? `el ${fecha(corte)}` : `del ${fecha(fechaBase)} al ${fecha(corte)}`

  // Tabla por visitador (agrupación única por ahora).
  const porVisitador = new Map<string, VisitaDetalle[]>()
  for (const x of v) porVisitador.set(x.visitador, [...(porVisitador.get(x.visitador) ?? []), x])
  const grupos = [...porVisitador.entries()].sort((a, b) => b[1].length - a[1].length)
  const filaGrupo = (xs: VisitaDetalle[]) => {
    const creditos = new Set(xs.map((x) => x.credito)).size
    const dias = new Set(xs.map((x) => x.fecha_visita.slice(0, 10))).size
    const kms = xs.reduce((a, x) => a + (x.kilometros ?? 0), 0)
    const prom = xs.filter((x) => esPromesa(x.resultado)).length
    const f = xs.reduce((a, x) => a + x.num_fotos, 0)
    return [xs.length, creditos, dias, dias ? xs.length / dias : null, kms, f, prom, xs.length ? prom / xs.length : null]
  }
  const cabeceras = [
    { etiqueta: 'Visitas', formato: entero }, { etiqueta: 'Créditos visitados', formato: entero },
    { etiqueta: 'Días activos', formato: entero }, { etiqueta: 'Visitas por día', formato: (x: number | null) => (x === null ? '—' : x.toFixed(1)) },
    { etiqueta: 'Kilómetros', formato: (x: number | null) => (x === null ? '—' : x.toLocaleString('es-SV', { maximumFractionDigits: 1 })) },
    { etiqueta: 'Fotos', formato: entero }, { etiqueta: 'Promesas', formato: entero }, { etiqueta: '% promesa', formato: (x: number | null) => pct(x) },
  ]
  const filasGrupo = grupos.map(([nombre, xs]) => ({ etiqueta: nombre || 'Sin visitador', valores: filaGrupo(xs) }))
  const totalGrupo = { etiqueta: 'Total', valores: filaGrupo(v) }

  // Resultados, causas y acciones.
  const resultados = conteo(v.map((x) => x.resultado))
  const causas = conteo(v.filter((x) => x.causa_no_pago).map((x) => x.causa_no_pago))
  const acciones = conteo(v.map((x) => x.accion))

  // Visitas por día y visitador (solo en acumulado).
  const diaVisitador = new Map<string, Map<string, number>>()
  for (const x of v) {
    const d = x.fecha_visita.slice(0, 10)
    const m = diaVisitador.get(x.visitador) ?? new Map<string, number>()
    m.set(d, (m.get(d) ?? 0) + 1)
    diaVisitador.set(x.visitador, m)
  }
  const diasOrden = [...new Set(v.map((x) => x.fecha_visita.slice(0, 10)))].sort()
  const serieDia: Data[] = [...diaVisitador.entries()].map(([nombre, m], i) => ({
    type: 'bar', name: nombre || 'Sin visitador', x: diasOrden, y: diasOrden.map((d) => m.get(d) ?? 0),
    marker: { color: COLORES[i % COLORES.length] },
  } as unknown as Data))

  const mapaData = (() => {
    const porV = new Map<string, UbicacionDetalle[]>()
    for (const u of ubicacionesFiltradas) porV.set(u.visitador, [...(porV.get(u.visitador) ?? []), u])
    return [...porV.entries()].map(([nombre, us], i) => ({
      type: 'scattermap', mode: 'markers', name: nombre || 'Sin visitador',
      lat: us.map((u) => u.latitud), lon: us.map((u) => u.longitud),
      text: us.map((u) => `${u.credito} · ${fecha(u.fecha_visita.slice(0, 10))}<br>${u.resultado}`),
      hoverinfo: 'text', marker: { size: 9, opacity: 0.8, color: COLORES[i % COLORES.length] },
    })) as unknown as Data[]
  })()
  const centro = (() => {
    const us = ubicacionesFiltradas
    if (!us.length) return null
    return { lat: us.reduce((a, u) => a + u.latitud, 0) / us.length, lon: us.reduce((a, u) => a + u.longitud, 0) / us.length }
  })()

  const detalle = [...v].sort((a, b) => b.fecha_visita.localeCompare(a.fecha_visita))

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Visitas de campo</h1>
      <p className="dc-desc">
        Visitas registradas en el mes, cada una con los datos del crédito. Respeta los filtros globales.
      </p>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Periodo" opciones={[...PERIODOS]} valor={periodo} onChange={setPeriodo} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <MultiSelect etiqueta="Visitador" opciones={visitadoresOpc} valor={visitadores} onChange={setVisitadores} placeholder="Todos los visitadores" />
          <SelectBox etiqueta="Cuentas Top" opciones={TOP.map((t) => ({ valor: t, etiqueta: t }))} valor={top} onChange={setTop} />
        </div>
      </div>

      <Nota texto={`Visitas ${rango}. Promesa: resultado de visita que contiene «promesa». Los filtros globales se aplican por la cuenta.`} />
      {v.length === 0 && <Nota tipo="alerta" texto="No hay visitas con los filtros seleccionados." />}

      <FilaKpi>
        <Kpi etiqueta="Visitas" valor={entero(v.length)} detalle={`${entero(porVisitador.size)} visitadores`} />
        <Kpi etiqueta="Créditos únicos visitados" valor={entero(creditosVisitados.size)}
          detalle={creditosVisitados.size ? `${(v.length / creditosVisitados.size).toFixed(1)} visitas por crédito` : ''} tono="info" />
        <Kpi etiqueta="Visitas por día activo" valor={diasActivos ? (v.length / diasActivos).toFixed(1) : '—'} detalle="promedio por visitador" />
        <Kpi etiqueta="Kilómetros" valor={km.toLocaleString('es-SV', { maximumFractionDigits: 1 })}
          detalle={v.length ? `${(km / v.length).toFixed(2)} km por visita` : ''} />
        <Kpi etiqueta="Con fotografía" valor={pct(v.length ? conFoto / v.length : null)} detalle={`${entero(fotos)} fotos`} />
        <Kpi etiqueta="Con promesa" valor={entero(promesas)} detalle={pct(v.length ? promesas / v.length : null)} tono="bueno" />
      </FilaKpi>

      <Tabla titulo={`Resultados por ${agrupacion.toLowerCase()}`} etiquetaFila={agrupacion}
        cabeceras={cabeceras} filas={filasGrupo} total={totalGrupo} />

      {periodo === PERIODOS[0] && diasOrden.length > 0 && (
        <div className="dc-tarjeta">
          <Titulo texto="Visitas por día y visitador" />
          <Plot data={serieDia} layout={{ height: 320, barmode: 'stack', hovermode: 'x unified', legend: { orientation: 'h', y: -0.2 },
            margin: { l: 48, r: 16, t: 16, b: 40 }, paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff' } as Partial<Layout>}
            config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Grafico titulo="Resultados" data={barrasH(resultados, '#4f5bb8')} layout={layoutBarras} alto={320} />
        <Grafico titulo="Causas de no pago" data={barrasH(causas, '#f89040')} layout={layoutBarras} alto={320} />
        <Grafico titulo="Acciones realizadas" data={barrasH(acciones, '#3fa04e')} layout={layoutBarras} alto={320} />
      </div>

      {esAdmin && (
        <div className="dc-tarjeta">
          <Titulo texto={`Mapa de visitas (${entero(ubicacionesFiltradas.length)}) · solo administradores`} />
          {centro && mapaData.length ? (
            <Plot data={mapaData} layout={{ height: 460, autosize: true, margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: '#ffffff',
              legend: { orientation: 'h' }, map: { style: 'carto-positron', center: centro, zoom: 8 } } as unknown as Partial<Layout>}
              config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
          ) : (
            <p style={{ fontSize: 13 }}>Ninguna visita con coordenadas válidas en este filtro.</p>
          )}
          <p style={{ fontSize: 12, marginTop: 8 }}>Solo visitas con coordenadas dentro de El Salvador.</p>
        </div>
      )}

      <div className="dc-tarjeta">
        <Titulo texto={`Detalle de visitas (${entero(detalle.length)})`} />
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="dc-tabla">
            <thead>
              <tr><th>Fecha</th><th>Crédito</th><th>Visitador</th><th>Acción</th><th>Resultado</th><th>Causa de no pago</th><th>Parentesco</th><th>Fotos</th><th>Km</th></tr>
            </thead>
            <tbody>
              {detalle.slice(0, 1000).map((x, i) => (
                <tr key={i}>
                  <td>{fecha(x.fecha_visita.slice(0, 10))}</td><td>{x.credito}</td><td>{x.visitador}</td><td>{x.accion}</td>
                  <td>{x.resultado}</td><td>{x.causa_no_pago}</td><td>{x.parentesco}</td><td>{entero(x.num_fotos)}</td>
                  <td>{x.kilometros === null ? '—' : entero(x.kilometros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12 }}>Pendiente en la base: bucket de mora del día de la visita, saldo visitado, supervisor y comentarios libres.</p>
      </div>
    </>
  )
}
