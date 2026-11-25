import type { CoreoEpisodio } from './datos'

// Agregados de las coreografías (services/coreografias.py: _fila, cumplimiento, conteo_pasos, resumen_fpd).
// Los episodios vienen ya evaluados de la base; aquí solo se agrupan.

export const CUMPLE = 'Cumple'
export const NO_CUMPLE = 'No cumple'
export const PENDIENTE = 'Pendiente'
export const RECUPERADO = 'Recuperado'
export const ABIERTO = 'Abierto'
export const SEGMENTOS = ['FPD', 'Prórroga', 'PYME'] as const

export const PASOS: { clave: keyof CoreoEpisodio; etiqueta: string }[] = [
  { clave: 'paso_gestion_d1', etiqueta: 'Gestión Call Center día 1' },
  { clave: 'paso_acuerdo_d1', etiqueta: 'Acuerdo día 1' },
  { clave: 'paso_visita', etiqueta: 'Visita de campo a tiempo' },
  { clave: 'paso_combinado', etiqueta: 'Call Center + campo' },
  { clave: 'paso_promesa_pago', etiqueta: 'Pagó lo que prometió' },
  { clave: 'coreografia', etiqueta: 'Coreografía completa' },
]

export interface FilaCoreo {
  episodios: number
  abiertos: number
  recuperados: number
  saldo: number
  pasos: Record<string, number | null>
  pendientes: number
  alertas: number
  fueraAlcance: number
  pctRecuperados: number | null
  efectividad: number | null
}

const ratio = (a: number, b: number) => (a + b ? a / (a + b) : null)

export function fila(xs: CoreoEpisodio[]): FilaCoreo {
  const pasos: Record<string, number | null> = {}
  for (const p of PASOS) {
    const cu = xs.filter((x) => x[p.clave] === CUMPLE).length
    const nc = xs.filter((x) => x[p.clave] === NO_CUMPLE).length
    pasos[p.clave as string] = ratio(cu, nc)
  }
  const decididos = xs.filter((x) => x.coreografia !== PENDIENTE)
  const exitos = decididos.filter((x) => x.coreografia === CUMPLE || x.recup_plazo === 1).length
  return {
    episodios: xs.length,
    abiertos: xs.filter((x) => x.estado === ABIERTO).length,
    recuperados: xs.filter((x) => x.estado === RECUPERADO).length,
    saldo: xs.reduce((a, x) => a + (x.saldo_entrada ?? 0), 0),
    pasos,
    pendientes: xs.filter((x) => x.coreografia === PENDIENTE).length,
    alertas: xs.filter((x) => x.alerta_sin_gestion).length,
    fueraAlcance: xs.filter((x) => x.fuera_alcance).length,
    pctRecuperados: xs.length ? xs.filter((x) => x.estado === RECUPERADO).length / xs.length : null,
    efectividad: decididos.length ? exitos / decididos.length : null,
  }
}

export function agrupar(xs: CoreoEpisodio[], clave: (x: CoreoEpisodio) => string): Map<string, FilaCoreo> {
  const grupos = new Map<string, CoreoEpisodio[]>()
  for (const x of xs) {
    const k = clave(x) || '(sin dato)'
    grupos.set(k, [...(grupos.get(k) ?? []), x])
  }
  return new Map([...grupos.entries()].map(([k, v]) => [k, fila(v)]))
}

// Estado de cada paso: cuántos cumplen, no cumplen, pendientes y por motivo.
export function conteoPasos(xs: CoreoEpisodio[]): { paso: string; estados: Record<string, number> }[] {
  return PASOS.map((p) => {
    const estados: Record<string, number> = {}
    for (const x of xs) {
      const v = (x[p.clave] as string | null) ?? '(sin dato)'
      estados[v] = (estados[v] ?? 0) + 1
    }
    return { paso: p.etiqueta, estados }
  })
}

export interface FilaFpd {
  cuentas: number
  saldoPagare: number
  vencen: number
  fpd: number
  pagareFpd: number
  tasa: number | null
  presupuesto: number | null
  cumplimiento: number | null
}

export function fpdResumen(xs: { saldopagare: number | null; fpd: boolean; vence_corte: boolean }[], presupuesto: number | null): FilaFpd {
  const pm = xs.reduce((a, x) => a + (x.saldopagare ?? 0), 0)
  const pf = xs.filter((x) => x.fpd).reduce((a, x) => a + (x.saldopagare ?? 0), 0)
  const tasa = pm ? pf / pm : null
  let cum: number | null = null
  if (presupuesto !== null && tasa !== null) cum = tasa === 0 ? 2 : Math.min(presupuesto / tasa, 2)
  return {
    cuentas: xs.length, saldoPagare: pm, vencen: xs.filter((x) => x.vence_corte).length,
    fpd: xs.filter((x) => x.fpd).length, pagareFpd: pf, tasa, presupuesto, cumplimiento: cum,
  }
}
