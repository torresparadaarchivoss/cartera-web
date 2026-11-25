// Tabla de evolución por bucket inicial (services/cohort_engine.tabla_evolucion): filas = bucket inicial,
// columnas = movimientos, fila Total. Los % van sobre la suma de los movimientos de denMovs (el Streamlit los calcula
// sobre el total de la fila; en roll rates incluye «Sin registro»).
export interface CeldaMov { origen: string; movimiento: string; creditos: number; saldo: number; saldoObs: number }
export interface FilaEvo { origen: string; valores: (number | null)[]; den: number }

export function evolucion(
  celdas: CeldaMov[],
  origenes: string[],
  columnas: string[],
  denMovs: string[],
  medida: string,
  noAplica: Record<string, string>, // origen → movimiento que no aplica (p. ej. '0' → 'Mejora')
): { filas: FilaEvo[]; total: FilaEvo } {
  const m = medida.toLowerCase()
  const esPct = m.startsWith('%')
  const observado = m.includes('observado')
  const cuentas = m.includes('cuenta')
  const valor = (c: CeldaMov) => (observado ? c.saldoObs : cuentas ? c.creditos : c.saldo)
  const suma = (o: string | null, mv: string) =>
    celdas.filter((c) => (o === null || c.origen === o) && c.movimiento === mv).reduce((a, c) => a + valor(c), 0)

  const filas: FilaEvo[] = origenes.map((o) => {
    const den = denMovs.reduce((a, mv) => a + suma(o, mv), 0)
    const valores = columnas.map((mv) => {
      if (noAplica[o] === mv) return null
      const v = suma(o, mv)
      return esPct ? (den ? v / den : null) : v
    })
    return { origen: o, valores, den }
  })
  const denTotal = filas.reduce((a, f) => a + f.den, 0)
  const totales = columnas.map((mv) => suma(null, mv))
  return {
    filas,
    total: { origen: 'Total', valores: totales.map((v) => (esPct ? (denTotal ? v / denTotal : null) : v)), den: denTotal },
  }
}
