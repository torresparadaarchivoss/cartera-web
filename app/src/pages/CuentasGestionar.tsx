import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type {
  ClienteDetalle, CuentaListado, GestionDetalle, UbicacionDetalle, VisitaDetalle, VistaCuentas,
} from '../lib/datos'
import { dinero, entero, fecha } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Plot, Titulo } from '../components/Bloques'
import { MultiSelect, Radios, SelectBox } from '../components/Selectores'
import { useAuth } from '../lib/auth'
import type { Data } from 'plotly.js'

// Cuentas a gestionar (modules/cuentas.py). El mapa de visitas y los datos del cliente solo se cargan para
// administradores generales; la base lo restringe con RLS (es_super_admin), esta pantalla solo los oculta.
// El mapa completo de visitas va en Visitas de campo (pendiente).

const COLORES_VISITADOR = ['#4f5bb8', '#3fa04e', '#f89040', '#e25c52', '#88c038', '#aeb6ec', '#9C3352']

const ESTRATEGIAS = ['Prioridad de cobranza', 'Cuentas Top'] as const
const POBLACIONES = ['Cohorte congelada', 'Cartera activa en la fecha'] as const
const PRIO_ORDEN: Record<string, number> = {
  'Critico Sin Gestion': 0, 'Critico Sin Contacto': 1, Riesgo: 2, 'Seguimiento Promesa': 3, Normal: 4,
}
const MOV_ORDEN: Record<string, number> = { Desmejora: 0, 'Sin registro': 1, Mantiene: 2, Mejora: 3 }

const etiquetaPrioridad = (p: string) => p.replace('Critico', 'Crítico').replace('Gestion', 'gestión')
  .replace('Contacto', 'contacto').replace('Seguimiento Promesa', 'Seguimiento promesa')

function ordenar(a: CuentaListado, b: CuentaListado): number {
  const p = (PRIO_ORDEN[a.prioridad] ?? 9) - (PRIO_ORDEN[b.prioridad] ?? 9)
  if (p) return p
  const m = (MOV_ORDEN[a.movimiento] ?? 5) - (MOV_ORDEN[b.movimiento] ?? 5)
  if (m) return m
  return b.saldo_congelado - a.saldo_congelado
}

const distintos = (xs: string[]) => [...new Set(xs.filter((x) => x !== ''))].sort()

