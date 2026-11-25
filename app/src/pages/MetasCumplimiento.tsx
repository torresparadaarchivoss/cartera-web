import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import * as adm from '../lib/administracion'
import type { Asignacion, MetaUsuario, Usuario } from '../lib/administracion'
import { CELDA_SEM, PESOS_DIAS, PUNTO_SEM, factorProrrateo } from '../lib/prorrateo'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Plot, Titulo } from '../components/Bloques'
import { Radios, SelectBox } from '../components/Selectores'
import * as met from '../lib/metas'
import type { Data, Layout } from 'plotly.js'

// Metas y cumplimiento (modules/metas.py). Misma estructura que el Streamlit: indicadores, «Meta contra resultado» con
// su fila Total, ranking y gráfico. Pendiente: embudo de gestión (agentes) y cumplimiento diario.

const VISTAS = ['Agentes de call center', 'Visitadores'] as const
const MOSTRAR = ['% de la meta', 'Cantidad'] as const
const UMBRAL_VERDE = 1
const UMBRAL_AMARILLO = 0.8
const ESC: Record<string, string> = { Rojo: CELDA_SEM.Rojo, Amarillo: CELDA_SEM.Amarillo, Verde: CELDA_SEM.Verde }

function fmt(x: number | null | undefined, f: met.Indicador['formato']): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—'
  if (f === 'dinero') return dinero(x)
  if (f === 'decimal') return x.toLocaleString('es-SV', { maximumFractionDigits: 2 })
  return entero(x)
}

