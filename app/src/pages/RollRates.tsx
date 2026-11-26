import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Data } from 'plotly.js'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CeldaRoll } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Grafico, Kpi, Nota, Titulo, TONOS } from '../components/Bloques'
import { TablaEvolucion } from '../components/TablaEvolucion'
import { Radios } from '../components/Selectores'
import { evolucion } from '../lib/evolucion'
import * as adm from '../lib/administracion'
import type { MetaBucket } from '../lib/administracion'
import { semaforoCon } from '../lib/metas'


const MEDIDAS = ['% del saldo base', '% de cuentas', 'Saldo base', 'Cuentas', 'Saldo observado'] as const
const FORMATOS = ['Evolución', 'Matriz'] as const
type Formato = (typeof FORMATOS)[number]
type Medida = (typeof MEDIDAS)[number]
const ORIGENES = ['0', '1', '2', '3', '4', '5', '6'] as const
const DESTINOS = [...ORIGENES, 'Sin registro'] as const

// Colores de celda del Streamlit (components/theme.CELDA_MOVIMIENTO).
const COLOR = { Mejora: '#63BE7B', Mantiene: '#A3A8BD', Desmejora: '#F8696B', 'Sin registro': '#FFD966' }
const UMBRAL_VERDE = 1
const UMBRAL_AMARILLO = 0.8


type Mov = 'Mejora' | 'Mantiene' | 'Desmejora' | 'Sin registro'

function movimiento(origen: string, destino: string): Mov {
  if (destino === 'Sin registro') return 'Sin registro'
  const o = Number(origen)
  const d = Number(destino)
  return d < o ? 'Mejora' : d === o ? 'Mantiene' : 'Desmejora'
}

function celdaEstilo(base: string, v: number | null): CSSProperties {
  if (v === null || Number.isNaN(v) || v <= 0) return { color: '#9AA4AF' }
  const a = 0.35 + 0.65 * Math.min(v, 1)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16))
  return { backgroundColor: `rgba(${r},${g},${b},${a.toFixed(2)})`, color: TONOS.neutro, fontWeight: 500 }
}

interface Resumen {
  cuentas: number
  saldoBase: number
  saldoObs: number
  mov: Record<Mov, { saldo: number; cuentas: number }>
}

function sumar(celdas: CeldaRoll[]): Resumen {
  const r: Resumen = {
    cuentas: 0, saldoBase: 0, saldoObs: 0,
    mov: { Mejora: { saldo: 0, cuentas: 0 }, Mantiene: { saldo: 0, cuentas: 0 }, Desmejora: { saldo: 0, cuentas: 0 }, 'Sin registro': { saldo: 0, cuentas: 0 } },
  }
  for (const c of celdas) {
    r.cuentas += c.creditos
    r.saldoBase += c.saldo_base
    r.saldoObs += c.saldo_obs
    const m = movimiento(c.origen, c.destino)
    r.mov[m].saldo += c.saldo_base
    r.mov[m].cuentas += c.creditos
  }
  return r
}