// Mapa de visitas (modules/visitas.py: scatter_map, zoom 8, color por visitador).
function MapaVisitas({ ubicaciones }: { ubicaciones: UbicacionDetalle[] }) {
  const porVisitador = new Map<string, UbicacionDetalle[]>()
  for (const u of ubicaciones) {
    const lista = porVisitador.get(u.visitador) ?? []
    lista.push(u)
    porVisitador.set(u.visitador, lista)
  }
  const trazas = [...porVisitador.entries()].map(([visitador, us], i) => ({
    type: 'scattermap',
    mode: 'markers',
    name: visitador || 'Sin visitador',
    lat: us.map((u) => u.latitud),
    lon: us.map((u) => u.longitud),
    text: us.map((u) => `${u.credito} · ${fecha(u.fecha_visita.slice(0, 10))}<br>${u.resultado}`),
    hoverinfo: 'text',
    marker: { size: 9, opacity: 0.8, color: COLORES_VISITADOR[i % COLORES_VISITADOR.length] },
  })) as unknown as Data[]
  const lat = ubicaciones.reduce((a, u) => a + u.latitud, 0) / ubicaciones.length
  const lon = ubicaciones.reduce((a, u) => a + u.longitud, 0) / ubicaciones.length
  return (
    <Plot
      data={trazas}
      layout={{
        height: 460,
        autosize: true,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: '#ffffff',
        legend: { orientation: 'h' },
        map: { style: 'carto-positron', center: { lat, lon }, zoom: 8 },
      } as unknown as Partial<import('plotly.js').Layout>}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}

export default function CuentasGestionar() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [estrategia, setEstrategia] = useState<(typeof ESTRATEGIAS)[number]>('Prioridad de cobranza')
  const [poblacion, setPoblacion] = useState<(typeof POBLACIONES)[number]>('Cohorte congelada')
  const [movs, setMovs] = useState<string[]>([])
  const [bIni, setBIni] = useState<string[]>([])
  const [bAct, setBAct] = useState<string[]>([])
  const [prios, setPrios] = useState<string[]>([])
  const [estados, setEstados] = useState<string[]>([])
  const [visita, setVisita] = useState<'Todas' | 'Visitadas' | 'Sin visita'>('Todas')
  const [minSinGestion, setMinSinGestion] = useState(0)
  const [buscar, setBuscar] = useState('')
  const [cuentas, setCuentas] = useState<CuentaListado[] | null>(null)
  const [gest, setGest] = useState<GestionDetalle[]>([])
  const [vis, setVis] = useState<VisitaDetalle[]>([])
  const [clientes, setClientes] = useState<ClienteDetalle[]>([])
  const [ubicaciones, setUbicaciones] = useState<UbicacionDetalle[]>([])
  const [error, setError] = useState<string | null>(null)
  const { perfil } = useAuth()
  const esAdmin = perfil?.es_admin === true

  const vista: VistaCuentas = poblacion === 'Cohorte congelada' ? 'cohorte' : 'activa'

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    setError(null)
    datos.cuentasListado(corte, vista, filtros)
      .then((c) => vigente && setCuentas(c))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros, vista])

  const base = useMemo(() => (cuentas ?? []).slice().sort(ordenar), [cuentas])

  const lista = useMemo(() => {
    let x = base
    if (estrategia === 'Cuentas Top') x = x.filter((c) => c.top)
    if (movs.length) x = x.filter((c) => movs.includes(c.movimiento))
    if (bIni.length) x = x.filter((c) => bIni.includes(c.origen))
    if (bAct.length) x = x.filter((c) => bAct.includes(c.destino))
    if (prios.length) x = x.filter((c) => prios.includes(c.prioridad))
    if (estados.length) x = x.filter((c) => estados.includes(c.estado_cobranza))
    if (visita === 'Visitadas') x = x.filter((c) => c.visitas_mes > 0)
    if (visita === 'Sin visita') x = x.filter((c) => c.visitas_mes === 0)
    if (minSinGestion) x = x.filter((c) => c.dias_sin_gestion === null || c.dias_sin_gestion >= minSinGestion)
    if (buscar.trim()) x = x.filter((c) => c.credito.toLowerCase().includes(buscar.trim().toLowerCase()))
    return x
  }, [base, estrategia, movs, bIni, bAct, prios, estados, visita, minSinGestion, buscar])

  // Gestiones y visitas de las cuentas listadas (solo cuando hay pocas, para no traer miles de filas).
  useEffect(() => {
    const creditos = lista.map((c) => c.credito)
    if (creditos.length === 0) {
      setGest([])
      setVis([])
      setClientes([])
      setUbicaciones([])
      return
    }
    let vigente = true
    Promise.all([datos.gestionesDe(creditos), datos.visitasDe(creditos)])
      .then(([g, v]) => {
        if (vigente) {
          setGest(g)
          setVis(v)
        }
      })
      .catch((e: Error) => vigente && setError(e.message))
    if (esAdmin) {
      Promise.all([datos.clientesDe(creditos), datos.ubicacionesDe(creditos)])
        .then(([cl, ub]) => {
          if (vigente) {
            setClientes(cl)
            setUbicaciones(ub)
          }
        })
        .catch((e: Error) => vigente && setError(e.message))
    }
    return () => {
      vigente = false
    }
  }, [lista, esAdmin])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar las cuentas: {error}</div>
  if (!cuentas || !corte || !fechaBase) return <p className="vacio">Cargando el listado…</p>
  if (base.length === 0) return <Nota tipo="alerta" texto="No hay cuentas con los filtros globales seleccionados." />

  const criticas = lista.filter((c) => c.prioridad.startsWith('Critico')).length
  const topN = lista.filter((c) => c.top).length
  const topSaldo = lista.filter((c) => c.top).reduce((a, c) => a + c.saldo_dia, 0)
  const sinGestion = lista.filter((c) => c.gestiones_mes === 0).length
  const conPromesa = lista.filter((c) => c.promesa_mes > 0)
  const visitadas = lista.filter((c) => c.visitas_mes > 0).length

  const cuentasTabla = lista.length > 0
  const cols: { e: string; f: (c: CuentaListado) => string }[] = [
    { e: 'Crédito', f: (c) => c.credito },
    { e: 'Bucket inicial', f: (c) => c.origen },
    { e: 'Bucket actual', f: (c) => c.destino },
    { e: 'Clasificación', f: (c) => c.movimiento },
    { e: 'Saldo congelado', f: (c) => dinero(c.saldo_congelado) },
    { e: 'Saldo del día', f: (c) => dinero(c.saldo_dia) },
    { e: 'Mora hoy', f: (c) => (c.dias_mora === null ? '—' : entero(c.dias_mora)) },
    { e: 'Prioridad', f: (c) => etiquetaPrioridad(c.prioridad) },
    { e: 'Estado de cobranza', f: (c) => c.estado_cobranza },
    { e: 'Cuenta Top', f: (c) => (c.top ? 'Sí' : 'No') },
    { e: 'Gestiones del mes', f: (c) => entero(c.gestiones_mes) },
    { e: 'Contacto', f: (c) => entero(c.contacto_mes) },
    { e: 'RPC', f: (c) => entero(c.rpc_mes) },
    { e: 'Promesa', f: (c) => entero(c.promesa_mes) },
    { e: 'Monto prometido', f: (c) => dinero(c.monto_prometido) },
    { e: 'Monto pagado', f: (c) => dinero(c.monto_pagado) },
    { e: 'Última gestión', f: (c) => (c.ultima_gestion ? fecha(c.ultima_gestion.slice(0, 10)) : '—') },
    { e: 'Días sin gestión', f: (c) => (c.dias_sin_gestion === null ? '—' : entero(c.dias_sin_gestion)) },
    { e: 'Visitas del mes', f: (c) => entero(c.visitas_mes) },
  ]

  const descargarCsv = () => {
    const enc = cols.map((c) => c.e)
    const filas = lista.map((c) => cols.map((col) => `"${col.f(c).replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[enc.join(','), ...filas].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cuentas_${corte}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Cuentas a gestionar</h1>
      <p className="dc-desc">
        Listado de cuentas con su mora, gestión y visitas, ordenado por prioridad, clasificación y saldo. Respeta los
        filtros globales; combina bucket inicial y actual para ver una celda de la matriz.
      </p>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Estrategia de cobranza" opciones={[...ESTRATEGIAS]} valor={estrategia} onChange={setEstrategia} />
          <Radios etiqueta="Población" opciones={[...POBLACIONES]} valor={poblacion} onChange={setPoblacion} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <MultiSelect etiqueta="Clasificación" opciones={distintos(base.map((c) => c.movimiento))} valor={movs} onChange={setMovs} placeholder="Todas" />
          <MultiSelect etiqueta="Bucket inicial" opciones={distintos(base.map((c) => c.origen))} valor={bIni} onChange={setBIni} placeholder="Todos" />
          <MultiSelect etiqueta="Bucket actual" opciones={distintos(base.map((c) => c.destino))} valor={bAct} onChange={setBAct} placeholder="Todos" />
          <MultiSelect etiqueta="Prioridad" opciones={distintos(base.map((c) => c.prioridad))} valor={prios} onChange={setPrios}
            formato={etiquetaPrioridad} placeholder="Todas" />
          <MultiSelect etiqueta="Estado de cobranza" opciones={distintos(base.map((c) => c.estado_cobranza))} valor={estados} onChange={setEstados} placeholder="Todos" />
          <SelectBox etiqueta="Visita en el mes" opciones={[
            { valor: 'Todas', etiqueta: 'Todas' }, { valor: 'Visitadas', etiqueta: 'Visitadas' }, { valor: 'Sin visita', etiqueta: 'Sin visita' },
          ]} valor={visita} onChange={setVisita} />
          <div className="st-campo">
            <div className="st-etiqueta">Días sin gestión, mínimo</div>
            <input type="number" min={0} value={minSinGestion} onChange={(e) => setMinSinGestion(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="st-campo">
            <div className="st-etiqueta">Buscar crédito</div>
            <input value={buscar} placeholder="Número o parte del número" onChange={(e) => setBuscar(e.target.value)} />
          </div>
        </div>
      </div>

      <Nota texto={`${poblacion} · ${estrategia} · seguimiento al ${fecha(corte)}. Gestiones y visitas desde el ${fecha(fechaBase)}.`} />

      <FilaKpi>
        <Kpi etiqueta="Cuentas en el listado" valor={entero(lista.length)} detalle={`Saldo congelado ${dinero(lista.reduce((a, c) => a + c.saldo_congelado, 0))}`} />
        <Kpi etiqueta="Saldo del día" valor={dinero(lista.reduce((a, c) => a + c.saldo_dia, 0))} tono="info" />
        <Kpi etiqueta="Cuentas Top" valor={entero(topN)} detalle={dinero(topSaldo)} tono="info" />
        <Kpi etiqueta="Críticas" valor={entero(criticas)} detalle="sin gestión o sin contacto, mora > 90" tono="malo" />
        <Kpi etiqueta="Sin gestión en el mes" valor={entero(sinGestion)} tono="alerta" />
        <Kpi etiqueta="Con promesa" valor={entero(conPromesa.length)} detalle={dinero(conPromesa.reduce((a, c) => a + c.monto_prometido, 0))} tono="bueno" />
        <Kpi etiqueta="Visitadas" valor={entero(visitadas)} detalle={`${entero(vis.length)} visitas`} />
      </FilaKpi>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Titulo texto={`Cuentas (${entero(lista.length)})`} />
          <button className="boton" onClick={descargarCsv} disabled={!cuentasTabla}>Descargar CSV</button>
        </div>
        <div style={{ maxHeight: 460, overflow: 'auto' }}>
          <table className="dc-tabla">
            <thead>
              <tr>{cols.map((c) => <th key={c.e}>{c.e}</th>)}</tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.credito}>{cols.map((col) => <td key={col.e}>{col.f(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dc-tarjeta">
        <Titulo texto={`Gestiones de estas cuentas (${entero(gest.length)})`} />
        <table className="dc-tabla">
          <thead><tr><th>Fecha</th><th>Crédito</th><th>Agente</th><th>Acción</th><th>Resultado</th><th>Contacto</th><th>RPC</th><th>Promesa</th><th>Monto prometido</th><th>Fecha de promesa</th></tr></thead>
          <tbody>
            {gest.map((g, i) => (
              <tr key={i}>
                <td>{fecha(g.fecha_actividad.slice(0, 10))}</td><td>{g.credito}</td><td>{g.usuario}</td><td>{g.accion}</td>
                <td>{g.resultado}</td><td>{g.contacto ? 'Sí' : 'No'}</td><td>{g.rpc ? 'Sí' : 'No'}</td><td>{g.promesa ? 'Sí' : 'No'}</td>
                <td>{dinero(g.monto_promesa)}</td><td>{g.fecha_promesa ? fecha(g.fecha_promesa) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12 }}>Más reciente primero. La relación entre una promesa y un pago no se asume.</p>
      </div>

      {esAdmin && (
        <>
          <div className="dc-tarjeta">
            <Titulo texto={`Datos del cliente (${entero(clientes.length)}) · solo administradores`} />
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="dc-tabla">
                <thead>
                  <tr><th>Crédito</th><th>Nombre</th><th>Edad</th><th>Género</th><th>Salario</th><th>Profesión</th><th>Domicilio</th><th>Dirección de trabajo</th><th>Ciudad</th></tr>
                </thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr key={c.credito}>
                      <td>{c.credito}</td><td>{c.nombre_deudor ?? '—'}</td><td>{c.edad ?? '—'}</td><td>{c.genero ?? '—'}</td>
                      <td>{c.salario === null ? '—' : dinero(c.salario)}</td><td>{c.profesion ?? '—'}</td>
                      <td>{c.ubicacion ?? '—'}</td><td>{c.dire_trabajo ?? '—'}</td><td>{c.ciudad ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dc-tarjeta">
            <Titulo texto={`Mapa de visitas (${entero(ubicaciones.length)}) · solo administradores`} />
            {ubicaciones.length === 0 ? (
              <p style={{ fontSize: 13 }}>Ninguna visita de estas cuentas tiene coordenadas válidas.</p>
            ) : (
              <MapaVisitas ubicaciones={ubicaciones} />
            )}
            <p style={{ fontSize: 12, marginTop: 8 }}>Solo visitas con coordenadas dentro de El Salvador.</p>
          </div>
        </>
      )}

      <div className="dc-tarjeta">
        <Titulo texto={`Visitas de estas cuentas (${entero(vis.length)})`} />
        <table className="dc-tabla">
          <thead><tr><th>Fecha</th><th>Crédito</th><th>Visitador</th><th>Acción</th><th>Resultado</th><th>Causa de no pago</th><th>Parentesco</th><th>Fotos</th><th>Km</th></tr></thead>
          <tbody>
            {vis.map((v, i) => (
              <tr key={i}>
                <td>{fecha(v.fecha_visita.slice(0, 10))}</td><td>{v.credito}</td><td>{v.visitador}</td><td>{v.accion}</td>
                <td>{v.resultado}</td><td>{v.causa_no_pago}</td><td>{v.parentesco}</td><td>{entero(v.num_fotos)}</td>
                <td>{v.kilometros === null ? '—' : entero(v.kilometros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
