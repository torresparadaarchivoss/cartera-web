// Comisiones de campo (services/comisiones.py). Reglas del tablero de motorizados:
// - Cuenta asignada: crédito × motorizado con visita en el mes; fecha de asignación = primera visita.
// - Solo las visitas con resultado válido generan recaudo, con los pagos de los N días siguientes a cada visita
//   (ventana [visita, visita + N]). Con varias visitas se toma la mayor ventana por motorizado × crédito.
// - Recaudo DMT (mensaje con tercero / cliente fuera del país): si hay recaudo DMT, se evalúa ese y con tasa DMT.
// - Recaudo meta = saldo vencido + cuota de la cartera del primer día (o del día de asignación). Válido = mín(evaluado, meta).
// - Tasa por due de inicio de mes; la cartera legal usa «Legal» y CJT/TEN usa «CJT». Comisión por mora con tope.
// - Paga cuota: recaudo válido > 0 y ≥ cuota. Alcance = % que paga cuota ÷ meta, con tope. Comisión cuentas pago =
//   monto × alcance.

export const ADMIN = 'Administrativa'
export const LEGAL = 'Legal'
export const CJT = 'CJT'
export const SIN_DUE = 'Sin dato'
export const CATEGORIAS = ['0', '1', '2', '3', '4', '5', '6', CJT, LEGAL] as const

export const RESULTADOS_VALIDOS = [
  'Bien en proceso de adjudicación', 'Seguimiento de acuerdo', 'Cliente pago en visita', 'Cliente solicita retiro',
  'Confirmación de Pago', 'Contacto Sin Promesa', 'Entrega Carta Mediacion', 'Pago pendiente por aplicar', 'Poder firmado',
  'Postergación de Pago', 'Promesa de Pago', 'Promesa No Cumplida', 'Dejé mensaje con Tercero', 'Cliente Fuera del País',
]
const DMT = ['deje mensaje con tercero', 'cliente fuera del pais']

export const TASA_EFECTIVA_DEFECTO: Record<string, number> = {
  '0': 0.02, '1': 0.03, '2': 0.04, '3': 0.05, '4': 0.05, '5': 0.05, '6': 0.05, [CJT]: 0.06, [LEGAL]: 0.06,
}
export const TASA_DMT_DEFECTO: Record<string, number> = {
  '0': 0.005, '1': 0.01, '2': 0.02, '3': 0.02, '4': 0.02, '5': 0.03, '6': 0.03, [CJT]: 0.03, [LEGAL]: 0.025,
}
export const GENERALES_DEFECTO = {
  tope_mora: 480, meta_cuentas_pago: 0.43, tope_alcance: 1.2, monto_cuentas_pago: 100, dias_dmt: 10,
}

export interface Parametros {
  tasaEfectiva: Record<string, number>
  tasaDmt: Record<string, number>
  tope_mora: number
  meta_cuentas_pago: number
  tope_alcance: number
  monto_cuentas_pago: number
  dias_dmt: number
}

// Valores guardados en Administración (parametros_comision) sobre los del tablero.
export function parametrosDesde(valores: Record<string, number>): Parametros {
  const p: Parametros = {
    tasaEfectiva: { ...TASA_EFECTIVA_DEFECTO },
    tasaDmt: { ...TASA_DMT_DEFECTO },
    ...GENERALES_DEFECTO,
  }
  for (const cat of CATEGORIAS) {
    p.tasaEfectiva[cat] = valores[`tasa_efectiva|${cat}`] ?? p.tasaEfectiva[cat]
    p.tasaDmt[cat] = valores[`tasa_dmt|${cat}`] ?? p.tasaDmt[cat]
  }
  for (const k of Object.keys(GENERALES_DEFECTO) as (keyof typeof GENERALES_DEFECTO)[]) {
    p[k] = valores[k] ?? p[k]
  }
  return p
}

export interface VisitaC {
  credito: string
  fecha_visita: string
  visitador: string
  resultado: string
  cod_resultado?: string
}
interface VisitaF extends VisitaC {
  fecha: string
}
export interface PagoC {
  credito: string
  fecha: string
  pago: number
}
export interface CarteraC {
  credito: string
  f_reporte: string
  saldo: number
  saldo_vencido: number | null
  valor_cuota: number | null
  due_inicio_mes: number | null
  tipo_cartera: string
  tipo_legal: string
}
export interface MiembroC {
  usuario: string
  equipo: string
  supervisor: string
}

