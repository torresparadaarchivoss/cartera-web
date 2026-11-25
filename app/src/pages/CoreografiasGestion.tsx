import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CoreoEpisodio, CoreoFpdFila } from '../lib/datos'
import * as adm from '../lib/administracion'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Plot, Tabla, Titulo } from '../components/Bloques'
import { MultiSelect, SelectBox } from '../components/Selectores'
import { descargarExcel } from '../lib/exportar'
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
  const [roles, setRoles] = useState<Map<string, string>>(new Map())
  const [gestiones, setGestiones] = useState<datos.GestionMes[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [segmentos, setSegmentos] = useState<string[]>([])
  const [desglose, setDesglose] = useState<Desglose>('Segmento')

  useEffect(() => {
    Promise.all([datos.coreoEpisodios(), datos.coreoFpd(), adm.usuarios()])
      .then(([e, f, u]) => {
        setEpisodios(e)
        setFpd(f)
        setUsuarios(new Map(u.map((x) => [x.usuario_norm.toLowerCase(), x.nombre_mostrado || x.usuario_norm] as const)))
        setRoles(new Map(u.map((x) => [x.usuario_norm.toLowerCase(), x.rol ?? 'agente'] as const)))
      })
      .catch((e: Error) => setError(e.message))
    datos.gestionesMes().then(setGestiones).catch((e: Error) => setError(e.message))
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
  const nombreGestor = (g: string) => usuarios.get(g.toLowerCase()) ?? g

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

  const descargarTodo = () => {
    const hojaFuera = fuera.map((x) => ({
      Crédito: x.credito, Segmento: x.segmento ?? '', Clase: x.clase ?? '', Gestor: nombreGestor(x.gestor ?? ''),
      Supervisor: x.supervisor ?? '', Entrada: x.fecha_entrada, Estado: x.estado ?? '', Coreografía: x.coreografia ?? '',
      'Paso fallido': x.paso_fallido ?? 'Días sin gestión', 'Días desde el fallo': x.dias_desde_fallo ?? '',
      'Días sin gestión (máx.)': x.dias_sin_gestion_max ?? '', 'Saldo de entrada': x.saldo_entrada ?? '',
    }))
    const hojaFpd = fpdFiltrado.map((x) => ({
      Crédito: x.credito, Clase: x.clase ?? '', Supervisor: x.supervisor ?? '', Gestor: nombreGestor(x.gestor ?? ''),
      'Fecha de renovación': x.fecha_renov ?? '', 'Primera cuota': x.primera_cuota ?? '', 'Día medido': x.fecha_evaluacion ?? '',
      'Venció el día medido': x.vence_corte ? 'Sí' : 'No', FPD: x.fpd ? 'Sí' : 'No', 'Monto pagaré': x.saldopagare ?? '',
    }))
    descargarExcel(`coreografias_${periodo}.xlsx`, [{ nombre: 'Fuera de coreografía', filas: hojaFuera }, { nombre: 'Cosecha FPD', filas: hojaFpd }])
  }

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
        <Kpi etiqueta="Vencidas sin recuperar" valor={entero(filtrados.filter((x) => x.estado === 'Vencido sin recuperar').length)} detalle="ya pasó el plazo de visita" tono="malo" />
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

      {/* Secciones del spec dentro de esta misma página: embudo PYME y Prórroga, y distribución de promesas y brechas. */}
      {['PYME', 'Prórroga'].map((seg) => {
        const xs = filtrados.filter((x) => x.segmento === seg)
        if (xs.length === 0) return null
        const cumple = (k: keyof CoreoEpisodio) => xs.filter((x) => x[k] === co.CUMPLE).length
        const etapas = ['Entra en mora', 'Gestión CC día 1', 'Acuerdo día 1', 'Visita a tiempo', 'Call Center + campo', 'Promesa ≤ 5 días', 'Recuperado']
        const valores = [xs.length, cumple('paso_gestion_d1'), cumple('paso_acuerdo_d1'), cumple('paso_visita'),
          cumple('paso_combinado'), cumple('paso_promesa_pago'), xs.filter((x) => x.estado === co.RECUPERADO).length]
        return (
          <div className="dc-tarjeta" key={seg}>
            <Titulo texto={`Embudo de la coreografía · ${seg}`} />
            <Plot data={[{ type: 'funnel', y: etapas, x: valores, textinfo: 'value+percent initial' } as unknown as Data]}
              layout={{ height: 320, margin: { l: 150, r: 16, t: 16, b: 16 } } as Partial<Layout>}
              config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
          </div>
        )
      })}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="dc-tarjeta">
          <Titulo texto="Días de la promesa a pago" />
          <table className="dc-tabla">
            <thead><tr><th>Días</th><th>Episodios</th></tr></thead>
            <tbody>
              {[
                ['0 a 2', (x: CoreoEpisodio) => x.dias_promesa_pago !== null && x.dias_promesa_pago <= 2],
                ['3 a 5', (x: CoreoEpisodio) => x.dias_promesa_pago !== null && x.dias_promesa_pago > 2 && x.dias_promesa_pago <= 5],
                ['Más de 5', (x: CoreoEpisodio) => x.dias_promesa_pago !== null && x.dias_promesa_pago > 5],
                ['Sin promesa', (x: CoreoEpisodio) => x.dias_promesa_pago === null],
              ].map(([etq, f]) => (
                <tr key={etq as string}><td>{etq as string}</td><td>{entero(filtrados.filter(f as (x: CoreoEpisodio) => boolean).length)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dc-tarjeta">
          <Titulo texto="Brechas sin gestión (máximo dentro del episodio)" />
          <table className="dc-tabla">
            <thead><tr><th>Días</th><th>Episodios</th></tr></thead>
            <tbody>
              {[
                ['0 a 3', (x: CoreoEpisodio) => x.dias_sin_gestion_max !== null && x.dias_sin_gestion_max <= 3],
                ['4 a 7', (x: CoreoEpisodio) => x.dias_sin_gestion_max !== null && x.dias_sin_gestion_max > 3 && x.dias_sin_gestion_max <= 7],
                ['8 a 15', (x: CoreoEpisodio) => x.dias_sin_gestion_max !== null && x.dias_sin_gestion_max > 7 && x.dias_sin_gestion_max <= 15],
                ['Más de 15', (x: CoreoEpisodio) => x.dias_sin_gestion_max !== null && x.dias_sin_gestion_max > 15],
              ].map(([etq, f]) => (
                <tr key={etq as string}><td>{etq as string}</td><td>{entero(filtrados.filter(f as (x: CoreoEpisodio) => boolean).length)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {gestiones && (
        <div className="dc-tarjeta">
          <Titulo texto="Productividad por gestor · Call Center y campo" />
          <p style={{ fontSize: 12 }}>Campo: usuarios con rol visitador (sus gestiones de McCollect). Call Center: el resto. Episodios y cumplimiento: los episodios de los que es gestor asignado.</p>
          <div className="ventana">
            <table className="dc-tabla">
              <thead><tr><th>Usuario</th><th>Canal</th><th>Gestiones</th><th>Contactos</th><th>RPC</th><th>PRP</th><th>Episodios</th><th>% coreografía</th></tr></thead>
              <tbody>
                {[...new Set(gestiones.map((g) => g.usuario.trim().toLowerCase()))]
                  .filter((u) => u && !['arrivasg', 'cdhidalgog', 'eabaltodanom', 'gssolag', 'instacredit', 'jmcastillod', 'mggutierrezl', 'mncanasg'].includes(u))
                  .map((u) => {
                    const xs = gestiones.filter((g) => g.usuario.trim().toLowerCase() === u && g.fecha_actividad.slice(0, 10) <= corte)
                    const eps = filtrados.filter((x) => (x.gestor ?? '').trim().toLowerCase() === u)
                    const f = co.fila(eps)
                    return { u, campo: roles.get(u) === 'visitador',
                      g: xs.length, c: xs.reduce((a, x) => a + x.contacto, 0), r: xs.reduce((a, x) => a + x.rpc, 0),
                      p: xs.reduce((a, x) => a + x.prp, 0), e: eps.length, cumple: f.pasos.coreografia }
                  })
                  .sort((a, b) => b.g - a.g)
                  .map((x) => (
                    <tr key={x.u}>
                      <td>{nombreGestor(x.u)}</td><td>{x.campo ? 'Campo' : 'Call Center'}</td><td>{entero(x.g)}</td>
                      <td>{entero(x.c)}</td><td>{entero(x.r)}</td><td>{entero(x.p)}</td><td>{entero(x.e)}</td><td>{pct(x.cumple)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="dc-tarjeta">
        <Titulo texto="Acción de hoy" />
        <table className="dc-tabla">
          <thead><tr><th>Acción</th><th>Episodios</th><th>Saldo de entrada</th></tr></thead>
          <tbody>
            {['Urgente', 'Visitar hoy', 'Llamar hoy', 'Sin acción hoy'].map((acc) => {
              const xs = filtrados.filter((x) => x.accion === acc)
              return (
                <tr key={acc}>
                  <td>{acc}</td><td>{entero(xs.length)}</td><td>{dinero(xs.reduce((t, x) => t + (x.saldo_entrada ?? 0), 0))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ fontSize: 12 }}>Urgente: vencida sin recuperar. Visitar hoy y Llamar hoy: abierta dentro del plazo. Sin acción hoy: abierta sin alerta.</p>
      </div>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Titulo texto={`Episodios fuera de coreografía (${entero(fuera.length)})`} />
          <button className="boton" onClick={descargarTodo}>Descargar Excel</button>
        </div>
        <p style={{ fontSize: 12 }}>No cumplen algún paso, o siguen abiertos con la alerta de días sin gestión.</p>
        <div className="ventana">
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
