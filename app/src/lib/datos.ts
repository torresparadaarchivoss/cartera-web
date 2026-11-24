import { supabase } from './supabase'

// Filtros del menú lateral. Lista vacía = todos los valores (igual que el Streamlit).
export interface Filtros {
  supervisor: string[]
  tipo_credito: string[]
  tipo_legal: string[]
}

export interface Opciones {
  supervisor: string[]
  tipo_credito: string[]
  tipo_legal: string[]
}

export interface Stock {
  cuentas: number
  saldo: number
  cuentas_mora: number
  cuentas_mora_90: number
  saldo_mora_90: number
  indice_mora_90: number | null
}

export interface FilaGrupo {
  grupo: string
  cuentas: number
  saldo: number
  cuentas_mora: number
  saldo_mora_90: number
}

export interface PuntoSerie {
  f_reporte: string
  grupo: string
  saldo: number
}

export type Dimension = 'bucket' | 'supervisor' | 'tipo_credito' | 'tipo_cartera'

function args(f: Filtros) {
  return {
    p_supervisor: f.supervisor,
    p_tipo_credito: f.tipo_credito,
    p_tipo_legal: f.tipo_legal,
  }
}

function lanzar<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export async function fechas(): Promise<string[]> {
  return lanzar(await supabase.rpc('cartera_fechas'))
}

export async function opciones(): Promise<Opciones> {
  return lanzar(await supabase.rpc('cartera_opciones'))
}

export async function stock(fecha: string, f: Filtros): Promise<Stock> {
  return lanzar(await supabase.rpc('cartera_stock', { p_fecha: fecha, ...args(f) }))
}

export async function porDimension(fecha: string, dim: Dimension, f: Filtros): Promise<FilaGrupo[]> {
  return lanzar(await supabase.rpc('cartera_por_dimension', { p_fecha: fecha, p_dimension: dim, ...args(f) }))
}

export interface FlujoMes {
  cuentas: number
  gestiones: number
  creditos_gestionados: number
  creditos_contacto: number
  creditos_rpc: number
  creditos_promesa: number
  canceladas: number
}

export interface FilaFlujoGrupo {
  grupo: string
  cuentas: number
  gestionadas: number
  rpc: number
  monto_prometido: number
  monto_pagado: number
}

export async function pagadoPeriodo(fecha: string, f: Filtros, s: FiltrosSeccion): Promise<number> {
  return lanzar(await supabase.rpc('cartera_pagado_periodo', { p_fecha: fecha, ...args(f), ...argsSeccion(s) }))
}

export async function flujoPorDimension(fecha: string, dim: Dimension, f: Filtros): Promise<FilaFlujoGrupo[]> {
  return lanzar(await supabase.rpc('cartera_flujo_por_dimension', { p_fecha: fecha, p_dimension: dim, ...args(f) }))
}

export interface Bucket0Desmejora {
  desmejoran: number
  sin_gestion: number
}

export async function bucket0Desmejora(fecha: string, f: Filtros): Promise<Bucket0Desmejora> {
  return lanzar(await supabase.rpc('cartera_bucket0_desmejora', { p_fecha: fecha, ...args(f) }))
}

export interface PromesasEstado {
  cuentas: number
  monto: number
  saldo: number
  promesas: number
}

export interface PromesasResumen {
  Vencidas: PromesasEstado
  Vigentes: PromesasEstado
  'Promesado del mes': PromesasEstado
  'Del día': PromesasEstado
}

// Filtros propios de la sección Promesas (se suman a los globales).
export interface FiltrosSeccion {
  supervisor: string[]
  gestor: string[]
  top: 'Todas' | 'Solo Cuentas Top' | 'Sin Cuentas Top'
}

function argsSeccion(s: FiltrosSeccion) {
  return { p_sec_supervisor: s.supervisor, p_sec_gestor: s.gestor, p_top: s.top }
}

export async function promesaGestores(): Promise<string[]> {
  return lanzar(await supabase.rpc('promesa_gestores'))
}

export async function promesasResumen(fecha: string, f: Filtros, s: FiltrosSeccion): Promise<PromesasResumen> {
  return lanzar(await supabase.rpc('cartera_promesas', { p_fecha: fecha, ...args(f), ...argsSeccion(s) }))
}

export interface FilaPromesaTabla {
  fila: string
  vencidas: number
  vigentes: number
  promesado_mes: number
}

export async function promesasTabla(fecha: string, medida: 'monto' | 'saldo', f: Filtros, s: FiltrosSeccion): Promise<FilaPromesaTabla[]> {
  return lanzar(await supabase.rpc('cartera_promesas_tabla', { p_fecha: fecha, p_medida: medida, ...args(f), ...argsSeccion(s) }))
}