export interface Cuenta {
  usuario: string
  equipo: string
  supervisor: string
  credito: string
  fecha_asignacion: string
  visita_valida: boolean
  categoria: string
  saldo: number
  cuota: number
  recaudo_meta: number
  recaudo: number
  recaudo_dmt: number
  recaudo_valido: number
  tasa: number
  comision: number
  paga_cuota: boolean
  codigo_visita: string
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const esDmt = (r: string) => DMT.includes(sinTildes(r))
export const esValido = (r: string) => {
  const validos = new Set(RESULTADOS_VALIDOS.map(sinTildes))
  return validos.has(sinTildes(r))
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diferenciaDias(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
}

// Cálculo por crédito × motorizado. f0 = primer día del mes; hasta = fecha de corte.
export function cuentas(
  visitas: VisitaC[], pagos: PagoC[], cartera: CarteraC[], equipo: MiembroC[],
  f0: string, hasta: string, prm: Parametros,
): Cuenta[] {
  const miembros = new Map(equipo.map((m) => [m.usuario, m]))
  const v: VisitaF[] = visitas.filter((x) => x.fecha_visita.slice(0, 10) <= hasta && miembros.has(x.visitador))
    .map((x) => ({ ...x, fecha: x.fecha_visita.slice(0, 10) }))
  if (v.length === 0) return []

  // Pares motorizado × crédito con su primera visita.
  const pares = new Map<string, { usuario: string; credito: string; fecha_asignacion: string }>()
  for (const x of v) {
    const k = `${x.visitador}|${x.credito}`
    const previa = pares.get(k)
    if (!previa || x.fecha < previa.fecha_asignacion) pares.set(k, { usuario: x.visitador, credito: x.credito, fecha_asignacion: x.fecha })
  }

  const validas = v.filter((x) => esValido(x.resultado))
  const validasKeys = new Set(validas.map((x) => `${x.visitador}|${x.credito}`))

  // Cartera por crédito: fila del primer día y la más cercana al día de asignación.
  const carteraPorCredito = new Map<string, CarteraC[]>()
  for (const c of cartera) carteraPorCredito.set(c.credito, [...(carteraPorCredito.get(c.credito) ?? []), c])

  // Pagos por crédito.
  const pagosPorCredito = new Map<string, PagoC[]>()
  for (const p of pagos) if (p.fecha <= hasta) pagosPorCredito.set(p.credito, [...(pagosPorCredito.get(p.credito) ?? []), p])

  // Mayor recaudo de la ventana [visita, visita + N] por motorizado × crédito.
  const ventana = (xs: VisitaF[]) => {
    const mejor = new Map<string, number>()
    const vistas = new Map<string, Set<string>>()
    for (const x of xs) {
      const k = `${x.visitador}|${x.credito}`
      const fin = sumarDias(x.fecha, prm.dias_dmt)
      const suma = (pagosPorCredito.get(x.credito) ?? [])
        .filter((p) => p.fecha >= x.fecha && p.fecha <= fin).reduce((a, p) => a + p.pago, 0)
      const conjunto = vistas.get(k) ?? new Set<string>()
      if (conjunto.has(x.fecha)) continue
      conjunto.add(x.fecha)
      vistas.set(k, conjunto)
      mejor.set(k, Math.max(mejor.get(k) ?? 0, suma))
    }
    return mejor
  }
  const recEf = ventana(v.filter((x) => !esDmt(x.resultado) && esValido(x.resultado)))
  const recDmt = ventana(v.filter((x) => esDmt(x.resultado) && esValido(x.resultado)))

  // Código de visita: los códigos de resultado de las visitas válidas del par (como el tablero).
  const codigos = new Map<string, Set<string>>()
  for (const x of validas) {
    const c = (x.cod_resultado ?? '').trim()
    if (!c) continue
    const k = `${x.visitador}|${x.credito}`
    codigos.set(k, (codigos.get(k) ?? new Set<string>()).add(c))
  }

  const salida: Cuenta[] = []
  for (const par of pares.values()) {
    const k = `${par.usuario}|${par.credito}`
    const m = miembros.get(par.usuario)!
    const filas = carteraPorCredito.get(par.credito) ?? []
    const cercana = filas.length
      ? filas.reduce((a, b) => (diferenciaDias(b.f_reporte, par.fecha_asignacion) < diferenciaDias(a.f_reporte, par.fecha_asignacion) ? b : a))
      : null
    const ini = filas.find((f) => f.f_reporte === f0) ?? cercana
    const venc0 = ini?.saldo_vencido ?? cercana?.saldo_vencido ?? 0
    const cuota = ini?.valor_cuota ?? cercana?.valor_cuota ?? 0
    const recaudoMeta = venc0 + cuota
    const legal = cercana?.tipo_cartera === LEGAL
    const cjt = !legal && ['CJT', 'TEN'].includes((cercana?.tipo_legal ?? '').trim().toUpperCase())
    const due = cercana?.due_inicio_mes
    const categoria = legal ? LEGAL : cjt ? CJT : due === null || due === undefined || Number.isNaN(due) ? SIN_DUE : String(Math.trunc(due))
    const recaudo = recEf.get(k) ?? 0
    const recaudoDmt = recDmt.get(k) ?? 0
    const conDmt = recaudoDmt > 0
    const evaluado = conDmt ? recaudoDmt : recaudo
    const recaudoValido = Math.min(evaluado, recaudoMeta)
    const tasa = (conDmt ? prm.tasaDmt[categoria] : prm.tasaEfectiva[categoria]) ?? 0
    salida.push({
      usuario: par.usuario, equipo: m.equipo, supervisor: m.supervisor, credito: par.credito,
      fecha_asignacion: par.fecha_asignacion, visita_valida: validasKeys.has(k), categoria,
      saldo: cercana?.saldo ?? 0, cuota, recaudo_meta: recaudoMeta, recaudo, recaudo_dmt: recaudoDmt,
      recaudo_valido: recaudoValido, tasa, comision: recaudoValido * tasa,
      paga_cuota: recaudoValido > 0 && recaudoValido >= cuota,
      codigo_visita: [...(codigos.get(k) ?? [])].sort().join(', '),
    })
  }
  return salida.sort((a, b) => a.equipo.localeCompare(b.equipo) || a.usuario.localeCompare(b.usuario) || a.fecha_asignacion.localeCompare(b.fecha_asignacion) || a.credito.localeCompare(b.credito))
}

export interface FilaResumen {
  supervisor: string
  motorizado: string
  usuario: string
  cuentas: number
  cuentasValidas: number
  cumpleCuota: number | null
  saldo: number
  recaudoValido: number
  eficiencia: number | null
  comisionMora: number
  comisionValida: number
  metaCuentaPago: number
  alcance: number
  comisionCuentasPago: number
  comisionTotal: number
}

export function resumenEquipo(cs: Cuenta[], equipo: MiembroC[], prm: Parametros, nombres: Map<string, string>, eq: string): FilaResumen[] {
  const miembros = equipo.filter((m) => m.equipo === eq).sort((a, b) => a.supervisor.localeCompare(b.supervisor) ||
    (nombres.get(a.usuario) ?? a.usuario).localeCompare(nombres.get(b.usuario) ?? b.usuario))
  return miembros.map((m) => {
    const g = cs.filter((c) => c.usuario === m.usuario)
    const n = g.length
    const paga = g.filter((c) => c.paga_cuota).length
    const saldo = g.reduce((a, c) => a + c.saldo, 0)
    const valido = g.reduce((a, c) => a + c.recaudo_valido, 0)
    const mora = g.reduce((a, c) => a + c.comision, 0)
    const cumple = n ? paga / n : null
    const alcance = prm.meta_cuentas_pago && cumple !== null ? Math.min(cumple / prm.meta_cuentas_pago, prm.tope_alcance) : 0
    const comisionValida = Math.min(mora, prm.tope_mora)
    const comisionCuentas = prm.monto_cuentas_pago * alcance
    return {
      supervisor: m.supervisor, motorizado: nombres.get(m.usuario) ?? m.usuario, usuario: m.usuario,
      cuentas: n, cuentasValidas: paga, cumpleCuota: cumple, saldo, recaudoValido: valido,
      eficiencia: saldo ? valido / saldo : null, comisionMora: mora, comisionValida, metaCuentaPago: prm.meta_cuentas_pago,
      alcance, comisionCuentasPago: comisionCuentas, comisionTotal: comisionValida + comisionCuentas,
    }
  })
}
