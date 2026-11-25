import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import * as adm from '../lib/administracion'
import type { Asignacion, MetaUsuario, Usuario } from '../lib/administracion'
import { factorProrrateo, PUNTO_SEM, semaforo, estiloCumpl, UMBRAL_VERDE, UMBRAL_AMARILLO } from '../lib/prorrateo'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Tabla, Titulo } from '../components/Bloques'
import { Radios, SelectBox } from '../components/Selectores'
import * as met from '../lib/metas'
import type { Data, Layout } from 'plotly.js'

// Metas y cumplimiento (modules/metas.py). Pendiente: PRP (con y sin SGL), monto pagado, cumplimiento diario, embudo y
// ranking por tramo. Los resultados reales salen de las gestiones y visitas del mes, sin filtros globales.

const VISTAS = ['Agentes de call center', 'Visitadores'] as const
type Vista = (typeof VISTAS)[number]

function formatear(x: number | null, f: met.Indicador['formato']): string {
  if (x === null) return '—'
  if (f === 'dinero') return dinero(x)
  if (f === 'decimal') return x.toLocaleString('es-SV', { maximumFractionDigits: 2 })
  return entero(x)
}

export default function MetasCumplimiento() {
  const { fecha: corte, fechaBase, cargando } = useDatos()
  const periodo = corte ? corte.slice(0, 7) : ''
  const [vista, setVista] = useState<Vista>(VISTAS[0])
  const tipo: met.TipoMeta = vista === 'Visitadores' ? 'visitador' : 'agente'
  const indicadores = met.INDICADORES[tipo]
  const [indicador, setIndicador] = useState<string>('gestiones')
  const [verInactivos, setVerInactivos] = useState(false)
  const [supervisor, setSupervisor] = useState('')
  const [departamento, setDepartamento] = useState('')
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [asig, setAsig] = useState<Asignacion[]>([])
  const [metas, setMetas] = useState<MetaUsuario[]>([])
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
    adm.metasUsuario(periodo).then(setMetas).catch((e: Error) => setError(e.message))
  }, [periodo])

  const ind = indicadores.find((i) => i.clave === indicador) ?? indicadores[0]
  const factor = corte && periodo ? factorProrrateo(`${periodo}-01`, corte) : 1

  const real = useMemo(() => {
    if (!gestiones || !visitas || !corte) return new Map<string, met.Real>()
    return tipo === 'agente' ? met.realAgentes(gestiones, corte) : met.realVisitadores(visitas, corte)
  }, [gestiones, visitas, corte, tipo])

  if (error) return <div className="error-pantalla">No se pudieron cargar las metas: {error}</div>
  if (cargando || !usuarios || !gestiones || !visitas || !corte || !fechaBase) return <p className="vacio">Cargando las metas…</p>

  // Asignación vigente: la del mes o la del último mes registrado.
  const asignacion = (uid: number): Asignacion | null =>
    asig.filter((a) => a.usuario_id === uid && a.periodo <= periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null

  const supervisores = [...new Set(asig.map((a) => a.supervisor).filter((s): s is string => !!s))].sort()

  const filas = usuarios
    .filter((u) => u.tipo === tipo && (verInactivos || u.estado === 'activo'))
    .map((u) => {
      const a = asignacion(u.id)
      const r = real.get(met.normalizarUsuario(tipo, u.usuario_norm))?.[ind.clave] ?? 0
      const meta = metas.find((m) => m.usuario_id === u.id && m.indicador === ind.clave)?.valor_meta ?? null
      const metaAFecha = meta === null ? null : ind.acumulable ? meta * factor : meta
      const c = met.cumplimiento(r, metaAFecha)
      return { u, a, r, meta, metaAFecha, c, sem: semaforo(c) }
    })
    .filter((x) => (!supervisor || x.a?.supervisor === supervisor) && (!departamento || x.a?.departamento === departamento))
    .sort((x, y) => (y.c ?? -1) - (x.c ?? -1))

  const conMeta = filas.filter((x) => x.meta !== null)
  const cuenta = (s: 'Verde' | 'Amarillo' | 'Rojo') => conMeta.filter((x) => x.sem === s).length
  const nombre = (x: (typeof filas)[number]) => x.u.nombre_mostrado || x.u.usuario_norm

  const tabla = filas.map((x) => ({
    etiqueta: nombre(x),
    valores: [x.meta, x.metaAFecha, x.r, x.metaAFecha === null ? null : x.r - x.metaAFecha, x.c],
  }))

  const grafico: Data[] = [{
    type: 'bar', orientation: 'h',
    y: conMeta.map(nombre),
    x: conMeta.map((x) => x.c ?? 0),
    marker: { color: conMeta.map((x) => (x.sem ? PUNTO_SEM[x.sem] : '#aeb6ec')) },
    hovertemplate: '%{y}: %{x:.0%}<extra></extra>',
  } as unknown as Data]

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Metas y cumplimiento</h1>
      <p className="dc-desc">
        Meta contra resultado real del mes a la fecha de seguimiento. Las metas se administran en Administración.
        Cumplimiento = real ÷ meta a la fecha.
      </p>

      <Nota tipo="alerta" texto="Pendiente: PRP (con y sin SGL), monto pagado por gestor, cumplimiento diario, embudo y ranking por tramo." />
      <Nota texto={`Mes ${periodo} · corte al ${fecha(corte)} · mes transcurrido ${pct(factor)} (lunes a viernes 1, sábado 0,5, domingo 0).`} />

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Vista" opciones={[...VISTAS]} valor={vista} onChange={(v) => {
            setVista(v)
            setIndicador(v === 'Visitadores' ? 'visitas' : 'gestiones')
          }} />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Incluir inactivos
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

      <FilaKpi>
        <Kpi etiqueta="Usuarios" valor={entero(filas.length)} detalle={verInactivos ? 'todos' : 'activos'} />
        <Kpi etiqueta="Con meta" valor={entero(conMeta.length)} detalle={ind.etiqueta} />
        <Kpi etiqueta="En verde" valor={entero(cuenta('Verde'))} detalle={`cumplimiento ≥ ${pct(UMBRAL_VERDE, 0)}`} tono="bueno" />
        <Kpi etiqueta="En amarillo" valor={entero(cuenta('Amarillo'))} detalle={`≥ ${pct(UMBRAL_AMARILLO, 0)}`} tono="alerta" />
        <Kpi etiqueta="En rojo" valor={entero(cuenta('Rojo'))} tono="malo" />
        <Kpi etiqueta="Mes transcurrido" valor={pct(factor)} detalle={`al ${fecha(corte)}`} tono="info" />
      </FilaKpi>

      <Tabla titulo={`Meta contra resultado · ${ind.etiqueta}`} etiquetaFila="Usuario"
        cabeceras={[
          { etiqueta: 'Meta del mes', formato: (x) => formatear(x, ind.formato) },
          { etiqueta: 'Meta a la fecha', formato: (x) => formatear(x, ind.formato) },
          { etiqueta: 'Real', formato: (x) => formatear(x, ind.formato) },
          { etiqueta: 'Diferencia', formato: (x) => formatear(x, ind.formato) },
          { etiqueta: 'Cumplimiento', formato: (x) => (x === null ? 'Sin meta' : pct(x)) },
        ]}
        filas={tabla} />
      <p style={{ fontSize: 12, marginTop: -8 }}>
        Verde ≥ {pct(UMBRAL_VERDE, 0)}, amarillo ≥ {pct(UMBRAL_AMARILLO, 0)}, rojo debajo.
        {ind.acumulable ? '' : ' Indicador de promedio diario: la meta no se prorratea.'}
      </p>

      <div className="dc-tarjeta">
        <Titulo texto="Semáforo por usuario" />
        <table className="dc-tabla">
          <thead><tr><th>Usuario</th><th>Cumplimiento</th><th>Semáforo</th></tr></thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.u.id}>
                <td>{nombre(x)}</td>
                <td style={estiloCumpl(x.c)}>{x.c === null ? 'Sin meta' : pct(x.c)}</td>
                <td>{x.sem ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {conMeta.length > 0 && (
        <Grafico titulo={`Cumplimiento · ${ind.etiqueta}`} alto={Math.min(560, 80 + 26 * conMeta.length)} data={grafico}
          layout={{ xaxis: { tickformat: '.0%' }, margin: { l: 180, r: 16, t: 16, b: 40 } } as Partial<Layout>} />
      )}
    </>
  )
}
