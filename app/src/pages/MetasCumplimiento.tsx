import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import * as adm from '../lib/administracion'
import type { Asignacion, MetaUsuario, Usuario } from '../lib/administracion'
import { factorProrrateo, PESOS_DIAS, UMBRAL_AMARILLO, UMBRAL_VERDE, semaforo } from '../lib/prorrateo'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { Grafico, Nota } from '../components/Bloques'
import * as met from '../lib/metas'
import type { Data, Layout } from 'plotly.js'

// Metas y cumplimiento (modules/metas.py). Pendiente: PRP (con y sin SGL), monto pagado, cumplimiento diario, embudo y
// ranking por tramo. Las metas vienen de Administración; la mensual de gestiones se deriva de la diaria si falta.

const VISTAS: { valor: met.TipoMeta; etiqueta: string }[] = [
  { valor: 'agente', etiqueta: 'Agentes de call center' },
  { valor: 'visitador', etiqueta: 'Visitadores' },
]
const COLOR = { Verde: '#3FA04E', Amarillo: '#F5B544', Rojo: '#E25C52', 'Sin meta': '#C7CBD8' } as const

function formatear(x: number | null, f: met.Indicador['formato']): string {
  if (x === null) return '—'
  if (f === 'dinero') return dinero(x)
  if (f === 'decimal') return x.toLocaleString('es-SV', { maximumFractionDigits: 2 })
  return entero(x)
}

