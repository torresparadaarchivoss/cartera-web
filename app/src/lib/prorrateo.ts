import type * as React from "react"
// Prorrateo de metas y semáforo (services/targets_engine.py). Los pesos y umbrales son los valores por defecto de
// config.py: la web no lee APP.ENV. Si el Streamlit usa otros, ajustar aquí.
export const PESOS_DIAS = [1, 1, 1, 1, 1, 0.5, 0] // lunes ... domingo
export const UMBRAL_VERDE = 1.0
export const UMBRAL_AMARILLO = 0.8

// Fracción de la meta del mes transcurrida a la fecha de corte.
export function factorProrrateo(inicio: string, corte: string): number {
  const [a, m] = inicio.split('-').map(Number)
  const diasEnMes = new Date(a, m, 0).getDate()
  let total = 0
  let hasta = 0
  for (let d = 1; d <= diasEnMes; d++) {
    const f = new Date(a, m - 1, d)
    const peso = PESOS_DIAS[(f.getDay() + 6) % 7]
    total += peso
    const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (iso <= corte) hasta += peso
  }
  return total ? hasta / total : 1
}

export type Semaforo = 'Verde' | 'Amarillo' | 'Rojo'

export function semaforo(c: number | null): Semaforo | null {
  if (c === null) return null
  if (c >= UMBRAL_VERDE) return 'Verde'
  if (c >= UMBRAL_AMARILLO) return 'Amarillo'
  return 'Rojo'
}

// Formato condicional de los % de cumplimiento (components/tables.css_cumplimiento): fondo con la escala de Excel
// del Streamlit y texto negro en negrita; sin meta, texto gris.
export const CELDA_SEM: Record<Semaforo, string> = { Rojo: '#F98A8B', Amarillo: '#FFE993', Verde: '#85CB98' }
export const PUNTO_SEM: Record<Semaforo, string> = { Rojo: '#E5534B', Amarillo: '#F2B544', Verde: '#4CAF6A' }

export function estiloCumpl(c: number | null): React.CSSProperties {
  const s = semaforo(c)
  return s ? { backgroundColor: CELDA_SEM[s], color: '#000000', fontWeight: 600 } : { color: '#9AA4AF' }
}
