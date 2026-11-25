import type { CSSProperties } from 'react'
import { dinero, entero, pct } from '../lib/formato'
import { TONOS } from './Bloques'
import type { FilaEvo } from '../lib/evolucion'

// Colores por movimiento (components/theme.CELDA_MOVIMIENTO).
const COLOR_MOV: Record<string, string> = { Mejora: '#63BE7B', Mantiene: '#A3A8BD', Desmejora: '#F8696B', 'Sin registro': '#FFD966' }

function estiloCelda(base: string, v: number | null): CSSProperties {
  if (v === null || Number.isNaN(v) || v <= 0) return { color: '#9AA4AF' }
  const a = 0.35 + 0.65 * Math.min(v, 1)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16))
  return { backgroundColor: `rgba(${r},${g},${b},${a.toFixed(2)})`, color: TONOS.neutro, fontWeight: 500 }
}

export function TablaEvolucion({ filas, total, colorFilas, columnas, medida }: {
  filas: FilaEvo[]
  total: FilaEvo
  colorFilas: FilaEvo[]
  columnas: string[]
  medida: string
}) {
  const m = medida.toLowerCase()
  const esPct = m.startsWith('%')
  const formato = (v: number | null) => (esPct ? pct(v) : m.includes('cuenta') ? entero(v) : dinero(v))
  return (
    <table className="dc-tabla">
      <thead>
        <tr>
          <th>Bucket inicial</th>
          {columnas.map((c) => <th key={c}>{c}</th>)}
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
          </tr>
        ))}
        <tr className="total">
          <td>{total.origen}</td>
          {total.valores.map((v, j) => <td key={j}>{formato(v)}</td>)}
        </tr>
      </tbody>
    </table>
  )
}