export interface PuntoPromesaDia {
  fecha: string
  vig_monto: number
  vig_saldo: number
  promesas_dia: number
}

export async function promesasSerie(fecha: string, f: Filtros, s: FiltrosSeccion): Promise<PuntoPromesaDia[]> {
  return lanzar(await supabase.rpc('cartera_promesas_serie', { p_fecha: fecha, ...args(f), ...argsSeccion(s) }))
}

export interface Cohorte {
  creditos_cohorte: number
  creditos_con_referencia: number
  creditos_sin_referencia: number
  saldo_base_con_referencia: number
  movimientos: Record<string, { creditos: number; saldo: number; pct_saldo: number | null }>
}

export async function cohorte(fecha: string, f: Filtros): Promise<Cohorte> {
  return lanzar(await supabase.rpc('cartera_cohorte', { p_fecha: fecha, ...args(f) }))
}

export async function flujoMes(fecha: string, f: Filtros): Promise<FlujoMes> {
  return lanzar(await supabase.rpc('cartera_gestion_mes', { p_fecha: fecha, ...args(f) }))
}

export async function serie(dim: Dimension, f: Filtros): Promise<PuntoSerie[]> {
  return lanzar(await supabase.rpc('cartera_serie', { p_dimension: dim, ...args(f) }))
}

// ----------------------------------------------------------------------------- Recuperación (0017)
export type BucketRecuperacion = 'bucket_pago' | 'bucket_inicial'

export interface FilaRecuperacion {
  fila: string // '0'..'6', 'Legal', 'Sin mora', 'Sin referencia' o 'Total'
  creditos: number
  pagos: number
  pagado: number
}

export async function recuperacionPorBucket(fecha: string, bucket: BucketRecuperacion, f: Filtros): Promise<FilaRecuperacion[]> {
  return lanzar(await supabase.rpc('recuperacion_por_bucket', { p_fecha: fecha, p_bucket: bucket, ...args(f) }))
}

export interface PagoDia {
  fecha: string
  pagado_dia: number
  pagado_acum: number
}

export async function recuperacionPagosDia(fecha: string, f: Filtros): Promise<PagoDia[]> {
  return lanzar(await supabase.rpc('recuperacion_pagos_dia', { p_fecha: fecha, ...args(f) }))
}

export interface MetasRecuperacion {
  metaBucket: Record<string, number>   // '0'..'6' → meta del mes (indicador recuperacion)
  metaLegal: number | null             // suma de metas de canal (Recaudo legal) del mes
}

// Réplica de services/recaudo_legal.metas: meta por canal = suma de metas individuales de sus gestores si las hay;
// si no, la meta del canal. La meta Legal es la suma de las metas de canal.
export async function metasRecuperacion(periodo: string): Promise<MetasRecuperacion> {
  const [mb, ml, lc] = await Promise.all([
    supabase.from('metas_bucket').select('bucket, valor_meta').eq('periodo', periodo).eq('indicador', 'recuperacion'),
    supabase.from('metas_legal').select('llave, indicador, valor_meta').eq('periodo', periodo),
    supabase.from('legal_canal').select('gestor, canal').eq('periodo', periodo),
  ])
  for (const r of [mb, ml, lc]) if (r.error) throw new Error(r.error.message)

  const metaBucket: Record<string, number> = {}
  for (const r of mb.data ?? []) if (r.valor_meta !== null) metaBucket[String(r.bucket)] = Number(r.valor_meta)

  const individual = new Map<string, number>()
  const porCanal = new Map<string, number>()
  for (const r of ml.data ?? []) {
    if (r.valor_meta === null) continue
    if (r.indicador === 'gestor') individual.set(r.llave, Number(r.valor_meta))
    if (r.indicador === 'canal') porCanal.set(r.llave, Number(r.valor_meta))
  }
  const canalDe = new Map((lc.data ?? []).map((r) => [r.gestor, r.canal]))

  let metaLegal: number | null = null
  for (const canal of ['Embargo', 'Externo', 'Interno']) {
    const gestores = [...individual.keys()].filter((g) => canalDe.get(g) === canal)
    let meta: number | undefined
    if (gestores.length) meta = gestores.reduce((a, g) => a + (individual.get(g) ?? 0), 0)
    else meta = porCanal.get(canal)
    if (meta !== undefined) metaLegal = (metaLegal ?? 0) + meta
  }
  return { metaBucket, metaLegal }
}
