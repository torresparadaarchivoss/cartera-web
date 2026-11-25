import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useDatos } from '../lib/contexto'
import * as datos from '../lib/datos'
import type { CeldaRodamiento } from '../lib/datos'
import { dinero, entero, fecha, pct } from '../lib/formato'
import { FilaKpi, Kpi, Nota, Titulo, TONOS } from '../components/Bloques'
import { Radios } from '../components/Selectores'
import { evolucion } from '../lib/evolucion'
import { TablaEvolucion } from '../components/TablaEvolucion'

// Rodamiento real (modules/rodamiento_real.py): cartera activa en la fecha con saldo congelado del primer día activo.
// Pendiente: desglose por estado de promesa, prioridad, visita e intentos (esas columnas aún no están en la base) y
// la evolución por bucket con metas.

const MEDIDAS = ['% del saldo', '% de cuentas', 'Saldo', 'Cuentas'] as const
const FORMATOS = ['Evolución', 'Matriz'] as const
type Formato = (typeof FORMATOS)[number]
type Medida = (typeof MEDIDAS)[number]
const ORIGENES = ['0', '1', '2', '3', '4', '5', '6', 'Sin referencia', 'Nuevo en el mes'] as const
const DESTINOS = ['0', '1', '2', '3', '4', '5', '6'] as const

// Colores de celda del Streamlit (components/tables._base y theme.CELDA_MOVIMIENTO).
const C = { Mejora: '#63BE7B', Mantiene: '#A3A8BD', Desmejora: '#F8696B', Nuevo: '#8C96DD' }

function colorBase(origen: string, destino: string): string {
  if (!/^\d+$/.test(origen)) return C.Nuevo
  if (!/^\d+$/.test(destino)) return C.Mantiene
  const o = Number(origen)
  const d = Number(destino)
  return d < o ? C.Mejora : d === o ? C.Mantiene : C.Desmejora
}

