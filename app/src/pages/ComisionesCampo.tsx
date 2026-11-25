import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import * as adm from '../lib/administracion'
import type { Asignacion, Usuario } from '../lib/administracion'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Titulo } from '../components/Bloques'

import { escalaExcel } from '../lib/escala'
import * as com from '../lib/comisiones'
import { descargarExcel, type Hoja } from '../lib/exportar'
import type { CarteraC, MiembroC, PagoC, VisitaC } from '../lib/comisiones'

// Comisiones de campo (modules/comisiones.py). Usa todo el mes y no aplica los filtros globales. Pendiente: el código de
// resultado de visita (cod_resultado) y la asignación por zona de la llave, y la exportación a Excel.

const EQUIPOS = [com.ADMIN, com.LEGAL] as const

export default function ComisionesCampo() {
  const { fecha: corte, fechaBase, cargando } = useDatos()
  const periodo = corte ? corte.slice(0, 7) : ''
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [asig, setAsig] = useState<Asignacion[]>([])
  const [valoresParam, setValoresParam] = useState<Record<string, number> | null>(null)
  const [visitas, setVisitas] = useState<VisitaC[] | null>(null)
  const [pagos, setPagos] = useState<PagoC[] | null>(null)
  const [cartera, setCartera] = useState<CarteraC[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([adm.usuarios(), adm.asignaciones(), datos.visitasMes(), datos.pagosMes()])
      .then(([u, a, v, p]) => {
        setUsuarios(u)
        setAsig(a)
        setVisitas(v as VisitaC[])
        setPagos(p as PagoC[])
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!periodo) return
    adm.parametrosComision(periodo).then(setValoresParam).catch((e: Error) => setError(e.message))
  }, [periodo])

  // Motorizados del mes: visitadores activos con equipo (Administrativa o Legal) y su supervisor, según la asignación vigente.
  const equipo: MiembroC[] = useMemo(() => {
    if (!usuarios) return []
    const salida: MiembroC[] = []
    for (const u of usuarios) {
      if (u.tipo !== 'visitador' || u.estado !== 'activo') continue
      const a = asig.filter((x) => x.usuario_id === u.id && x.periodo <= periodo)
        .sort((x, y) => y.periodo.localeCompare(x.periodo))[0]
      if (!a || !a.departamento || !(EQUIPOS as readonly string[]).includes(a.departamento)) continue
      salida.push({ usuario: u.usuario_norm, equipo: a.departamento, supervisor: a.supervisor ?? '' })
    }
    return salida
  }, [usuarios, asig, periodo])

  // Carga de la cartera de los créditos visitados por el equipo (solo lo necesario para el cálculo).
  const creditosVisitados = useMemo(() => {
    if (!visitas || !corte) return []
    const nombres = new Set(equipo.map((m) => m.usuario))
    return [...new Set(visitas.filter((v) => v.fecha_visita.slice(0, 10) <= corte && nombres.has(v.visitador)).map((v) => v.credito))]
  }, [visitas, equipo, corte])

  useEffect(() => {
    if (!creditosVisitados.length) {
      setCartera([])
      return
    }
    datos.carteraDeCreditos(creditosVisitados)
      .then((c) => setCartera(c.map((x) => ({
        credito: x.credito, f_reporte: x.f_reporte, saldo: Number(x.saldo), saldo_vencido: x.saldo_vencido,
        valor_cuota: x.valor_cuota, due_inicio_mes: x.due_inicio_mes, tipo_cartera: x.tipo_cartera, tipo_legal: x.tipo_legal,
      }))))
      .catch((e: Error) => setError(e.message))
  }, [creditosVisitados])

  const nombres = useMemo(() => new Map((usuarios ?? []).map((u) => [u.usuario_norm, u.nombre_mostrado || u.usuario_norm] as const)), [usuarios])

  const prm = useMemo(() => com.parametrosDesde(valoresParam ?? {}), [valoresParam])

  const cuentasCalc = useMemo(() => {
    if (!visitas || !pagos || !cartera || !corte || !fechaBase) return []
    return com.cuentas(visitas, pagos, cartera, equipo, `${periodo}-01`, corte, prm)
  }, [visitas, pagos, cartera, equipo, corte, fechaBase, periodo, prm])

  if (error) return <div className="error-pantalla">No se pudieron calcular las comisiones: {error}</div>
  if (cargando || !usuarios || !visitas || !pagos || !cartera || !valoresParam || !corte || !fechaBase) {
    return <p className="vacio">Calculando las comisiones…</p>
  }

  const resumenes = EQUIPOS.map((eq) => ({ eq, filas: com.resumenEquipo(cuentasCalc, equipo, prm, nombres, eq) }))
  const totalComision = resumenes.reduce((a, r) => a + r.filas.reduce((x, f) => x + f.comisionTotal, 0), 0)
  const totalRecaudo = cuentasCalc.reduce((a, c) => a + c.recaudo_valido, 0)

  const descargarTodo = () => {
    const hojas: Hoja[] = resumenes.map(({ eq, filas }) => ({
      nombre: `Resumen ${eq}`,
      filas: filas.map((f) => ({
        Supervisor: f.supervisor, Motorizado: f.motorizado, Usuario: f.usuario, Cuentas: f.cuentas,
        'Cuentas válidas': f.cuentasValidas, 'Cumple cuota': f.cumpleCuota, 'Saldo capital': f.saldo,
        'Recaudo válido': f.recaudoValido, Eficiencia: f.eficiencia, 'Comisión por mora': f.comisionMora,
        'Comisión válida recaudo': f.comisionValida, 'Meta cuenta pago': f.metaCuentaPago, 'Alcance cuentas pago': f.alcance,
        'Comisión cuentas pago': f.comisionCuentasPago, 'Comisión total': f.comisionTotal,
      })),
    }))
    hojas.push({ nombre: 'Cuentas', filas: cuentasCalc.map((c) => ({
      Equipo: c.equipo, Motorizado: nombres.get(c.usuario) ?? c.usuario, Usuario: c.usuario, Crédito: c.credito,
      'Fecha de asignación': c.fecha_asignacion, 'Visita válida': c.visita_valida ? 'Sí' : 'No', 'Due inicio de mes': c.categoria,
      Saldo: c.saldo, Cuota: c.cuota, 'Recaudo meta': c.recaudo_meta, Recaudo: c.recaudo, 'Recaudo DMT': c.recaudo_dmt,
      'Recaudo válido': c.recaudo_valido, Tasa: c.tasa, Comisión: c.comision, 'Paga cuota': c.paga_cuota ? 'Sí' : 'No',
    })) })
    descargarExcel(`comisiones_${corte}.xlsx`, hojas)
  }

  // Formato condicional dinámico (como el tablero): escala de 3 colores en Cumple cuota, Eficiencia y Alcance,
  // calculada sobre los motorizados de cada equipo (sin el supervisor).
  const escalas = new Map<string, { cumple: string | null; eficiencia: string | null; alcance: string | null }>()
  for (const { filas } of resumenes) {
    const cumple = escalaExcel(filas.map((f) => f.cumpleCuota))
    const eficiencia = escalaExcel(filas.map((f) => f.eficiencia))
    const alcance = escalaExcel(filas.map((f) => f.alcance))
    filas.forEach((f, i) => escalas.set(f.usuario, { cumple: cumple[i], eficiencia: eficiencia[i], alcance: alcance[i] }))
  }

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Comisiones de campo</h1>
      <p className="dc-desc">
        Recaudo y comisión de los motorizados administrativos y legales: cuentas asignadas por su primera visita, pagos de
        CHIRICO en los días siguientes a cada visita válida y tasas por due de inicio de mes. Usa todo el mes.
      </p>

      <Nota texto={`Mes ${periodo} · corte al ${fecha(corte)}. Tasas y topes: Administración → Parámetros de comisión cuando están guardados; si no, los del tablero.`} />
      <Nota tipo="alerta" texto="Pendiente: código de resultado de la visita, asignación por zona de la llave y exportación a Excel." />

      <FilaKpi>
        <Kpi etiqueta="Motorizados" valor={entero(equipo.length)} detalle={`${entero(equipo.filter((m) => m.equipo === com.ADMIN).length)} administrativos`} />
        <Kpi etiqueta="Cuentas asignadas" valor={entero(cuentasCalc.length)} detalle={`${entero(new Set(cuentasCalc.map((c) => c.credito)).size)} créditos`} />
        <Kpi etiqueta="Recaudo válido" valor={dinero(totalRecaudo)} tono="info" />
        <Kpi etiqueta="Comisión total" valor={dinero(totalComision)} tono="bueno" />
      </FilaKpi>

      {resumenes.map(({ eq, filas }) => (
        <div className="dc-tarjeta" key={eq}>
          <Titulo texto={`Resumen · equipo ${eq}`} />
          {filas.length === 0 ? <Nota tipo="alerta" texto="Sin motorizados en este equipo." /> : (
            <div style={{ overflow: 'auto' }}>
              <table className="dc-tabla">
                <thead>
                  <tr>
                    <th>Supervisor</th><th>Motorizado</th><th>Cuentas</th><th>Cuentas válidas</th><th>Cumple cuota</th>
                    <th>Saldo capital</th><th>Recaudo válido</th><th>Eficiencia</th><th>Comisión por mora</th>
                    <th>Comisión válida</th><th>Meta cuenta pago</th><th>Alcance</th><th>Comisión cuentas pago</th><th>Comisión total</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.usuario}>
                      <td>{f.supervisor || '—'}</td><td>{f.motorizado}</td><td>{entero(f.cuentas)}</td><td>{entero(f.cuentasValidas)}</td>
                      <td style={escalas.get(f.usuario)?.cumple ? { background: escalas.get(f.usuario)!.cumple!, color: '#000' } : {}}>{pct(f.cumpleCuota, 2)}</td>
                      <td>{dinero(f.saldo, 2)}</td><td>{dinero(f.recaudoValido, 2)}</td><td style={escalas.get(f.usuario)?.eficiencia ? { background: escalas.get(f.usuario)!.eficiencia!, color: '#000' } : {}}>{pct(f.eficiencia, 2)}</td>
                      <td>{dinero(f.comisionMora, 2)}</td><td>{dinero(f.comisionValida, 2)}</td><td>{pct(f.metaCuentaPago, 2)}</td>
                      <td style={escalas.get(f.usuario)?.alcance ? { background: escalas.get(f.usuario)!.alcance!, color: '#000' } : {}}>{pct(f.alcance)}</td><td>{dinero(f.comisionCuentasPago, 2)}</td>
                      <td><strong>{dinero(f.comisionTotal, 2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {EQUIPOS.map((eq) => {
        const a = cuentasCalc.filter((c) => c.equipo === eq)
        if (!a.length) return null
        const cats = [...new Set(a.map((c) => c.categoria))].sort()
        return (
          <div className="dc-tarjeta" key={`cat-${eq}`}>
            <Titulo texto={`Por due de inicio de mes · ${eq}`} />
            <table className="dc-tabla">
              <thead>
                <tr><th>Due inicio de mes</th><th>Cuentas</th><th>Saldo capital</th><th>Recaudo válido</th><th>Con recaudo DMT</th>
                  <th>Tasa efectiva</th><th>Tasa DMT</th><th>Comisión antes del tope</th></tr>
              </thead>
              <tbody>
                {cats.map((c) => {
                  const g = a.filter((x) => x.categoria === c)
                  return (
                    <tr key={c}>
                      <td>{c}</td><td>{entero(g.length)}</td><td>{dinero(g.reduce((s, x) => s + x.saldo, 0), 2)}</td>
                      <td>{dinero(g.reduce((s, x) => s + x.recaudo_valido, 0), 2)}</td>
                      <td>{entero(g.filter((x) => x.recaudo_dmt > 0).length)}</td>
                      <td>{pct(prm.tasaEfectiva[c] ?? 0)}</td><td>{pct(prm.tasaDmt[c] ?? 0)}</td>
                      <td>{dinero(g.reduce((s, x) => s + x.comision, 0), 2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Titulo texto={`Cuentas asignadas (${entero(cuentasCalc.length)})`} />
          <button className="boton" onClick={descargarTodo}>Descargar Excel</button>
        </div>
        <div className="ventana">
          <table className="dc-tabla">
            <thead>
              <tr><th>Equipo</th><th>Motorizado</th><th>Crédito</th><th>Asignada</th><th>Visita válida</th><th>Due</th>
                <th>Saldo</th><th>Cuota</th><th>Recaudo meta</th><th>Recaudo</th><th>Recaudo DMT</th><th>Recaudo válido</th>
                <th>Tasa</th><th>Comisión</th><th>Paga cuota</th></tr>
            </thead>
            <tbody>
              {cuentasCalc.map((c, i) => (
                <tr key={i}>
                  <td>{c.equipo}</td><td>{nombres.get(c.usuario) ?? c.usuario}</td><td>{c.credito}</td><td>{fecha(c.fecha_asignacion)}</td>
                  <td>{c.visita_valida ? 'Sí' : 'No'}</td><td>{c.categoria}</td><td>{dinero(c.saldo, 2)}</td><td>{dinero(c.cuota, 2)}</td>
                  <td>{dinero(c.recaudo_meta, 2)}</td><td>{dinero(c.recaudo, 2)}</td><td>{dinero(c.recaudo_dmt, 2)}</td>
                  <td>{dinero(c.recaudo_valido, 2)}</td><td>{pct(c.tasa)}</td><td>{dinero(c.comision, 2)}</td>
                  <td>{c.paga_cuota ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
