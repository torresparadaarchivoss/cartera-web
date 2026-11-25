// Kilómetros recorridos por visitador. El campo «kilometros» de cada visita es el odómetro acumulado del vehículo:
// el recorrido es la diferencia entre visitas consecutivas (por fecha), no la suma de los valores. Si el odómetro baja
// (nuevo tramo o reinicio), esa visita cuenta desde su propio valor.

export interface VisitaKm {
  visitador: string
  fecha_visita: string
  kilometros: number | null
}

export function kmPorVisitador(visitas: VisitaKm[]): Map<string, number> {
  const grupos = new Map<string, VisitaKm[]>()
  for (const v of visitas) {
    if (v.kilometros === null || v.kilometros === undefined) continue
    const k = v.visitador.trim().toUpperCase()
    grupos.set(k, [...(grupos.get(k) ?? []), v])
  }
  const salida = new Map<string, number>()
  for (const [k, xs] of grupos) {
    xs.sort((a, b) => a.fecha_visita.localeCompare(b.fecha_visita))
    let total = 0
    let previo: number | null = null
    for (const x of xs) {
      const actual = x.kilometros as number
      total += previo === null || actual < previo ? actual : actual - previo
      previo = actual
    }
    salida.set(k, total)
  }
  return salida
}

export function kmTotal(visitas: VisitaKm[]): number {
  let total = 0
  for (const v of kmPorVisitador(visitas).values()) total += v
  return total
}
