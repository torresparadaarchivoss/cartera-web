import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CoreoEpisodio, CoreoFpdFila } from '../lib/datos'
import * as adm from '../lib/administracion'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Plot, Tabla, Titulo } from '../components/Bloques'
import { MultiSelect, SelectBox } from '../components/Selectores'
import * as co from '../lib/coreografias'
import type { Data, Layout } from 'plotly.js'

// Coreografías de gestión (modules/coreografias.py). Los episodios y la cosecha FPD los calcula el motor del Streamlit
// en la carga mensual; aquí solo se agregan. Filtros globales: supervisor y tipo de crédito.

const DESGLOSES = ['Segmento', 'Gestor', 'Supervisor', 'Semana de entrada', 'Clase de crédito'] as const
type Desglose = (typeof DESGLOSES)[number]

const CLAVE_DESGLOSE: Record<Desglose, (x: CoreoEpisodio) => string> = {
  Segmento: (x) => x.segmento ?? '',
  Gestor: (x) => x.gestor ?? '',
  Supervisor: (x) => x.supervisor ?? '',
  'Semana de entrada': (x) => (x.semana ? fecha(x.semana) : ''),
  'Clase de crédito': (x) => x.clase ?? '',
}

export default function CoreografiasGestion() {
  const { fecha: corte, filtros, cargando } = useDatos()
  const periodo = corte ? corte.slice(0, 7) : ''
  const [episodios, setEpisodios] = useState<CoreoEpisodio[] | null>(null)
  const [fpd, setFpd] = useState<CoreoFpdFila[] | null>(null)
  const [config, setConfig] = useState<Record<string, number> | null>(null)
  const [presupuesto, setPresupuesto] = useState<number | null>(null)
  const [usuarios, setUsuarios] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [segmentos, setSegmentos] = useState<string[]>([])
  const [desglose, setDesglose] = useState<Desglose>('Segmento')

  useEffect(() => {
    Promise.all([datos.coreoEpisodios(), datos.coreoFpd(), adm.usuarios()])
      .then(([e, f, u]) => {
        setEpisodios(e)
        setFpd(f)
        setUsuarios(new Map(u.map((x) => [x.usuario_norm, x.nombre_mostrado || x.usuario_norm] as const)))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!periodo) return
    Promise.all([datos.coreoConfig(periodo), adm.presupuestoFpd()])
      .then(([c, p]) => {
        setConfig(c)
        const mes = p.find((x) => x.mes === periodo)
        setPresupuesto(mes ? Number(mes.valor) : null)
      })
      .catch((e: Error) => setError(e.message))
  }, [periodo])

  const filtrados = useMemo(() => {
    if (!episodios) return []
    const sup = filtros?.supervisor ?? []
    const tc = filtros?.tipo_credito ?? []
    return episodios.filter((x) => (!sup.length || sup.includes(x.supervisor ?? '')) &&
      (!tc.length || tc.includes(x.tipo_credito ?? '')) && (!segmentos.length || segmentos.includes(x.segmento ?? '')))
  }, [episodios, filtros, segmentos])

  if (error) return <div className="error-pantalla">No se pudieron cargar las coreografías: {error}</div>
  if (cargando || !episodios || !fpd || !config || !corte) return <p className="vacio">Cargando las coreografías…</p>

  const umbralVerde = config.umbral_verde ?? 0.9
  const umbralAmarillo = config.umbral_amarillo ?? 0.7
  const tono = (x: number | null) => (x === null ? 'neutro' : x >= umbralVerde ? 'bueno' : x >= umbralAmarillo ? 'alerta' : 'malo')
  const total = co.fila(filtrados)
  const nombreGestor = (g: string) => usuarios.get(g) ?? g

  const grupos = co.agrupar(filtrados, CLAVE_DESGLOSE[desglose])
  const filasDesglose = [...grupos.entries()].sort((a, b) => b[1].episodios - a[1].episodios).map(([k, f]) => ({
    etiqueta: desglose === 'Gestor' ? nombreGestor(k) : k,
    valores: [f.episodios, f.saldo, f.pasos.coreografia, f.pasos.paso_gestion_d1, f.pasos.paso_visita,
      f.pasos.paso_promesa_pago, f.pctRecuperados, f.alertas],
  }))

  // Semana de entrada: episodios y % de coreografía.
  const semanas = [...new Set(filtrados.map((x) => x.semana ?? ''))].filter(Boolean).sort()
  const porSemana = semanas.map((s) => co.fila(filtrados.filter((x) => x.semana === s)))
  const grafico: Data[] = [
    { type: 'bar', name: 'Episodios', x: semanas.map((s) => fecha(s)), y: porSemana.map((f) => f.episodios), marker: { color: '#aeb6ec' } } as unknown as Data,
    { type: 'scatter', mode: 'lines+markers', name: '% coreografía', x: semanas.map((s) => fecha(s)),
      y: porSemana.map((f) => f.pasos.coreografia), yaxis: 'y2', line: { color: '#1f2a66', width: 2 } } as unknown as Data,
  ]

  const fuera = filtrados.filter((x) => x.coreografia === co.NO_CUMPLE || (x.estado === co.ABIERTO && x.alerta_sin_gestion))
    .sort((a, b) => (b.dias_desde_fallo ?? -1) - (a.dias_desde_fallo ?? -1))

  // FPD por clase, con los filtros de supervisor y gestor del menú.
  const sup = filtros?.supervisor ?? []
  const fpdFiltrado = fpd.filter((x) => !sup.length || sup.includes(x.supervisor ?? ''))
  const fechaMedida = fpdFiltrado[0]?.fecha_evaluacion ?? null
  const clases = [...new Set(fpdFiltrado.map((x) => x.clase ?? ''))].sort()
  const fpdTotal = co.fpdResumen(fpdFiltrado, presupuesto)

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Coreografías de gestión</h1>
      <p className="dc-desc">
        Cumplimiento de la coreografía desde el primer día en mora (FPD, Prórroga y PYME) y FPD por cosecha contra presupuesto.
      </p>
      <Nota texto={`Episodios que entran en mora del ${fecha(`${periodo}-01`)} al ${fecha(corte)}. Calculados en la carga mensual con el motor del tablero; la mora del cierre anterior viene del loantape (días de mora de inicio).`} />

      <div className="dc-tarjeta">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <MultiSelect etiqueta="Segmento" opciones={[...co.SEGMENTOS]} valor={segmentos} onChange={setSegmentos} placeholder="Todos los segmentos" />
          <SelectBox etiqueta="Desglose" opciones={DESGLOSES.map((d) => ({ valor: d, etiqueta: d }))} valor={desglose} onChange={setDesglose} />
        </div>
      </div>

      <FilaKpi>
        <Kpi etiqueta="Episodios" valor={entero(total.episodios)} detalle={`saldo ${dinero(total.saldo)}`} tono="info" />
        <Kpi etiqueta="Coreografía completa" valor={pct(total.pasos.coreografia)} detalle={`${entero(total.pendientes)} pendientes`} tono={tono(total.pasos.coreografia)} />
        <Kpi etiqueta="Gestión Call Center día 1" valor={pct(total.pasos.paso_gestion_d1)} tono={tono(total.pasos.paso_gestion_d1)} />
        <Kpi etiqueta="Visita a tiempo" valor={pct(total.pasos.paso_visita)} detalle="sin acuerdo el día 1" tono={tono(total.pasos.paso_visita)} />
        <Kpi etiqueta="Pagó lo que prometió" valor={pct(total.pasos.paso_promesa_pago)} detalle={`≤ ${entero(config.dias_max_promesa ?? 5)} días`} tono={tono(total.pasos.paso_promesa_pago)} />
        <Kpi etiqueta="Recuperados" valor={pct(total.pctRecuperados)} detalle={`${entero(total.recuperados)} episodios`} tono="bueno" />
        <Kpi etiqueta="Alertas sin gestión" valor={entero(total.alertas)} detalle={`≥ ${entero(config.dias_alerta_sin_gestion ?? 3)} días seguidos`} tono="malo" />
      </FilaKpi>
      <Nota texto={`Verde desde ${pct(umbralVerde, 0)}, amarillo desde ${pct(umbralAmarillo, 0)}. Entradas fuera de alcance: ${entero(total.fueraAlcance)}.`} />

      <Tabla titulo={`Cumplimiento por ${desglose.toLowerCase()}`} etiquetaFila={desglose}
        cabeceras={[
          { etiqueta: 'Episodios', formato: entero }, { etiqueta: 'Saldo de entrada', formato: (x) => dinero(x) },
          { etiqueta: 'Coreografía completa', formato: (x) => pct(x) }, { etiqueta: 'Gestión CC día 1', formato: (x) => pct(x) },
          { etiqueta: 'Visita a tiempo', formato: (x) => pct(x) }, { etiqueta: 'Pagó lo que prometió', formato: (x) => pct(x) },
          { etiqueta: '% recuperados', formato: (x) => pct(x) }, { etiqueta: 'Alertas sin gestión', formato: entero },
        ]}
        filas={filasDesglose}
        total={{ etiqueta: 'Total', valores: [total.episodios, total.saldo, total.pasos.coreografia, total.pasos.paso_gestion_d1,
          total.pasos.paso_visita, total.pasos.paso_promesa_pago, total.pctRecuperados, total.alertas] }} />
      <p style={{ fontSize: 12, marginTop: -8 }}>Total recalculado sobre todos los episodios. % = cumple ÷ (cumple + no cumple); los pendientes y los motivos no entran.</p>

      <Tabla titulo="Estado de cada paso (episodios)" etiquetaFila="Paso"
        cabeceras={[{ etiqueta: 'Cumple', formato: entero }, { etiqueta: 'No cumple', formato: entero }, { etiqueta: 'Pendiente', formato: entero }]}
        filas={co.conteoPasos(filtrados).map((p) => ({
          etiqueta: p.paso,
          valores: [p.estados[co.CUMPLE] ?? 0, p.estados[co.NO_CUMPLE] ?? 0, p.estados[co.PENDIENTE] ?? 0],
        }))} />

      {semanas.length > 0 && (
        <div className="dc-tarjeta">
          <Titulo texto="Episodios y cumplimiento por semana de entrada" />
          <Plot data={grafico} layout={{
            height: 320, hovermode: 'x unified', paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
            margin: { l: 48, r: 56, t: 16, b: 40 }, legend: { orientation: 'h', y: -0.2 },
            yaxis: { rangemode: 'tozero' }, yaxis2: { overlaying: 'y', side: 'right', tickformat: '.0%', range: [0, 1], showgrid: false },
            xaxis: { type: 'category' },
          } as unknown as Partial<Layout>} config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
        </div>
      )}

      <div className="dc-tarjeta">
        <Titulo texto={`Episodios fuera de coreografía (${entero(fuera.length)})`} />
        <p style={{ fontSize: 12 }}>No cumplen algún paso, o siguen abiertos con la alerta de días sin gestión.</p>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="dc-tabla">
            <thead>
              <tr><th>Crédito</th><th>Segmento</th><th>Clase</th><th>Gestor</th><th>Supervisor</th><th>Entrada</th>
                <th>Estado</th><th>Coreografía</th><th>Paso fallido</th><th>Días desde el fallo</th><th>Días sin gestión (máx.)</th><th>Saldo de entrada</th></tr>
            </thead>
            <tbody>
              {fuera.map((x) => (
                <tr key={`${x.credito}|${x.fecha_entrada}`}>
                  <td>{x.credito}</td><td>{x.segmento ?? '—'}</td><td>{x.clase ?? '—'}</td><td>{nombreGestor(x.gestor ?? '')}</td>
                  <td>{x.supervisor ?? '—'}</td><td>{fecha(x.fecha_entrada)}</td><td>{x.estado ?? '—'}</td><td>{x.coreografia ?? '—'}</td>
                  <td>{x.paso_fallido ?? 'Días sin gestión'}</td><td>{x.dias_desde_fallo ?? '—'}</td>
                  <td>{x.dias_sin_gestion_max ?? '—'}</td><td>{dinero(x.saldo_entrada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dc-tarjeta">
        <Titulo texto={`FPD · cosecha ${periodo}${fechaMedida ? ` · medido al ${fecha(fechaMedida)}` : ''}`} />
        <p style={{ fontSize: 12 }}>
          Cosecha renovada el mes anterior con primera cuota en este mes, sin restructurados. Tasa FPD = monto del pagaré de las
          FPD ÷ monto del pagaré de las que ciclaron. Cumplimiento = presupuesto ÷ tasa real (meta 100 %, tope 200 %).
        </p>
        {fpdFiltrado.length === 0 ? <Nota tipo="alerta" texto="Sin cuentas de la cosecha que hayan ciclado a esta fecha." /> : (
          <>
            <FilaKpi>
              <Kpi etiqueta="Cuentas que ciclaron" valor={entero(fpdTotal.cuentas)} detalle={`pagaré ${dinero(fpdTotal.saldoPagare)} · ${entero(fpdTotal.vencen)} vencieron el día medido`} tono="info" />
              <Kpi etiqueta="Cuentas FPD" valor={entero(fpdTotal.fpd)} detalle={dinero(fpdTotal.pagareFpd)} tono="malo" />
              <Kpi etiqueta="Tasa FPD (pagaré)" valor={pct(fpdTotal.tasa, 2)} detalle={presupuesto !== null ? `presupuesto ${pct(presupuesto, 2)}` : 'sin presupuesto cargado'} tono="alerta" />
              <Kpi etiqueta="Cumplimiento" valor={pct(fpdTotal.cumplimiento, 2)} detalle="meta 100 %" tono={fpdTotal.cumplimiento === null ? 'neutro' : fpdTotal.cumplimiento >= 1 ? 'bueno' : 'malo'} />
            </FilaKpi>
            <Tabla titulo="FPD por clase de crédito" etiquetaFila="Clase de crédito"
              cabeceras={[
                { etiqueta: 'Cuentas', formato: entero }, { etiqueta: 'Saldo pagaré', formato: (x) => dinero(x) },
                { etiqueta: 'Vencen el día medido', formato: entero }, { etiqueta: 'Cuentas FPD', formato: entero },
                { etiqueta: 'Pagaré FPD', formato: (x) => dinero(x) }, { etiqueta: 'Tasa FPD', formato: (x) => pct(x, 2) },
              ]}
              filas={clases.map((c) => {
                const f = co.fpdResumen(fpdFiltrado.filter((x) => (x.clase ?? '') === c), presupuesto)
                return { etiqueta: c || '(sin dato)', valores: [f.cuentas, f.saldoPagare, f.vencen, f.fpd, f.pagareFpd, f.tasa] }
              })}
              total={{ etiqueta: 'Total', valores: [fpdTotal.cuentas, fpdTotal.saldoPagare, fpdTotal.vencen, fpdTotal.fpd, fpdTotal.pagareFpd, fpdTotal.tasa] }} />
          </>
        )}
      </div>
    </>
  )
}