export default function MetasCumplimiento() {
  const { fecha: corte, fechaBase, cargando } = useDatos()
  const periodo = corte ? corte.slice(0, 7) : ''
  const [tipo, setTipo] = useState<met.TipoMeta>('agente')
  const indicadores = met.INDICADORES[tipo]
  const [indicador, setIndicador] = useState<string>('gestiones')
  const [verInactivos, setVerInactivos] = useState(false)
  const [supervisor, setSupervisor] = useState('')
  const [departamento, setDepartamento] = useState('')
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

  const ind = indicadores.find((i) => i.clave === indicador) ?? indicadores[0]
  const factor = corte && periodo ? factorProrrateo(`${periodo}-01`, corte) : 1

  const real = useMemo(() => {
    if (!gestiones || !visitas || !corte) return new Map<string, met.Real>()
    return tipo === 'agente' ? met.realAgentes(gestiones, corte) : met.realVisitadores(visitas, corte)
  }, [gestiones, visitas, corte, tipo])

  if (error) return <div className="error-pantalla">No se pudieron cargar las metas: {error}</div>
  if (cargando || !usuarios || !gestiones || !visitas || !corte || !fechaBase) return <p className="vacio">Cargando las metas…</p>

  const asignacion = (uid: number): Asignacion | null =>
    asig.filter((a) => a.usuario_id === uid && a.periodo <= periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null
  const supervisores = [...new Set(asig.map((a) => a.supervisor).filter((s): s is string => !!s))].sort()

  const filas = usuarios
    .filter((u) => u.tipo === tipo && (verInactivos || u.estado === 'activo'))
    .map((u) => {
      const a = asignacion(u.id)
      const r = real.get(met.normalizarUsuario(tipo, u.usuario_norm))?.[ind.clave] ?? 0
      const m = metas.find((x) => x.usuario_id === u.id && x.indicador === ind.clave)
      const meta = m?.valor_meta ?? null
      const metaAFecha = meta === null ? null : ind.acumulable ? meta * factor : meta
      const c = met.cumplimiento(r, metaAFecha)
      const sem = semaforo(c)
      return { u, a, r, meta, derivada: !!m?.derivada, metaAFecha, c, sem }
    })
    .filter((x) => (!supervisor || x.a?.supervisor === supervisor) && (!departamento || x.a?.departamento === departamento))
    .sort((x, y) => (y.c ?? -1) - (x.c ?? -1))

  const conMeta = filas.filter((x) => x.meta !== null)
  const cuenta = (s: 'Verde' | 'Amarillo' | 'Rojo') => conMeta.filter((x) => x.sem === s).length
  const nombre = (x: (typeof filas)[number]) => x.u.nombre_mostrado || x.u.usuario_norm

  const grafico: Data[] = [{
    type: 'bar', orientation: 'h',
    y: conMeta.map(nombre),
    x: conMeta.map((x) => x.c ?? 0),
    marker: { color: conMeta.map((x) => (x.sem ? COLOR[x.sem] : COLOR['Sin meta'])) },
    hovertemplate: '%{y}: %{x:.0%}<extra></extra>',
  } as unknown as Data]

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h1>Metas y cumplimiento</h1>
          <p className="dc-desc">Real contra meta del mes a la fecha de seguimiento. Las metas se administran en Administración.</p>
        </div>
        <div className="pastillas" role="tablist">
          {VISTAS.map((v) => (
            <button key={v.valor} className={`pastilla${tipo === v.valor ? ' activa' : ''}`} onClick={() => setTipo(v.valor)}>
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="tira-kpi">
        <div className="kpi-tarjeta"><span>Mes {periodo}</span><strong>{pct(factor, 0)}</strong><small>transcurrido al {fecha(corte)}</small></div>
        <div className="kpi-tarjeta"><span>Usuarios con meta</span><strong>{entero(conMeta.length)}</strong><small>de {entero(filas.length)} en la lista</small></div>
        <div className="kpi-tarjeta verde"><span>Verde</span><strong>{entero(cuenta('Verde'))}</strong><small>≥ {pct(UMBRAL_VERDE, 0)}</small></div>
        <div className="kpi-tarjeta amarillo"><span>Amarillo</span><strong>{entero(cuenta('Amarillo'))}</strong><small>≥ {pct(UMBRAL_AMARILLO, 0)}</small></div>
        <div className="kpi-tarjeta rojo"><span>Rojo</span><strong>{entero(cuenta('Rojo'))}</strong><small>por debajo</small></div>
      </div>

      <div className="dc-tarjeta filtros-metas">
        <label className="campo-simple">Indicador
          <select value={indicador} onChange={(e) => setIndicador(e.target.value)}>
            {indicadores.map((i) => <option key={i.clave} value={i.clave}>{i.etiqueta}</option>)}
          </select>
        </label>
        {tipo === 'agente' && (
          <>
            <label className="campo-simple">Supervisor
              <select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
                <option value="">Todos</option>
                {supervisores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="campo-simple">Departamento
              <select value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
                <option value="">Todos</option>
                <option value="Administrativa">Administrativa</option>
                <option value="Legal">Legal</option>
              </select>
            </label>
          </>
        )}
        <label className="casilla"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Incluir inactivos</label>
      </div>

      {filas.length === 0 ? <Nota tipo="alerta" texto="No hay usuarios con estos filtros." /> : (
        <div className="dc-tarjeta">
          <div className="ventana">
            <table className="tabla-metas">
              <thead>
                <tr>
                  <th>Usuario</th>
                  {tipo === 'agente' && <th>Supervisor</th>}
                  <th className="num">Meta del mes</th>
                  <th className="num">Meta a la fecha</th>
                  <th className="num">Real</th>
                  <th className="num">Diferencia</th>
                  <th style={{ minWidth: 220 }}>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((x) => {
                  const ancho = x.c === null ? 0 : Math.min(x.c, 1.5) / 1.5 * 100
                  const color = x.sem ? COLOR[x.sem] : COLOR['Sin meta']
                  return (
                    <tr key={x.u.id}>
                      <td className="nombre">{nombre(x)}</td>
                      {tipo === 'agente' && <td>{x.a?.supervisor ?? '—'}</td>}
                      <td className="num">{x.meta === null ? '—' : <>{formatear(x.meta, ind.formato)}{x.derivada && <em title="Derivada de la meta diaria">*</em>}</>}</td>
                      <td className="num">{formatear(x.metaAFecha, ind.formato)}</td>
                      <td className="num">{formatear(x.r, ind.formato)}</td>
                      <td className="num">{x.metaAFecha === null ? '—' : formatear(x.r - x.metaAFecha, ind.formato)}</td>
                      <td>
                        <div className="progreso">
                          <div className="progreso-barra"><span style={{ width: `${ancho}%`, background: color }} /></div>
                          <b style={{ color: x.sem ? color : '#8A8FA6' }}>{x.c === null ? 'Sin meta' : pct(x.c)}</b>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="pie-tabla">
            Verde ≥ {pct(UMBRAL_VERDE, 0)}, amarillo ≥ {pct(UMBRAL_AMARILLO, 0)}, rojo debajo. * Meta mensual derivada de la diaria
            (día hábil × días del mes). {ind.acumulable ? '' : 'Promedio diario: la meta no se prorratea.'}
          </p>
        </div>
      )}

      {conMeta.length > 0 && (
        <Grafico titulo={`Cumplimiento · ${ind.etiqueta}`} alto={Math.min(560, 80 + 26 * conMeta.length)} data={grafico}
          layout={{ xaxis: { tickformat: '.0%' }, margin: { l: 180, r: 16, t: 16, b: 40 } } as Partial<Layout>} />
      )}
    </>
  )
}