export default function RollRates() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [medida, setMedida] = useState<Medida>('% del saldo base')
  const [formato, setFormato] = useState<Formato>('Evolución')
  const [celdas, setCeldas] = useState<CeldaRoll[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metas, setMetas] = useState<MetaBucket[]>([])

  useEffect(() => {
    if (!corte) return
    adm.metasBucket(corte.slice(0, 7)).then(setMetas).catch(() => setMetas([]))
  }, [corte])

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    setError(null)
    datos.rollRatesGrilla(corte, filtros)
      .then((c) => vigente && setCeldas(c))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros])

  const vista = useMemo(() => {
    if (!celdas) return null
    const ref = celdas.filter((c) => c.origen !== 'Sin referencia')
    const sinRef = celdas.filter((c) => c.origen === 'Sin referencia')
    const total = sumar(ref)
    const porOrigen = new Map(ORIGENES.map((o) => [o, sumar(ref.filter((c) => c.origen === o))]))
    const sinRefTot = sumar(sinRef)
    return { ref, total, porOrigen, sinRef: sinRefTot }
  }, [celdas])

  // Metas por bucket (targets_engine.evaluar_buckets): real del saldo base por movimiento contra la meta del bucket.
  const evalBuckets = useMemo(() => {
    if (!vista) return null
    const real = (o: string, mv: Mov) => {
      const origen = vista.porOrigen.get(o as (typeof ORIGENES)[number])
      return origen && origen.saldoBase ? origen.mov[mv].saldo / origen.saldoBase : null
    }
    const meta = (b: string, ind: string) => {
      const m = metas.find((x) => x.bucket === b && x.indicador === ind)
      return m?.valor_meta === null || m === undefined ? null : Number(m.valor_meta)
    }
    return ORIGENES.map((o) => {
      const cel = (mv: Mov, ind: string, sentido: 'min' | 'max', noAplica: boolean) => {
        const r = noAplica ? null : real(o, mv)
        const mt = noAplica ? null : meta(o, ind)
        let c: number | null = null
        if (mt !== null && r !== null) c = sentido === 'min' ? (r / mt) : (r > 0 ? Math.min(mt / r, 2) : 2)
        return { real: r, meta: mt, cumple: c, sem: semaforoCon(c, UMBRAL_VERDE, UMBRAL_AMARILLO) }
      }
      return {
        bucket: o,
        mejora: cel('Mejora', 'mejora_saldo', 'min', o === '0'),
        mantiene: cel('Mantiene', 'mantiene_max', 'max', false),
        desmejora: cel('Desmejora', 'desmejora_max', 'max', o === '6'),
      }
    })
  }, [vista, metas])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!vista || !corte || !fechaBase) return <p className="vacio">Cargando la cohorte…</p>
  const cuentasMedida = medida.includes('cuenta') || medida === 'Cuentas'
  const celdasMov = vista.ref.filter((c) => c.origen !== 'Sin referencia').map((c) => ({
    origen: c.origen, movimiento: movimiento(c.origen, c.destino), creditos: c.creditos, saldo: c.saldo_base, saldoObs: c.saldo_obs,
  }))
  const evoBloque = evolucion(celdasMov, [...ORIGENES], ['Mejora', 'Mantiene', 'Desmejora'],
    ['Mejora', 'Mantiene', 'Desmejora', 'Sin registro'], medida, { '0': 'Mejora', '6': 'Desmejora' })
  const evoColor = evolucion(celdasMov, [...ORIGENES], ['Mejora', 'Mantiene', 'Desmejora'],
    ['Mejora', 'Mantiene', 'Desmejora', 'Sin registro'], cuentasMedida ? '% de cuentas' : '% del saldo base', { '0': 'Mejora', '6': 'Desmejora' })

  const { ref, total, porOrigen, sinRef } = vista
  if (total.cuentas === 0 && sinRef.cuentas === 0) {
    return <Nota tipo="alerta" texto="No hay cuentas activas en la cohorte con los filtros seleccionados." />
  }

  const saldoDe = (o: string, d: string) => ref.find((c) => c.origen === o && c.destino === d)
  const denSaldo = (o: string) => porOrigen.get(o as (typeof ORIGENES)[number])?.saldoBase ?? 0
  const denCuentas = (o: string) => porOrigen.get(o as (typeof ORIGENES)[number])?.cuentas ?? 0
  const porSaldo = medida !== '% de cuentas' && medida !== 'Cuentas'

  const valorCelda = (o: string, d: string): { texto: string; color: number | null; base: string } => {
    const c = saldoDe(o, d)
    const sb = c?.saldo_base ?? 0
    const cu = c?.creditos ?? 0
    const so = c?.saldo_obs ?? 0
    const shareSaldo = denSaldo(o) ? sb / denSaldo(o) : null
    const shareCuentas = denCuentas(o) ? cu / denCuentas(o) : null
    const color = porSaldo ? shareSaldo : shareCuentas
    const base = COLOR[movimiento(o, d)]
    switch (medida) {
      case '% del saldo base': return { texto: pct(shareSaldo), color, base }
      case '% de cuentas': return { texto: pct(shareCuentas), color, base }
      case 'Saldo base': return { texto: dinero(sb), color, base }
      case 'Cuentas': return { texto: entero(cu), color, base }
      case 'Saldo observado': return { texto: dinero(so), color: shareSaldo, base }
    }
  }

  const kpiPct = (m: Mov) => (total.saldoBase ? total.mov[m].saldo / total.saldoBase : null)
  const variacion = total.saldoBase ? total.saldoObs / total.saldoBase - 1 : null

  const colsResumen = [
    { e: 'Cuentas', f: (r: Resumen) => entero(r.cuentas) },
    { e: 'Saldo base', f: (r: Resumen) => dinero(r.saldoBase) },
    { e: 'Saldo observado', f: (r: Resumen) => dinero(r.saldoObs) },
    { e: '% mejora', f: (r: Resumen, o?: string) => (o === '0' ? '—' : pct(r.saldoBase ? r.mov.Mejora.saldo / r.saldoBase : null)) },
    { e: '% mantiene', f: (r: Resumen) => pct(r.saldoBase ? r.mov.Mantiene.saldo / r.saldoBase : null) },
    { e: '% desmejora', f: (r: Resumen, o?: string) => (o === '6' ? '—' : pct(r.saldoBase ? r.mov.Desmejora.saldo / r.saldoBase : null)) },
    { e: 'Cuentas que mejoran', f: (r: Resumen, o?: string) => (o === '0' ? '—' : entero(r.mov.Mejora.cuentas)) },
    { e: 'Cuentas que mantienen', f: (r: Resumen) => entero(r.mov.Mantiene.cuentas) },
    { e: 'Cuentas que desmejoran', f: (r: Resumen, o?: string) => (o === '6' ? '—' : entero(r.mov.Desmejora.cuentas)) },
  ]

  const barras: Data[] = [
    { type: 'bar', x: [...ORIGENES], y: ORIGENES.map((o) => porOrigen.get(o)?.saldoBase ?? 0), name: 'Saldo base', marker: { color: '#3f4da8' } } as Data,
    { type: 'bar', x: [...ORIGENES], y: ORIGENES.map((o) => porOrigen.get(o)?.saldoObs ?? 0), name: 'Saldo observado', marker: { color: '#aeb6ec' } } as Data,
  ]

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Rodamiento</h1>
      <p className="dc-desc">
        Cohorte congelada: cuentas activas y saldo del primer día del mes. Solo cambia el bucket, según la mora de cada
        fecha de seguimiento.
      </p>
      <Nota texto={`Cohorte congelada el ${fecha(fechaBase)} · seguimiento al ${fecha(corte)}.`} />
      {sinRef.cuentas > 0 && (
        <Nota tipo="alerta" texto={`${entero(sinRef.cuentas)} cuentas sin mora de referencia quedan fuera de la matriz: ${dinero(sinRef.saldoBase)}.`} />
      )}

      <FilaKpi>
        <Kpi etiqueta="Cuentas en la cohorte" valor={entero(total.cuentas)} detalle={`Saldo base ${dinero(total.saldoBase)}`} />
        <Kpi etiqueta="Mejora" valor={pct(kpiPct('Mejora'))} detalle={`${entero(total.mov.Mejora.cuentas)} cuentas`} tono="bueno" />
        <Kpi etiqueta="Mantiene" valor={pct(kpiPct('Mantiene'))} detalle={`${entero(total.mov.Mantiene.cuentas)} cuentas`} />
        <Kpi etiqueta="Desmejora" valor={pct(kpiPct('Desmejora'))} detalle={`${entero(total.mov.Desmejora.cuentas)} cuentas`} tono="malo" />
        <Kpi etiqueta="Saldo observado" valor={dinero(total.saldoObs)}
          detalle={variacion !== null ? `${pct(variacion)} frente al saldo base` : undefined} tono="info" />
      </FilaKpi>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Medida" opciones={[...MEDIDAS]} valor={medida} onChange={setMedida} />
          <Radios etiqueta="Formato de tabla" opciones={[...FORMATOS]} valor={formato} onChange={setFormato} />
        </div>
        {formato === 'Evolución' ? (
          <>
            <Titulo texto={`Evolución por bucket inicial al ${fecha(corte)} · ${medida.toLowerCase()}`} />
            <TablaEvolucion
              filas={evoBloque.filas}
              total={evoBloque.total}
              colorFilas={evoColor.filas}
              columnas={['Desmejora', 'Mantiene', 'Mejora']}
              medida={medida}
              cumplimientoEn={['Desmejora', 'Mejora']}
              metas={(evalBuckets ?? []).map((f) => [
                { ...f.desmejora, noAplica: f.bucket === '6' },
                { ...f.mantiene, noAplica: false },
                { ...f.mejora, noAplica: f.bucket === '0' },
              ])}
            />
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Filas: bucket inicial. Porcentajes sobre el total de la fila (incluye «Sin registro»). «—» en mejora del bucket 0 y deterioro del bucket 6.
            </p>
          </>
        ) : (
          <>
            <Titulo texto={`Matriz de transición al ${fecha(corte)} · ${medida.toLowerCase()}`} />
            <table className="dc-tabla">
              <thead>
                <tr>
                  <th>Bucket inicial \ en la fecha</th>
                  {DESTINOS.map((d) => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {ORIGENES.map((o) => (
                  <tr key={o}>
                    <td>{o}</td>
                    {DESTINOS.map((d) => {
                      const v = valorCelda(o, d)
                      return <td key={d} style={celdaEstilo(v.base, v.color)}>{v.texto}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Filas: bucket inicial. Columnas: bucket en la fecha de seguimiento. Verde mejora, gris permanece, rojo deteriora,
              amarillo sin registro. En % cada fila suma 100 %. Saldo observado usa el color del saldo base.
            </p>
          </>
        )}
      </div>

      <Titulo texto="Resumen por bucket inicial" />
      <div className="dc-tarjeta">
        <table className="dc-tabla">
          <thead>
            <tr>
              <th>Bucket inicial</th>
              {colsResumen.map((c) => <th key={c.e}>{c.e}</th>)}
            </tr>
          </thead>
          <tbody>
            {ORIGENES.map((o) => {
              const r = porOrigen.get(o) ?? sumar([])
              return (
                <tr key={o}>
                  <td>{o}</td>
                  {colsResumen.map((c) => <td key={c.e}>{c.f(r, o)}</td>)}
                </tr>
              )
            })}
            <tr className="total">
              <td>Total</td>
              {colsResumen.map((c) => <td key={c.e}>{c.f(total)}</td>)}
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Porcentajes sobre el saldo base. «—» en mejora del bucket 0 y deterioro del bucket 6: no aplica.
        </p>
      </div>

      <Grafico titulo="Saldo base y saldo observado por bucket inicial" alto={320} data={barras}
        layout={{ barmode: 'group', yaxis: { tickprefix: '$', tickformat: ',.0f' }, xaxis: { type: 'category' } }} />
    </>
  )
}
