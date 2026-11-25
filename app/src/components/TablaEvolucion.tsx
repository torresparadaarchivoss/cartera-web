import type { CSSProperties } from 'react'
import { dinero, entero, pct } from '../lib/formato'
import { TONOS } from './Bloques'
import type { FilaEvo } from '../lib/evolucion'
import { CELDA_SEM } from '../lib/prorrateo'

// Presupuesto (meta) y cumplimiento de una celda, como en la tabla del Streamlit (modules/metas_bucket.tabla).
export interface MetaCelda {
  meta: number | null
  cumple: number | null
  sem: string | null
  noAplica: boolean
}

// Colores por movimiento (components/theme.CELDA_MOVIMIENTO).
const COLOR_MOV: Record<string, string> = { Mejora: '#63BE7B', Mantiene: '#A3A8BD', Desmejora: '#F8696B', 'Sin registro': '#FFD966' }

function estiloCelda(base: string, v: number | null): CSSProperties {
  if (v === null || Number.isNaN(v) || v <= 0) return { color: '#9AA4AF' }
  const a = 0.35 + 0.65 * Math.min(v, 1)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16))
  return { backgroundColor: `rgba(${r},${g},${b},${a.toFixed(2)})`, color: TONOS.neutro, fontWeight: 500 }
}

export function TablaEvolucion({ filas, total, colorFilas, columnas, medida, metas, cumplimientoEn }: {
  filas: FilaEvo[]
  total: FilaEvo
  colorFilas: FilaEvo[]
  columnas: string[]
  medida: string
  metas?: MetaCelda[][]
  cumplimientoEn?: string[]
}) {
  const m = medida.toLowerCase()
  const esPct = m.startsWith('%')
  const formato = (v: number | null) => (esPct ? pct(v) : m.includes('cuenta') ? entero(v) : dinero(v))
  const conMetas = !!metas
  // Cumplimiento solo en las columnas que lo tienen (el Streamlit no lo calcula para mantiene).
  const cumplCols = cumplimientoEn ?? columnas
  return (
    <table className="dc-tabla">
      <thead>
        {conMetas && (
          <tr>
            <th />
            <th colSpan={columnas.length} style={{ textAlign: 'center' }}>Real</th>
            <th colSpan={columnas.length} style={{ textAlign: 'center' }}>Presupuesto</th>
            <th colSpan={cumplCols.length} style={{ textAlign: 'center' }}>Cumplimiento</th>
          </tr>
        )}
        <tr>
          <th>Bucket inicial</th>
          {columnas.map((c) => <th key={`r-${c}`}>{c}</th>)}
          {conMetas && columnas.map((c) => <th key={`m-${c}`}>{c}</th>)}
          {conMetas && cumplCols.map((c) => <th key={`c-${c}`}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.origen}>
            <td>{f.origen}</td>
            {f.valores.map((v, j) => (
              <td key={j} style={esPct ? estiloCelda(COLOR_MOV[columnas[j]] ?? '#A3A8BD', colorFilas[i]?.valores[j] ?? null) : undefined}>
                {formato(v)}
              </td>
            ))}
            {conMetas && columnas.map((_, j) => {
              const c = metas[i]?.[j]
              return <td key={`mp-${j}`} style={{ background: '#F4F6FB', color: c?.noAplica ? '#9AA4AF' : undefined }}>
                {c?.noAplica ? 'n/a' : c?.meta === null || c?.meta === undefined ? '—' : pct(c.meta)}
              </td>
            })}
            {conMetas && cumplCols.map((col) => {
              const c = metas[i]?.[columnas.indexOf(col)]
              const color = c?.sem && c.sem in CELDA_SEM ? CELDA_SEM[c.sem as keyof typeof CELDA_SEM] : undefined
              return <td key={`cu-${col}`} style={color ? { background: color, color: '#000' } : { color: '#9AA4AF' }}>
                {c?.noAplica ? 'n/a' : c?.cumple === null || c?.cumple === undefined ? '—' : pct(c.cumple)}
              </td>
            })}
          </tr>
        ))}
        <tr className="total">
          <td>{total.origen}</td>
          {total.valores.map((v, j) => <td key={j}>{formato(v)}</td>)}
          {conMetas && columnas.map((c) => <td key={`tm-${c}`} />)}
          {conMetas && cumplCols.map((c) => <td key={`tc-${c}`} />)}
        </tr>
      </tbody>
    </table>
  )
}
