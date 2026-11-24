// Mismos formatos que utils/formatting.py del Streamlit (separador de miles con coma, punto decimal).

function conMiles(n: number, decimales: number): string {
  const [entera, decimal] = Math.abs(n).toFixed(decimales).split('.')
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const signo = n < 0 ? '-' : ''
  return signo + miles + (decimal ? `.${decimal}` : '')
}

const vacio = (x: number | null | undefined): x is null | undefined =>
  x === null || x === undefined || Number.isNaN(x)

export function dinero(x: number | null | undefined, decimales = 0): string {
  if (vacio(x)) return '—'
  return x < 0 ? `-$${conMiles(-x, decimales)}` : `$${conMiles(x, decimales)}`
}

export function entero(x: number | null | undefined): string {
  return vacio(x) ? '—' : conMiles(x, 0)
}

export function pct(x: number | null | undefined, decimales = 1): string {
  return vacio(x) ? '—' : `${(x * 100).toFixed(decimales)} %`
}

export function pp(x: number | null | undefined, decimales = 1): string {
  if (vacio(x)) return '—'
  const v = (x * 100).toFixed(decimales)
  return `${x * 100 >= 0 ? '+' : ''}${v} pp`
}

// Entrada ISO aaaa-mm-dd → dd/mm/aaaa
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
