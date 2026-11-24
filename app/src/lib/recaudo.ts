// Recaudo legal: cálculo de las tablas por canal y por agente (services/recaudo_legal.py).
import type { CreditoLegal, MetasRecuperacion } from './datos'
import { CANALES_LEGAL } from './datos'

export const SIN_ASIGNAR = 'Sin asignar'
export const SIN_CANAL = 'Sin canal'
export const ORDEN_CANAL = [...CANALES_LEGAL, SIN_ASIGNAR, SIN_CANAL]
export const PAGO = 'Pago'
export const EMBARGO = 'Embargo'
export const SIN_PAGO = 'Sin pago'
export const COMPROBANTES = [PAGO, EMBARGO, SIN_PAGO]

export interface FilaLegal {
  clave: string
  clientes: number
  clientesConPago: number
  pctClientesConPago: number | null
  saldo: number
  recaudo: number
  pctRecaudo: number | null
  metaFecha: number | null
  cumplFecha: number | null
  metaMes: number | null
  cumplMes: number | null
  promedio: number | null
}

const div = (a: number, b: number | null) => (b === null || b === 0 ? null : a / b)

// Réplica de services/recaudo_legal.fila: meta del mes × factor de prorrateo = meta a la fecha.
export function filaLegal(clave: string, creditos: CreditoLegal[], meta: number | null, factor: number): FilaLegal {
  const n = creditos.length
  const cp = creditos.filter((c) => c.con_pago).length
  const saldo = creditos.reduce((a, c) => a + c.saldo, 0)
  const recaudo = creditos.reduce((a, c) => a + c.recaudo, 0)
  const metaFecha = meta === null ? null : meta * factor
  return {
    clave,
    clientes: n,
    clientesConPago: cp,
    pctClientesConPago: div(cp, n || null),
    saldo,
    recaudo,
    pctRecaudo: div(recaudo, saldo || null),
    metaFecha,
    cumplFecha: div(recaudo, metaFecha),
    metaMes: meta,
    cumplMes: div(recaudo, meta),
    promedio: div(recaudo, cp || null),
  }
}

export function comprobanteDe(c: CreditoLegal): string {
  if (c.embargo) return EMBARGO
  return c.con_pago ? PAGO : SIN_PAGO
}

// Canal del crédito: un comprobante Embargo lo pasa a «Embargo»; si no, el canal de su gestor.
export function canalDe(c: CreditoLegal, meta: MetasRecuperacion): string {
  if (c.embargo) return EMBARGO
  if (!c.gestor) return SIN_ASIGNAR
  return meta.canalGestor[c.gestor] || SIN_CANAL
}

export function nombreAgente(g: string): string {
  return g ? g.toUpperCase() : SIN_ASIGNAR
}

// Tabla por canal: una fila por canal (en el orden del reporte) y el total (meta = suma de metas de canal).
export function tablaCanal(creditos: CreditoLegal[], meta: MetasRecuperacion, factor: number) {
  const por = new Map<string, CreditoLegal[]>()
  for (const c of creditos) {
    const k = canalDe(c, meta)
    por.set(k, [...(por.get(k) ?? []), c])
  }
  const claves = ORDEN_CANAL.filter((k) => por.has(k) || k in meta.metaCanal)
  const filas = claves.map((k) => filaLegal(k, por.get(k) ?? [], meta.metaCanal[k] ?? null, factor))
  const total = filaLegal('Total', creditos, meta.metaLegal, factor)
  return { filas, total }
}

export interface FilaAgente {
  agente: string
  canal: string
  meta: number | null
  recuperado: number
  semaforo: 'Verde' | 'Amarillo' | 'Rojo' | null
  alcance: number | null
  faltante: number | null
  vigentes: number
}

export function tablaAgente(
  creditos: CreditoLegal[],
  meta: MetasRecuperacion,
  factor: number,
  vigentes: Map<string, number>,
  verde: number,
  amarillo: number,
): { filas: FilaAgente[]; total: FilaAgente } {
  const por = new Map<string, CreditoLegal[]>()
  for (const c of creditos) {
    const k = nombreAgente(c.gestor)
    por.set(k, [...(por.get(k) ?? []), c])
  }
  const filas: FilaAgente[] = []
  for (const [agente, cs] of por) {
    const gestor = cs[0].gestor
    const canal = gestor ? meta.canalGestor[gestor] || SIN_CANAL : SIN_ASIGNAR
    const m = gestor && gestor in meta.metaAgente ? meta.metaAgente[gestor] : null
    filas.push(filaAgenteDe(agente, canal, m, cs, factor, vigentes, verde, amarillo))
  }
  filas.sort((a, b) => {
    const oa = ORDEN_CANAL.indexOf(a.canal)
    const ob = ORDEN_CANAL.indexOf(b.canal)
    if (oa !== ob) return oa - ob
    if (a.recuperado !== b.recuperado) return b.recuperado - a.recuperado
    return a.agente.localeCompare(b.agente)
  })
  const metas = filas.map((f) => f.meta).filter((x): x is number => x !== null)
  const sumaMetas = metas.length ? metas.reduce((a, b) => a + b, 0) : null
  const total = filaAgenteDe('Total', '', sumaMetas, creditos, factor, vigentes, verde, amarillo)
  return { filas, total }
}

function filaAgenteDe(
  agente: string, canal: string, meta: number | null, cs: CreditoLegal[], factor: number,
  vigentes: Map<string, number>, verde: number, amarillo: number,
): FilaAgente {
  const rec = cs.reduce((a, c) => a + c.recaudo, 0)
  const metaFecha = meta === null ? null : meta * factor
  const cumpl = div(rec, metaFecha)
  const semaforo = cumpl === null ? null : cumpl >= verde ? 'Verde' : cumpl >= amarillo ? 'Amarillo' : 'Rojo'
  return {
    agente,
    canal,
    meta,
    recuperado: rec,
    semaforo,
    alcance: div(rec, meta),
    faltante: meta === null ? null : Math.max(meta - rec, 0),
    vigentes: cs.reduce((a, c) => a + (vigentes.get(c.credito) ?? 0), 0),
  }
}
