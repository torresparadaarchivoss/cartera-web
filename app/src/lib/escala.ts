// Escala de 3 colores de Excel (services/comisiones.escala_excel): mínimo rojo, percentil 50 amarillo, máximo verde,
// con interpolación en RGB. Los vacíos no tienen color.
const ESCALA = ['#F98A8B', '#FFE993', '#85CB98'] as const

function mezcla(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + ca.map((x, i) => Math.round(x + (cb[i] - x) * t).toString(16).padStart(2, '0').toUpperCase()).join('')
}

function percentil50(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const i = 0.5 * (s.length - 1)
  const bajo = Math.floor(i)
  const alto = Math.ceil(i)
  return s[bajo] + (s[alto] - s[bajo]) * (i - bajo)
}

export function escalaExcel(valores: (number | null)[]): (string | null)[] {
  const ok = valores.filter((x): x is number => x !== null && !Number.isNaN(x))
  if (ok.length === 0) return valores.map(() => null)
  const lo = Math.min(...ok)
  const hi = Math.max(...ok)
  const mid = percentil50(ok)
  return valores.map((x) => {
    if (x === null || Number.isNaN(x)) return null
    if (hi === lo) return ESCALA[1]
    if (x <= mid) return mezcla(ESCALA[0], ESCALA[1], mid > lo ? (x - lo) / (mid - lo) : 1)
    return mezcla(ESCALA[1], ESCALA[2], (x - mid) / (hi - mid))
  })
}