function movimiento(origen: string, destino: string): string {
  if (origen === 'Nuevo en el mes') return 'Nuevo en el mes'
  if (origen === 'Sin referencia') return 'Sin referencia'
  if (destino === 'Sin mora') return 'Sin registro'
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

export default function RodamientoReal() {
  const { fecha: corte, fechaBase, filtros, cargando } = useDatos()
  const [medida, setMedida] = useState<Medida>('% del saldo')
  const [formato, setFormato] = useState<Formato>('Evolución')
  const [celdas, setCeldas] = useState<CeldaRodamiento[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corte || !filtros) return
    let vigente = true
    setError(null)
    datos.rodamientoRealGrilla(corte, filtros)
      .then((c) => vigente && setCeldas(c))
      .catch((e: Error) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [corte, filtros])

  const vista = useMemo(() => {
    if (!celdas) return null
    const total = { cuentas: 0, saldo: 0, nuevas: 0, saldoNuevo: 0 }
    const mov: Record<string, number> = {}
    for (const c of celdas) {
      total.cuentas += c.creditos
      total.saldo += c.saldo_congelado
      if (c.origen === 'Nuevo en el mes') {
        total.nuevas += c.creditos
        total.saldoNuevo += c.saldo_congelado
      }
      const m = movimiento(c.origen, c.destino)
      mov[m] = (mov[m] ?? 0) + c.saldo_congelado
    }
    return { total, mov }
  }, [celdas])

  if (cargando) return <p className="vacio">Cargando…</p>
  if (error) return <div className="error-pantalla">No se pudieron cargar los datos: {error}</div>
  if (!vista || !corte || !fechaBase || !celdas) return <p className="vacio">Cargando la cartera…</p>
  if (vista.total.cuentas === 0) return <Nota tipo="alerta" texto="No hay cuentas activas con los filtros seleccionados." />
  const cuentasMedida = medida.includes('cuenta') || medida === 'Cuentas'
  const celdasMov = celdas.filter((c) => /^\d$/.test(c.origen)).map((c) => ({
    origen: c.origen, movimiento: movimiento(c.origen, c.destino), creditos: c.creditos, saldo: c.saldo_congelado, saldoObs: 0,
  }))
  const evoBloque = evolucion(celdasMov, [...ORIGENES].slice(0, 7), ['Mejora', 'Mantiene', 'Desmejora'],
    ['Mejora', 'Mantiene', 'Desmejora'], medida, { '0': 'Mejora', '6': 'Desmejora' })
  const evoColor = evolucion(celdasMov, [...ORIGENES].slice(0, 7), ['Mejora', 'Mantiene', 'Desmejora'],
    ['Mejora', 'Mantiene', 'Desmejora'], cuentasMedida ? '% de cuentas' : '% del saldo', { '0': 'Mejora', '6': 'Desmejora' })

  const { total, mov } = vista
  const pctMov = (m: string) => (total.saldo ? (mov[m] ?? 0) / total.saldo : null)

  // Matriz: filas = origen; columnas 0-6. Los porcentajes se calculan sobre la suma de los destinos 0-6 (como el Streamlit).
  const celda = (o: string, d: string) => celdas.find((c) => c.origen === o && c.destino === d)
  const sumaFila = (o: string, campo: 'saldo_congelado' | 'creditos') =>
    DESTINOS.reduce((a, d) => a + ((celda(o, d)?.[campo]) ?? 0), 0)

  const porSaldo = medida === '% del saldo' || medida === 'Saldo'
  const valorCelda = (o: string, d: string) => {
    const c = celda(o, d)
    const sal = c?.saldo_congelado ?? 0
    const cue = c?.creditos ?? 0
    const denS = sumaFila(o, 'saldo_congelado')
    const denC = sumaFila(o, 'creditos')
    const shareS = denS ? sal / denS : null
    const shareC = denC ? cue / denC : null
    const base = colorBase(o, d)
    const color = porSaldo ? shareS : shareC
    switch (medida) {
      case '% del saldo': return { texto: pct(shareS), color, base }
      case '% de cuentas': return { texto: pct(shareC), color, base }
      case 'Saldo': return { texto: dinero(sal), color, base }
      case 'Cuentas': return { texto: entero(cue), color, base }
    }
  }

  const sinRef = celdas.filter((c) => c.origen === 'Sin referencia').reduce((a, c) => a + c.saldo_congelado, 0)
  const sinRefN = celdas.filter((c) => c.origen === 'Sin referencia').reduce((a, c) => a + c.creditos, 0)

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Rodamiento real</h1>
      <p className="dc-desc">
        Cartera activa en la fecha de seguimiento, incluidas las cuentas nuevas del mes, con el saldo congelado del primer
        día activo: solo se mueve la mora.
      </p>
      <Nota texto={`Cartera activa al ${fecha(corte)} (saldo > 0). Filtros sobre los atributos de esa fecha.`} />
      {sinRefN > 0 && (
        <Nota tipo="alerta" texto={`${entero(sinRefN)} cuentas sin referencia (JUR o fuera del cierre de loantape): ${dinero(sinRef)}.`} />
      )}

      <FilaKpi>
        <Kpi etiqueta="Cuentas activas" valor={entero(total.cuentas)} detalle={`Saldo congelado ${dinero(total.saldo)}`} />
        <Kpi etiqueta="Nuevas en el mes" valor={entero(total.nuevas)} detalle={dinero(total.saldoNuevo)} tono="info" />
        <Kpi etiqueta="Mejora" valor={pct(pctMov('Mejora'))} detalle="del saldo congelado" tono="bueno" />
        <Kpi etiqueta="Mantiene" valor={pct(pctMov('Mantiene'))} detalle="del saldo congelado" />
        <Kpi etiqueta="Desmejora" valor={pct(pctMov('Desmejora'))} detalle="del saldo congelado" tono="malo" />
        <Kpi etiqueta="Sin referencia" valor={pct(pctMov('Sin referencia'))} detalle="JUR o fuera del cierre de loantape" tono="alerta" />
      </FilaKpi>

      <div className="dc-tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', marginBottom: 8 }}>
          <Radios etiqueta="Matriz en" opciones={[...MEDIDAS]} valor={medida} onChange={setMedida} />
          <Radios etiqueta="Formato de tabla" opciones={[...FORMATOS]} valor={formato} onChange={setFormato} />
        </div>
        {formato === 'Evolución' ? (
          <>
            <Titulo texto={`Evolución por bucket inicial al ${fecha(corte)} · ${medida.toLowerCase()}`} />
            <TablaEvolucion filas={evoBloque.filas} total={evoBloque.total} colorFilas={evoColor.filas}
              columnas={['Mejora', 'Mantiene', 'Desmejora']} medida={medida} />
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Cuentas activas con bucket inicial, saldo congelado. Las nuevas del mes y las sin referencia se ven en la matriz.
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
              Filas: bucket inicial. «Nuevo en el mes»: cuentas que no estaban activas el primer día. Ponderado con el saldo
              congelado; las cuentas que salen dejan de contar. Cada fila suma 100 % en las vistas porcentuales.
            </p>
          </>
        )}
      </div>
    </>
  )
}