export default function MetasCumplimiento() {
  const { fecha: corte, fechaBase, cargando } = useDatos()
  const periodo = corte ? corte.slice(0, 7) : ''
  const [vista, setVista] = useState<(typeof VISTAS)[number]>(VISTAS[0])
  const tipo: met.TipoMeta = vista === 'Visitadores' ? 'visitador' : 'agente'
  const indicadores = met.INDICADORES[tipo]
  const [indicador, setIndicador] = useState('gestiones')
  const [mostrar, setMostrar] = useState<(typeof MOSTRAR)[number]>(MOSTRAR[0])
  const [verInactivos, setVerInactivos] = useState(false)
  const [supervisor, setSupervisor] = useState('')
  const [departamento, setDepartamento] = useState('')
  const [embudo, setEmbudo] = useState('')
  const [medidaDia, setMedidaDia] = useState(Object.keys(met.MEDIDAS_DIARIAS)[0])
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [asig, setAsig] = useState<Asignacion[]>([])
  const [metas, setMetas] = useState<(MetaUsuario & { derivada?: boolean })[]>([])
  const [gestiones, setGestiones] = useState<datos.GestionMes[] | null>(null)
  const [visitas, setVisitas] = useState<datos.VisitaDetalle[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([adm.usuarios(), adm.asignaciones(), datos.gestionesMes(), datos.visitasMes()])
      .then(([u, a, g, v]) => {
        setUsuarios(u)
        setAsig(a)
        setGestiones(g)
        setVisitas(v)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!periodo) return
    adm.metasUsuario(periodo)
      .then((m) => setMetas(met.completarGestiones(m, periodo, PESOS_DIAS) as (MetaUsuario & { derivada?: boolean })[]))
      .catch((e: Error) => setError(e.message))
  }, [periodo])

  useEffect(() => {
    if (!indicadores.some((i) => i.clave === indicador)) setIndicador(indicadores[0].clave)
  }, [tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const asignacion = (uid: number): Asignacion | null =>
    asig.filter((a) => a.usuario_id === uid && a.periodo <= periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null

  const ev = useMemo(() => {
    if (!usuarios || !gestiones || !visitas || !corte) return []
    const base = usuarios.filter((u) => u.tipo === tipo && (verInactivos || u.estado === 'activo'))
      .filter((u) => {
        const a = asig.filter((x) => x.usuario_id === u.id && x.periodo <= periodo)
          .sort((x, y) => y.periodo.localeCompare(x.periodo))[0]
        return (!supervisor || a?.supervisor === supervisor) && (!departamento || a?.departamento === departamento)
      })
    const lista = base.map((u) => ({ id: u.id, nombre: u.nombre_mostrado || u.usuario_norm }))
    const norm = new Map(base.map((u) => [u.id, u.usuario_norm] as const))
    const acum = tipo === 'agente' ? met.realAgentes(gestiones, corte) : met.realVisitadores(visitas, gestiones, corte)
    const dia = tipo === 'agente' ? met.realAgentes(gestiones, corte, true) : met.realVisitadores(visitas, gestiones, corte, true)
    const factor = factorProrrateo(`${periodo}-01`, corte)
    return met.evaluar(tipo, lista, metas, acum, dia, norm, factor, UMBRAL_VERDE, UMBRAL_AMARILLO)
  }, [usuarios, gestiones, visitas, corte, tipo, verInactivos, supervisor, departamento, metas, asig, periodo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="error-pantalla">No se pudieron cargar las metas: {error}</div>
  if (cargando || !usuarios || !gestiones || !visitas || !corte || !fechaBase) return <p className="vacio">Cargando las metas…</p>

  const factor = factorProrrateo(`${periodo}-01`, corte)
  const ind = indicadores.find((i) => i.clave === indicador) ?? indicadores[0]
  const porcentaje = mostrar === '% de la meta'
  const supervisores = [...new Set(asig.map((a) => a.supervisor).filter((s): s is string => !!s))].sort()
  const enIndicador = ev.filter((f) => f.indicador === ind.clave)
    .sort((a, b) => (b.cumplimiento ?? -1) - (a.cumplimiento ?? -1) || a.nombre.localeCompare(b.nombre))
  const conMetaTodos = ev.filter((f) => f.meta_a_fecha !== null)
  const cuenta = (s: 'Verde' | 'Amarillo' | 'Rojo') => conMetaTodos.filter((f) => f.semaforo === s).length
  const usuariosVisibles = new Set(ev.map((f) => f.usuario_id)).size
  const conMetaUsuarios = new Set(conMetaTodos.map((f) => f.usuario_id)).size
  const sinMetas = metas.filter((m) => indicadores.some((i) => i.clave === m.indicador)).length === 0
  const rk = met.ranking(ev)
  const conMeta = enIndicador.filter((f) => f.meta_mes !== null)
  const totReal = conMeta.reduce((a, f) => a + f.real, 0)
  const totMetaFecha = conMeta.reduce((a, f) => a + (f.meta_a_fecha ?? 0), 0)
  const totMetaMes = conMeta.reduce((a, f) => a + (f.meta_mes ?? 0), 0)
  const totCumple = totMetaFecha ? totReal / totMetaFecha : null
  const totAvance = totMetaMes ? totReal / totMetaMes : null
  const totSem = met.semaforoCon(totCumple, UMBRAL_VERDE, UMBRAL_AMARILLO)
  const celda = (s: string | null | undefined) => (s && ESC[s] ? { background: ESC[s], color: '#000' } : {})
  const conGrafico = enIndicador.filter((f) => f.cumplimiento !== null)

  // Embudo del mes a la fecha (modules/metas._embudos): gestiones y cuentas, para el equipo filtrado o un agente.
  const elegido = usuarios.find((u) => u.tipo === 'agente' && u.usuario_norm.toLowerCase() === embudo.toLowerCase())
  const quienes = new Set(
    (elegido ? [elegido] : usuarios.filter((u) => u.tipo === 'agente' && ev.some((f) => f.usuario_id === u.id)))
      .map((u) => u.usuario_norm.trim().toLowerCase()),
  )
  const gEmbudo = gestiones.filter((g) => quienes.has(g.usuario.trim().toLowerCase()) && g.fecha_actividad.slice(0, 10) <= corte)
  const contar = (xs: datos.GestionMes[], pred: (g: datos.GestionMes) => boolean) => new Set(xs.filter(pred).map((g) => g.credito)).size
  const etapasGestiones = ['Gestiones', 'Con contacto', 'RPC', 'Promesas']
  const valoresGestiones = [gEmbudo.length, gEmbudo.reduce((a, g) => a + g.contacto, 0), gEmbudo.reduce((a, g) => a + g.rpc, 0),
    gEmbudo.reduce((a, g) => a + g.promesa_catalogo, 0)]
  const etapasCuentas = ['Cuentas gestionadas', 'Con contacto', 'Con RPC', 'Con promesa']
  const valoresCuentas = [contar(gEmbudo, (g) => g.gestionada === 1), contar(gEmbudo, (g) => g.contacto === 1),
    contar(gEmbudo, (g) => g.rpc === 1), contar(gEmbudo, (g) => g.promesa_catalogo === 1)]
  const colores = ['#2D3A7C', '#4F5BB8', '#F5B544', '#3FA04E']
  const embudoFig = (etapas: string[], valores: number[]): Data[] => [{
    type: 'funnel', y: etapas, x: valores, textinfo: 'value+percent initial', marker: { color: colores },
  } as unknown as Data]
  // Cumplimiento diario (modules/metas._diario): agente × día laborable, con la meta diaria de Administración.
  const agentesFiltrados = usuarios.filter((u) => u.tipo === 'agente' && (verInactivos || u.estado === 'activo'))
    .filter((u) => {
      const a = asig.filter((x) => x.usuario_id === u.id && x.periodo <= periodo).sort((x, y) => y.periodo.localeCompare(x.periodo))[0]
      return (!supervisor || a?.supervisor === supervisor) && (!departamento || a?.departamento === departamento)
    })
  const diasDia = met.diasLaborables(gestiones, periodo, corte, PESOS_DIAS)
  const diario = met.cumplimientoDiario(gestiones, agentesFiltrados.map((u) => ({ id: u.id, norm: u.usuario_norm.toLowerCase() })),
    metas, diasDia, medidaDia, PESOS_DIAS)
  const hayMetaDia = [...diario.habil.values()].some((v) => v !== null)
  const porcentajeDia = porcentaje && hayMetaDia
  const celdaDia = (real: number, meta: number | null) => (meta === null ? { v: null as number | null, sem: null as string | null } : {
    v: real / meta, sem: met.semaforoCon(real / meta, UMBRAL_VERDE, UMBRAL_AMARILLO)})
  const nombreEmbudo = elegido ? (elegido.nombre_mostrado || elegido.usuario_norm) : 'todo el equipo'

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Metas y cumplimiento</h1>
      <p className="dc-desc">Meta contra resultado real del mes a la fecha de seguimiento. Las metas se administran en Administración.</p>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Vista" opciones={[...VISTAS]} valor={vista} onChange={(v) => setVista(v)} />
          <Radios etiqueta="Mostrar" opciones={[...MOSTRAR]} valor={mostrar} onChange={setMostrar} />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Inactivos
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <SelectBox etiqueta="Indicador" opciones={indicadores.map((i) => ({ valor: i.clave, etiqueta: i.etiqueta }))} valor={indicador} onChange={setIndicador} />
          {tipo === 'agente' && (
            <>
              <SelectBox etiqueta="Supervisor" opciones={[{ valor: '', etiqueta: 'Todos' }, ...supervisores.map((s) => ({ valor: s, etiqueta: s }))]} valor={supervisor} onChange={setSupervisor} />
              <SelectBox etiqueta="Departamento" opciones={[{ valor: '', etiqueta: 'Todos' }, { valor: 'Administrativa', etiqueta: 'Administrativa' }, { valor: 'Legal', etiqueta: 'Legal' }]} valor={departamento} onChange={setDepartamento} />
            </>
          )}
        </div>
      </div>

      {sinMetas && <Nota tipo="alerta" texto={`No hay metas mensuales para ${periodo}: se muestran los resultados reales. Asígnalas en Administración.`} />}
      <FilaKpi>
        <Kpi etiqueta="Usuarios" valor={entero(usuariosVisibles)} detalle={verInactivos ? 'todos' : 'activos'} />
        <Kpi etiqueta="Con metas" valor={entero(conMetaUsuarios)} detalle={`${entero(conMetaTodos.length)} indicadores`} />
        <Kpi etiqueta="En verde" valor={entero(cuenta('Verde'))} detalle="indicadores" tono="bueno" />
        <Kpi etiqueta="En amarillo" valor={entero(cuenta('Amarillo'))} detalle="indicadores" tono="alerta" />
        <Kpi etiqueta="En rojo" valor={entero(cuenta('Rojo'))} detalle="indicadores" tono="malo" />
        <Kpi etiqueta="Mes transcurrido" valor={pct(factor)} detalle={`al ${fecha(corte)}`} tono="info" />
      </FilaKpi>
      <Nota texto={`Conteos y montos se comparan con la meta prorrateada a la fecha: ${pct(factor)} del mes transcurrido (lunes a viernes 1, sábado 0,5, domingo 0). Los ratios se comparan con la meta del mes.`} />

      {tipo === 'agente' && (
        <div className="dc-tarjeta">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <Titulo texto={`Cumplimiento diario · ${medidaDia}`} />
            <SelectBox etiqueta="Cumplimiento diario de" valor={medidaDia} onChange={setMedidaDia}
              opciones={Object.keys(met.MEDIDAS_DIARIAS).map((k) => ({ valor: k, etiqueta: k }))} />
          </div>
          {!hayMetaDia && <Nota tipo="alerta" texto={`Sin metas diarias de ${met.MEDIDAS_DIARIAS[medidaDia].base === 'prp' ? 'PRP' : 'gestión'} para ${periodo}: se muestran cantidades. Asígnalas en Administración → Metas por usuario.`} />}
          {diasDia.length === 0 ? <Nota tipo="info" texto="No hay días laborables hasta la fecha de seguimiento." /> : (
            <div className="ventana" style={{ maxHeight: 460 }}>
              <table className="dc-tabla">
                <thead>
                  <tr>
                    <th>Agente</th><th>Supervisor</th><th>Tramo</th><th className="num">Meta hábil</th><th className="num">Meta sábado</th>
                    {diasDia.map((d) => <th key={d}>{d.slice(8, 10)}/{d.slice(5, 7)}</th>)}
                    <th>Mes</th><th>Resultado del mes</th>
                  </tr>
                </thead>
                <tbody>
                  {agentesFiltrados.map((u) => {
                    const fila = diario.filas.get(u.id)
                    const a = asignacion(u.id)
                    let rSum = 0
                    let mSum = 0
                    const celdas = diasDia.map((d) => {
                      const c = fila?.get(d) ?? { real: 0, meta: null }
                      rSum += c.real
                      if (c.meta !== null) mSum += c.meta
                      const cd = celdaDia(c.real, c.meta)
                      return { d, c, cd }
                    })
                    const mes = mSum ? rSum / mSum : null
                    const res = mSum ? (mes! >= UMBRAL_VERDE ? 'Cumple' : 'No cumple') : 'Sin meta'
                    return (
                      <tr key={u.id}>
                        <td>{u.nombre_mostrado || u.usuario_norm}</td>
                        <td>{a?.supervisor ?? '—'}</td><td>{a?.tramo ?? '—'}</td>
                        <td>{diario.habil.get(u.id) == null ? '—' : diario.habil.get(u.id)!.toFixed(1)}</td>
                        <td>{diario.sabado.get(u.id) == null ? '—' : diario.sabado.get(u.id)!.toFixed(1)}</td>
                        {celdas.map(({ d, c, cd }) => (
                          <td key={d} style={cd.sem && porcentajeDia ? { background: ESC[cd.sem] } : {}}>
                            {porcentajeDia ? (cd.v === null ? '—' : pct(cd.v, 0)) : (c.real ? entero(c.real) : '—')}
                          </td>
                        ))}
                        <td style={mes !== null && porcentajeDia ? { background: ESC[met.semaforoCon(mes, UMBRAL_VERDE, UMBRAL_AMARILLO) ?? ''] } : {}}>
                          {porcentajeDia ? (mes === null ? '—' : pct(mes, 0)) : entero(rSum)}
                        </td>
                        <td style={{ color: res === 'Cumple' ? '#3FA04E' : res === 'No cumple' ? '#E25C52' : '#9AA4AF', fontWeight: 700 }}>{res}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12 }}>
            {porcentajeDia ? '% del día = real ÷ meta del día (sábado: meta de sábado). Mes = real del mes ÷ suma de las metas de los días mostrados. ' : 'Cantidades del día. '}
            Días laborables: {diasDia.length} hasta el {fecha(corte)} (días con gestiones de al menos 30 % de los agentes; excluye domingos).
            PRP: códigos PRP. Promesas: marca de promesa del catálogo (sin SGL).
          </p>
        </div>
      )}

      <div className="dc-tarjeta">
        <Titulo texto={`Meta contra resultado · ${ind.etiqueta}`} />
        <div className="ventana" style={{ maxHeight: 420 }}>
          <table className="dc-tabla">
            <thead>
              <tr>
                <th>{tipo === 'agente' ? 'Agente' : 'Visitador'}</th>
                {tipo === 'agente' && <><th>Supervisor</th><th>Tramo</th></>}
                {porcentaje ? (
                  <><th>% cumplimiento</th><th>% avance del mes</th><th>Semáforo</th></>
                ) : (
                  <><th>Real del día</th><th>Real acumulado</th><th>Meta del mes</th><th>Meta a la fecha</th><th>Diferencia</th><th>Semáforo</th></>
                )}
              </tr>
            </thead>
            <tbody>
              {enIndicador.map((f) => {
                const a = asignacion(f.usuario_id)
                return (
                  <tr key={f.usuario_id}>
                    <td>{f.nombre}</td>
                    {tipo === 'agente' && <><td>{a?.supervisor ?? '—'}</td><td>{a?.tramo ?? '—'}</td></>}
                    {porcentaje ? (
                      <>
                        <td style={celda(f.semaforo)}>{f.cumplimiento === null ? '—' : pct(f.cumplimiento)}</td>
                        <td style={celda(met.semaforoCon(f.avance, UMBRAL_VERDE, UMBRAL_AMARILLO))}>{f.avance === null ? '—' : pct(f.avance)}</td>
                        <td>{f.semaforo ? <span style={{ color: PUNTO_SEM[f.semaforo] }}>●</span> : '—'} {f.semaforo ?? ''}</td>
                      </>
                    ) : (
                      <>
                        <td>{fmt(f.real_dia, ind.formato)}</td>
                        <td style={celda(f.semaforo)}>{fmt(f.real, ind.formato)}</td>
                        <td>{fmt(f.meta_mes, ind.formato)}</td>
                        <td>{fmt(f.meta_a_fecha, ind.formato)}</td>
                        <td>{fmt(f.diferencia, ind.formato)}</td>
                        <td>{f.semaforo ? <span style={{ color: PUNTO_SEM[f.semaforo] }}>●</span> : '—'} {f.semaforo ?? ''}</td>
                      </>
                    )}
                  </tr>
                )
              })}
              {ind.acumulable && conMeta.length > 0 && (
                <tr className="total">
                  <td>Total</td>
                  {tipo === 'agente' && <><td /><td /></>}
                  {porcentaje ? (
                    <>
                      <td style={celda(totSem)}>{totCumple === null ? '—' : pct(totCumple)}</td>
                      <td style={celda(met.semaforoCon(totAvance, UMBRAL_VERDE, UMBRAL_AMARILLO))}>{totAvance === null ? '—' : pct(totAvance)}</td>
                      <td>{totSem ?? ''}</td>
                    </>
                  ) : (
                    <>
                      <td>{fmt(conMeta.reduce((a, f) => a + f.real_dia, 0), ind.formato)}</td>
                      <td>{fmt(totReal, ind.formato)}</td>
                      <td>{fmt(totMetaMes, ind.formato)}</td>
                      <td>{fmt(totMetaFecha, ind.formato)}</td>
                      <td>{fmt(totReal - totMetaFecha, ind.formato)}</td>
                      <td>{totSem ?? ''}</td>
                    </>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12 }}>
          % cumplimiento: real acumulado ÷ meta a la fecha. % avance del mes: real ÷ meta del mes. Real del día: solo la fecha de
          seguimiento. Verde ≥ {pct(UMBRAL_VERDE, 0)}, amarillo ≥ {pct(UMBRAL_AMARILLO, 0)}. Sin meta: —.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 2fr) minmax(300px, 3fr)', gap: 16, alignItems: 'start' }}>
        <div className="dc-tarjeta">
          <Titulo texto="Ranking" />
          <table className="dc-tabla">
            <thead><tr><th>Ranking</th><th>Cumplimiento promedio</th><th>Indicadores con meta</th><th>En verde</th></tr></thead>
            <tbody>
              {rk.map((r, i) => (
                <tr key={r.usuario_id}>
                  <td>{i + 1}. {r.nombre}</td>
                  <td style={celda(met.semaforoCon(r.promedio, UMBRAL_VERDE, UMBRAL_AMARILLO))}>{pct(r.promedio)}</td>
                  <td>{entero(r.conMeta)}</td>
                  <td>{entero(r.enVerde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12 }}>Promedio del cumplimiento de los indicadores con meta (tope 200 % por indicador).</p>
        </div>
        <Grafico titulo={`Cumplimiento · ${ind.etiqueta}`} alto={Math.min(560, 80 + 24 * conGrafico.length)}
          data={[{
            type: 'bar', orientation: 'h',
            y: conGrafico.map((f) => f.nombre),
            x: conGrafico.map((f) => f.cumplimiento ?? 0),
            marker: { color: conGrafico.map((f) => (f.semaforo ? PUNTO_SEM[f.semaforo] : '#aeb6ec')) },
            hovertemplate: '%{y}: %{x:.1%}<extra></extra>',
          } as unknown as Data]}
          layout={{ xaxis: { tickformat: '.0%' }, margin: { l: 180, r: 16, t: 16, b: 40 } } as Partial<Layout>} />
      </div>

      {tipo === 'agente' && (
        <div className="dc-tarjeta">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <Titulo texto={`Embudo de gestión · ${nombreEmbudo}`} />
            <SelectBox etiqueta="Embudo de" valor={embudo} onChange={setEmbudo}
              opciones={[{ valor: '', etiqueta: 'Todo el equipo' }, ...usuarios.filter((u) => u.tipo === 'agente' && u.estado === 'activo')
                .map((u) => ({ valor: u.usuario_norm, etiqueta: u.nombre_mostrado || u.usuario_norm }))]} />
          </div>
          {gEmbudo.length === 0 ? <Nota tipo="alerta" texto="Sin gestiones para el embudo con esta selección." /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <div>
                <Titulo texto="En gestiones" />
                <Plot data={embudoFig(etapasGestiones, valoresGestiones)} layout={{ height: 300, margin: { l: 130, r: 16, t: 16, b: 16 } } as Partial<Layout>}
                  config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
              </div>
              <div>
                <Titulo texto="En cuentas" />
                <Plot data={embudoFig(etapasCuentas, valoresCuentas)} layout={{ height: 300, margin: { l: 130, r: 16, t: 16, b: 16 } } as Partial<Layout>}
                  config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
              </div>
            </div>
          )}
          <p style={{ fontSize: 12 }}>Del {fecha(fechaBase)} al {fecha(corte)}. Gestiones: cada registro cuenta. Cuentas: créditos únicos con al menos una gestión de ese tipo. Promesas: sin SGL.</p>
        </div>
      )}


    </>
  )
}
