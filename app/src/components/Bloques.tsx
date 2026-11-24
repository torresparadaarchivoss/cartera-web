import type { ReactNode } from 'react'
import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'
import type { Data, Layout } from 'plotly.js'

const Plot = createPlotlyComponent(Plotly)

// Colores del tablero Streamlit (components/theme.py)
export const TONOS = {
  neutro: 'var(--indigo)',
  info: 'var(--medio)',
  bueno: 'var(--verde)',
  malo: 'var(--rojo)',
  alerta: 'var(--ambar)',
} as const
export type Tono = keyof typeof TONOS

export function Titulo({ texto, ayuda }: { texto: string; ayuda?: string }) {
  return (
    <h3 title={ayuda} style={{ cursor: ayuda ? 'help' : undefined }}>
      {texto}
    </h3>
  )
}

export function Kpi({ etiqueta, valor, detalle, tono = 'neutro' }: {
  etiqueta: string
  valor: string
  detalle?: string
  tono?: Tono
}) {
  return (
    <div className="dc-kpi" style={{ ['--tono' as string]: TONOS[tono] }}>
      <div className="e">{etiqueta}</div>
      <div className="v">{valor}</div>
      {detalle && <div className="d">{detalle}</div>}
    </div>
  )
}

export function FilaKpi({ children }: { children: ReactNode }) {
  return <div className="dc-kpis">{children}</div>
}

export function Nota({ texto, tipo = 'info' }: { texto: string; tipo?: 'info' | 'alerta' | 'error' }) {
  const tono = tipo === 'error' ? TONOS.malo : tipo === 'alerta' ? TONOS.alerta : TONOS.info
  return <div className="dc-nota" style={{ ['--tono' as string]: tono }}>{texto}</div>
}

// Tabla con la misma estructura que el Streamlit: primera columna de texto, resto numérico, fila de total opcional.
export function Tabla({ titulo, ayuda, etiquetaFila = 'Grupo', cabeceras, filas, total }: {
  titulo: string
  ayuda?: string
  etiquetaFila?: string
  cabeceras: { etiqueta: string; formato: (x: number | null) => string }[]
  filas: { etiqueta: string; valores: (number | null)[] }[]
  total?: { etiqueta: string; valores: (number | null)[] }
}) {
  return (
    <div className="dc-tarjeta">
      <Titulo texto={titulo} ayuda={ayuda} />
      <table className="dc-tabla">
        <thead>
          <tr>
            <th>{etiquetaFila}</th>
            {cabeceras.map((c) => <th key={c.etiqueta}>{c.etiqueta}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta}>
              <td>{f.etiqueta}</td>
              {f.valores.map((v, i) => <td key={i}>{cabeceras[i].formato(v)}</td>)}
            </tr>
          ))}
          {total && (
            <tr className="total">
              <td>{total.etiqueta}</td>
              {total.valores.map((v, i) => <td key={i}>{cabeceras[i].formato(v)}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Grafico({ titulo, data, layout, alto = 340 }: {
  titulo: string
  data: Data[]
  layout?: Partial<Layout>
  alto?: number
}) {
  return (
    <div className="dc-tarjeta">
      <Titulo texto={titulo} />
      <Plot
        data={data}
        layout={{
          height: alto,
          autosize: true,
          paper_bgcolor: '#ffffff',
          plot_bgcolor: '#ffffff',
          font: { family: "'Nunito Sans', 'Segoe UI', system-ui, sans-serif", color: '#202050', size: 12 },
          colorway: ['#4f5bb8', '#3fa04e', '#f89040', '#e25c52', '#88c038', '#aeb6ec', '#8a8fa8'],
          margin: { l: 64, r: 16, t: 36, b: 40 },
          legend: { orientation: 'h', y: -0.18, x: 0 },
          hovermode: 'x unified',
          xaxis: { gridcolor: '#e3e6f0', linecolor: '#e3e6f0', zeroline: false },
          yaxis: { gridcolor: '#e3e6f0', linecolor: '#e3e6f0', zeroline: false, tickformat: ',.0f' },
          ...layout,
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
      />
    </div>
  )
}
