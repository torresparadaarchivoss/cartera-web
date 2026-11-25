import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { ClienteDetalle, CuentaListado, GestionDetalle, HistorialCartera, PagoCredito, VisitaDetalle } from '../lib/datos'
import { dinero, entero, fecha } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Plot, Titulo } from '../components/Bloques'
import * as adm from '../lib/administracion'
import type { Data, Layout } from 'plotly.js'

// Ficha de crédito (modules/ficha_credito.py). Pendiente: línea de tiempo gráfica, la referencia de mora del cierre
// del loantape (se usa el bucket inicial de la cuenta) y los comentarios libres de visita (no están en la base).

interface Evento {
  fecha: string
  tipo: string
  detalle: string
}

// Tipos de la línea de tiempo (modules/ficha_credito.EVENTOS).
const EVENTOS: Record<string, string> = {
  'Gestión sin contacto': '#8A8FA6', Contacto: '#4f5bb8', RPC: '#2D3A7C', Promesa: '#3FA04E', Pago: '#2E7D3C', Visita: '#F89040',
}

function tipoGestion(g: GestionDetalle): string {
  if (g.promesa) return 'Promesa'
  if (g.rpc) return 'RPC'
  if (g.contacto) return 'Contacto'
  return 'Gestión sin contacto'
}

