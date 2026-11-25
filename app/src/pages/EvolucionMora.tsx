import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CuentaListado, PuntoSerie } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Tabla } from '../components/Bloques'
import type { Data, Layout } from 'plotly.js'

// Evolución de mora (modules/evolucion_mora.py). Usa la cohorte y la cartera activa de cuentas_listado. Pendiente:
// la columna «Canceladas» (cancelado propio), que la base aún no trae en esta vista.

const BUCKETS = ['0', '1', '2', '3', '4', '5', '6'] as const
const SIN_REF = 'Sin referencia'
const MOVS = ['Mejora', 'Mantiene', 'Desmejora', 'Sin registro'] as const
const COLORES_MOV: Record<string, string> = { Mejora: '#63BE7B', Mantiene: '#A3A8BD', Desmejora: '#F8696B', 'Sin registro': '#D9DCE6' }
const COLORES_BUCKET = ['#4f5bb8', '#3fa04e', '#f5c451', '#f89040', '#e25c52', '#8a8fa8', '#aeb6ec', '#9C3352']

const esBucket = (x: string) => /^\d$/.test(x)

export default function EvolucionMora() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [cohorte, setCohorte] = useState<CuentaListado[] | null>(null)
  const [activa, setActiva] = useState<CuentaListado[] | null>(null)
  const [serie, setSerie] = useState<PuntoSerie[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    setError(null)
    Promise.all([
      datos.cuentasListado(corte, 'cohorte', filtros),
      datos.cuentasListado(corte, 'activa', filtros),
      datos.serie('bucket', filtros),
    ])
      .then(([c, a, s]) => {
        if (!vigente) return
        setCohorte(c)
        setActiva(a)
        setSerie(s)
      })
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros])

  const t = useMemo(() => {
    if (!cohorte || !activa) return null
    const filas = [...BUCKETS, SIN_REF]
    const salida = filas.map((o) => {
      const ini = cohorte.filter((c) => c.origen === o)
      const act = o === SIN_REF ? [] : activa.filter((c) => c.destino === o)
      const movs = Object.fromEntries(MOVS.map((m) => [m, ini.filter((c) => c.movimiento === m).length])) as Record<string, number>
      const saldoIni = ini.reduce((a, c) => a + c.saldo_congelado, 0)
      const saldoAct = act.reduce((a, c) => a + c.saldo_dia, 0)
      return {
        origen: o,
        cuentasIni: ini.length,
        cuentasAct: o === SIN_REF ? null : act.length,
        saldoIni,
        saldoAct: o === SIN_REF ? null : saldoAct,
        variacion: o === SIN_REF ? null : saldoAct - saldoIni,
        variacionPct: o === SIN_REF || !saldoIni ? null : (saldoAct - saldoIni) / saldoIni,
        movs,
      }
    }).filter((f) => f.origen !== SIN_REF || f.cuentasIni > 0)
    const totIni = cohorte.reduce((a, c) => a + c.saldo_congelado, 0)
    const totAct = activa.reduce((a, c) => a + c.saldo_dia, 0)
    const mejoran = cohorte.filter((c) => esBucket(c.origen) && c.movimiento === 'Mejora').length
    const desmejoran = cohorte.filter((c) => esBucket(c.origen) && c.movimiento === 'Desmejora').length
    return { salida, totIni, totAct, mejoran, desmejoran, nCohorte: cohorte.length, nActiva: activa.length }
  }, [cohorte, activa])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudo cargar la evolución de mora: {error}</div>
  if (!t || !corte || !fechaBase || !serie) return <p className="vacio">Cargando la evolución…</p>
  if (t.nCohorte === 0) return <Nota tipo="alerta" texto="No hay cuentas activas con los filtros seleccionados." />

  const variacion = t.totAct - t.totIni
  const sal = t.salida
  const cabeceras = [
    { etiqueta: 'Cuentas iniciales', formato: entero }, { etiqueta: 'Cuentas actuales', formato: entero },
    { etiqueta: 'Saldo inicial', formato: (x: number | null) => dinero(x) },
    { etiqueta: 'Saldo actual', formato: (x: number | null) => dinero(x) },
    { etiqueta: 'Variación', formato: (x: number | null) => dinero(x) },
    { etiqueta: 'Variación %', formato: (x: number | null) => pct(x) },
    { etiqueta: 'Mejora', formato: entero }, { etiqueta: 'Mantiene', formato: entero },
    { etiqueta: 'Desmejora', formato: entero },
  ]
  const filas = sal.map((f) => ({
    etiqueta: f.origen === SIN_REF ? 'Sin referencia (JUR o fuera del cierre)' : f.origen,
    valores: [f.cuentasIni, f.cuentasAct, f.saldoIni, f.saldoAct, f.variacion, f.variacionPct,
      f.movs.Mejora, f.movs.Mantiene, f.movs.Desmejora],
  }))
  const sum = (x: (f: (typeof sal)[number]) => number | null) => sal.reduce((a, f) => a + (x(f) ?? 0), 0)
  const total = {
    etiqueta: 'Total',
    valores: [sum((f) => f.cuentasIni), sum((f) => f.cuentasAct), sum((f) => f.saldoIni), sum((f) => f.saldoAct),
      variacion, t.totIni ? variacion / t.totIni : null,
      sum((f) => f.movs.Mejora), sum((f) => f.movs.Mantiene), sum((f) => f.movs.Desmejora)],
  }

  const bucketsOrden = [...BUCKETS]
  const porBucketIni = bucketsOrden.map((b) => t.salida.find((f) => f.origen === b))
  const barrasIniAct: Data[] = [
    { type: 'bar', name: 'Inicial', x: bucketsOrden, y: porBucketIni.map((f) => f?.saldoIni ?? 0), marker: { color: '#4f5bb8' } } as unknown as Data,
    { type: 'bar', name: 'Actual', x: bucketsOrden, y: porBucketIni.map((f) => f?.saldoAct ?? 0), marker: { color: '#aeb6ec' } } as unknown as Data,
  ]
  const movPct: Data[] = MOVS.filter((m) => m !== 'Sin registro').map((m) => ({
    type: 'bar', name: m, x: bucketsOrden,
    y: porBucketIni.map((f) => {
      const total0 = f ? MOVS.reduce((a, k) => a + f.movs[k], 0) : 0
      return f && total0 ? f.movs[m] / total0 : 0
    }),
    marker: { color: COLORES_MOV[m] },
  } as unknown as Data))
  const grupos = [...new Set(serie.map((s) => s.grupo))].sort()
  const fechas = [...new Set(serie.map((s) => s.f_reporte))].sort()
  const porGrupo: Data[] = grupos.map((g, i) => ({
    type: 'bar', name: `Bucket ${g}`, x: fechas,
    y: fechas.map((f) => serie.find((s) => s.f_reporte === f && s.grupo === g)?.saldo ?? 0),
    marker: { color: COLORES_BUCKET[i % COLORES_BUCKET.length] },
  } as unknown as Data))

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Evolución de mora</h1>
      <p className="dc-desc">
        Cómo cambia cada bucket durante el mes: foto de saldo y cuentas al inicio frente a la fecha de seguimiento, y cuántas
        cuentas de la cohorte mejoran, permanecen o empeoran.
      </p>

      <FilaKpi>
        <Kpi etiqueta={`Saldo al ${fecha(fechaBase)}`} valor={dinero(t.totIni)} detalle={`${entero(t.nCohorte)} cuentas activas`} />
        <Kpi etiqueta={`Saldo al ${fecha(corte)}`} valor={dinero(t.totAct)} detalle={`${entero(t.nActiva)} cuentas activas`} tono="info" />
        <Kpi etiqueta="Variación de saldo" valor={pct(t.totIni ? t.totAct / t.totIni - 1 : null)} detalle={dinero(variacion)}
          tono={variacion <= 0 ? 'bueno' : 'malo'} />
        <Kpi etiqueta="Cuentas que mejoran" valor={entero(t.mejoran)} detalle="de la cohorte" tono="bueno" />
        <Kpi etiqueta="Cuentas que desmejoran" valor={entero(t.desmejoran)} detalle="de la cohorte" tono="malo" />
      </FilaKpi>
      <Nota texto="La variación de saldo por bucket es una foto de stock: incluye cuentas nuevas, pagos y amortización. La mejora de mora se mide solo con la migración de la cohorte." />

      <Tabla titulo="Saldo y cuentas por bucket" etiquetaFila="Bucket" cabeceras={cabeceras} filas={filas} total={total} />
      <p style={{ fontSize: 12, marginTop: -8 }}>
        Inicial: cohorte por bucket de mora de referencia. Actual: cartera activa por bucket de mora del día. Mejora, mantiene y
        desmejora: cuentas de la cohorte.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Grafico titulo="Saldo inicial y actual por bucket" data={barrasIniAct}
          layout={{ barmode: 'group', hovermode: 'x unified', xaxis: { type: 'category' } } as Partial<Layout>} alto={320} />
        <Grafico titulo="Movimiento de las cuentas de la cohorte" data={movPct}
          layout={{ barmode: 'stack', hovermode: 'x unified', xaxis: { type: 'category' }, yaxis: { tickformat: '.0%', range: [0, 1] } } as Partial<Layout>} alto={320} />
      </div>

      <Grafico titulo="Saldo diario por bucket de mora" data={porGrupo}
        layout={{ barmode: 'stack', hovermode: 'x unified', xaxis: { type: 'date' } } as Partial<Layout>} alto={340} />
      <p style={{ fontSize: 12 }}>Cartera activa de cada día con los filtros aplicados.</p>
    </>
  )
}