function eventos(g: GestionDetalle[], p: PagoCredito[], v: VisitaDetalle[], agentes: Map<string, string>): Evento[] {
  const salida: Evento[] = []
  for (const x of g) {
    let det = `${x.resultado || x.accion} · ${agentes.get(x.usuario.trim().toLowerCase()) ?? x.usuario}`
    if (x.promesa && x.monto_promesa) det += ` · promete ${dinero(x.monto_promesa, 2)}`
    if (x.promesa && x.fecha_promesa) det += ` para el ${fecha(x.fecha_promesa)}`
    salida.push({ fecha: x.fecha_actividad, tipo: tipoGestion(x), detalle: det })
  }
  for (const x of p) salida.push({ fecha: x.fecha, tipo: 'Pago', detalle: `pagó ${dinero(x.pago, 2)}${x.canal ? ` · ${x.canal}` : ''}` })
  for (const x of v) {
    const det = [x.resultado, x.causa_no_pago, x.visitador].filter((s) => s && s.trim()).join(' · ')
    salida.push({ fecha: x.fecha_visita, tipo: 'Visita', detalle: det })
  }
  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export default function FichaCredito() {
  const { fecha: corte, filtros, cargando } = useDatos()
  const { perfil } = useAuth()
  const esAdmin = perfil?.es_admin === true
  const [entrada, setEntrada] = useState('')
  const [credito, setCredito] = useState<string | null>(null)
  const [cuentas, setCuentas] = useState<CuentaListado[]>([])
  const [ficha, setFicha] = useState<Awaited<ReturnType<typeof datos.fichaCredito>> | null>(null)
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<adm.Usuario[] | null>(null)

  useEffect(() => {
    adm.usuarios().then(setUsuarios).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    datos.cuentasListado(corte, 'cohorte', filtros)
      .then((c) => vigente && setCuentas(c))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros])

  useEffect(() => {
    if (!credito) return
    let vigente = true
    setError(null)
    datos.fichaCredito(credito)
      .then((f) => vigente && setFicha(f))
      .catch((e: Error) => vigente && setError(e.message))
    if (esAdmin) {
      datos.clientesDe([credito])
        .then((c) => vigente && setCliente(c[0] ?? null))
        .catch(() => vigente && setCliente(null))
    }
    return () => {
      vigente = false
    }
  }, [credito, esAdmin])

  const cuenta = useMemo(() => cuentas.find((c) => c.credito === credito) ?? null, [cuentas, credito])

  const buscar = () => {
    const x = entrada.trim()
    if (!x) return
    setFicha(null)
    setCliente(null)
    setCredito(x)
  }

  const ficha0 = cargando ? null : ficha
  const hist: HistorialCartera[] = ficha0?.historia ?? []
  const ult = hist.length ? hist[hist.length - 1] : null
  const pri = hist.length ? hist[0] : null
  const pagado = (ficha0?.pagos ?? []).reduce((a, x) => a + x.pago, 0)
  const agentes = new Map((usuarios ?? []).map((u) => [u.usuario_norm.toLowerCase(), u.nombre_mostrado || u.usuario_norm] as const))
  const ev = ficha0 ? eventos(ficha0.gestiones, ficha0.pagos, ficha0.visitas, agentes) : []
  const nombreAgente = (u: string) => agentes.get(u.trim().toLowerCase()) ?? u

  const grafico: Data[] = hist.length ? [
    { type: 'scatter', mode: 'lines+markers', name: 'Saldo', x: hist.map((h) => h.f_reporte), y: hist.map((h) => h.saldo),
      line: { color: '#4f5bb8', width: 2 }, marker: { size: 4 } },
    { type: 'scatter', mode: 'lines+markers', name: 'Días de mora', x: hist.map((h) => h.f_reporte), y: hist.map((h) => h.dias_mora),
      yaxis: 'y2', line: { color: '#e25c52', width: 2, dash: 'dot' }, marker: { size: 4 } },
  ] as unknown as Data[] : []

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Ficha de crédito</h1>
      <p className="dc-desc">Toda la actividad de un crédito en el mes: saldo, mora, gestiones, promesas, pagos y visitas.</p>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="st-campo" style={{ minWidth: 280 }}>
            <div className="st-etiqueta">Crédito</div>
            <input list="creditos-ficha" value={entrada} placeholder="Escribe o elige un crédito"
              onChange={(e) => setEntrada(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} />
            <datalist id="creditos-ficha">
              {cuentas.slice(0, 5000).map((c) => <option key={c.credito} value={c.credito} />)}
            </datalist>
          </div>
          <button className="boton" onClick={buscar} disabled={!entrada.trim()}>Ver ficha</button>
        </div>
      </div>

      {error && <div className="error-pantalla">No se pudo cargar la ficha: {error}</div>}
      {!credito && <Nota texto="Elige un crédito para ver su ficha." />}
      {credito && !ficha && !error && <p className="vacio">Cargando la ficha…</p>}
      {credito && ficha && hist.length === 0 && (
        <Nota tipo="alerta" texto={`El crédito ${credito} no tiene registros de cartera en el mes.`} />
      )}

      {ficha && ult && pri && (
        <>
          <Nota texto={`Crédito ${credito} · supervisor ${ult.supervisor || '—'} · gestor ${ult.gestor || '—'} · tipo ${ult.tipo_credito || '—'} · tipo legal ${ult.tipo_legal || '—'}. ${cuenta ? 'Forma parte de la cohorte o de la cartera activa.' : 'No está en la cohorte ni en la cartera activa del corte.'}`} />

          <FilaKpi>
            <Kpi etiqueta={`Saldo al ${fecha(pri.f_reporte)}`} valor={dinero(pri.saldo, 2)} detalle="primer día del mes" />
            <Kpi etiqueta={`Saldo al ${fecha(ult.f_reporte)}`} valor={dinero(ult.saldo, 2)} detalle="saldo del día" tono="info" />
            <Kpi etiqueta="Mora de referencia" valor={ult.dias_mora_inicial === null ? (cuenta ? cuenta.origen : '—') : `${entero(ult.dias_mora_inicial)} días`}
              detalle={cuenta ? `bucket inicial ${cuenta.origen}` : 'cierre de loantape'} />
            <Kpi etiqueta="Mora hoy" valor={ult.dias_mora === null ? '—' : `${entero(ult.dias_mora)} días`}
              detalle={ult.bucket_actual === null ? '—' : `bucket ${ult.bucket_actual}`} />
            <Kpi etiqueta="Evolución" valor={cuenta ? cuenta.movimiento : '—'} tono={cuenta?.movimiento === 'Mejora' ? 'bueno' : cuenta?.movimiento === 'Desmejora' ? 'malo' : 'neutro'} />
            <Kpi etiqueta="Gestiones del mes" valor={entero(ficha.gestiones.length)} detalle={`${entero(ficha.visitas.length)} visitas`} />
            <Kpi etiqueta="Pagado en el mes" valor={dinero(pagado, 2)} detalle={`${entero(ficha.pagos.length)} pagos`} tono={pagado ? 'bueno' : 'neutro'} />
          </FilaKpi>

          <div className="dc-tarjeta">
            <Titulo texto="Saldo y días de mora en el mes" />
            <Plot data={grafico} layout={{
              height: 320, hovermode: 'x unified', paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
              margin: { l: 64, r: 56, t: 16, b: 40 }, legend: { orientation: 'h', y: -0.2 },
              yaxis: { tickformat: ',.0f', rangemode: 'tozero', title: { text: 'saldo' } },
              yaxis2: { overlaying: 'y', side: 'right', showgrid: false, title: { text: 'días' } },
            } as unknown as Partial<Layout>} config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
          </div>

          {ev.length > 0 && (
            <div className="dc-tarjeta">
              <Titulo texto="Línea de tiempo de la actividad" />
              <Plot data={Object.keys(EVENTOS).filter((t) => ev.some((e) => e.tipo === t)).map((t) => ({
                type: 'scatter', mode: 'markers', name: t, x: ev.filter((e) => e.tipo === t).map((e) => e.fecha),
                y: ev.filter((e) => e.tipo === t).map(() => t), text: ev.filter((e) => e.tipo === t).map((e) => e.detalle),
                hovertemplate: '%{x|%d/%m %H:%M}<br>%{text}<extra>' + t + '</extra>',
                marker: { size: 12, color: EVENTOS[t], line: { color: '#FFFFFF', width: 1.5 } },
              })) as unknown as Data[]}
                layout={{ height: 80 + 42 * Object.keys(EVENTOS).filter((t) => ev.some((e) => e.tipo === t)).length, hovermode: 'closest',
                  showlegend: false, margin: { l: 8, r: 16, t: 16, b: 30 }, yaxis: { type: 'category', automargin: true } } as unknown as Partial<Layout>}
                config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
            </div>
          )}

          <div className="dc-tarjeta">
            <Titulo texto={`Gestiones del crédito (${entero(ficha0?.gestiones.length ?? 0)})`} />
            <div className="ventana">
              <table className="dc-tabla">
                <thead><tr><th>Fecha</th><th>Agente</th><th>Acción</th><th>Resultado</th><th>Tipo</th><th>Monto prometido</th><th>Fecha de promesa</th></tr></thead>
                <tbody>
                  {(ficha0?.gestiones ?? []).map((g, i) => (
                    <tr key={i}><td>{fecha(g.fecha_actividad.slice(0, 10))}</td><td>{nombreAgente(g.usuario)}</td><td>{g.accion}</td>
                      <td>{g.resultado}</td><td>{tipoGestion(g)}</td><td>{g.promesa ? dinero(g.monto_promesa, 2) : '—'}</td>
                      <td>{g.fecha_promesa ? fecha(g.fecha_promesa) : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dc-tarjeta">
            <Titulo texto={`Visitas del crédito (${entero(ficha0?.visitas.length ?? 0)})`} />
            <div className="ventana">
              <table className="dc-tabla">
                <thead><tr><th>Fecha</th><th>Visitador</th><th>Acción</th><th>Resultado</th><th>Causa de no pago</th><th>Fotos</th><th>Km</th></tr></thead>
                <tbody>
                  {(ficha0?.visitas ?? []).map((v, i) => (
                    <tr key={i}><td>{fecha(v.fecha_visita.slice(0, 10))}</td><td>{nombreAgente(v.visitador)}</td><td>{v.accion}</td>
                      <td>{v.resultado}</td><td>{v.causa_no_pago}</td><td>{entero(v.num_fotos)}</td><td>{v.kilometros === null ? '—' : entero(v.kilometros)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dc-tarjeta">
            <Titulo texto={`Actividad del crédito (${entero(ev.length)} eventos)`} />
            {ev.length === 0 ? <Nota tipo="alerta" texto="Sin gestiones, pagos ni visitas registradas en el mes." /> : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="dc-tabla">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {ev.map((e, i) => <tr key={i}><td>{fecha(e.fecha.slice(0, 10))}</td><td>{e.tipo}</td><td>{e.detalle}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="dc-tarjeta">
            <Titulo texto="Saldo y mora por día" />
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <table className="dc-tabla">
                <thead><tr><th>Fecha</th><th>Saldo</th><th>Días de mora</th><th>Bucket</th></tr></thead>
                <tbody>
                  {hist.slice().reverse().map((h) => (
                    <tr key={h.f_reporte}><td>{fecha(h.f_reporte)}</td><td>{dinero(h.saldo, 2)}</td>
                      <td>{h.dias_mora === null ? '—' : entero(h.dias_mora)}</td><td>{h.bucket_actual ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {esAdmin && (
            <div className="dc-tarjeta">
              <Titulo texto="Datos del cliente (loantape) · solo administradores" />
              {cliente ? (
                <table className="dc-tabla">
                  <tbody>
                    {([
                      ['Nombre', cliente.nombre_deudor], ['Edad', cliente.edad], ['Género', cliente.genero],
                      ['Salario', cliente.salario === null ? null : dinero(cliente.salario)], ['Profesión', cliente.profesion],
                      ['Domicilio', cliente.ubicacion], ['Dirección de trabajo', cliente.dire_trabajo], ['Ciudad', cliente.ciudad],
                    ] as [string, string | number | null][]).map(([k, v]) => (
                      <tr key={k}><th style={{ textAlign: 'left' }}>{k}</th><td>{v ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: 13 }}>Sin datos del cliente para este crédito.</p>}
            </div>
          )}
        </>
      )}
    </>
  )
}
