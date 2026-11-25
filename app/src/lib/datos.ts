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
  metaCanal: Record<string, number>    // canal → meta del mes (individual sumada o de canal)
  origenCanal: Record<string, 'individual' | 'canal'>
  metaAgente: Record<string, number>   // gestor → meta individual del mes
  canalGestor: Record<string, string>  // gestor → canal del mes (legal_canal)
}

export const CANALES_LEGAL = ['Embargo', 'Externo', 'Interno'] as const

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
  const canalGestor: Record<string, string> = {}
  for (const r of lc.data ?? []) if (r.canal) canalGestor[r.gestor] = r.canal

  const metaCanal: Record<string, number> = {}
  const origenCanal: Record<string, 'individual' | 'canal'> = {}
  for (const canal of CANALES_LEGAL) {
    const gestores = [...individual.keys()].filter((g) => canalGestor[g] === canal)
    if (gestores.length) {
      metaCanal[canal] = gestores.reduce((a, g) => a + (individual.get(g) ?? 0), 0)
      origenCanal[canal] = 'individual'
    } else if (porCanal.has(canal)) {
      metaCanal[canal] = porCanal.get(canal) as number
      origenCanal[canal] = 'canal'
    }
  }
  const valores = Object.values(metaCanal)
  const metaLegal = valores.length ? valores.reduce((a, b) => a + b, 0) : null
  const metaAgente = Object.fromEntries(individual)
  return { metaBucket, metaLegal, metaCanal, origenCanal, metaAgente, canalGestor }
}

// ----------------------------------------------------------------------------- Recaudo legal (0018)
export interface CreditoLegal {
  credito: string
  saldo: number
  gestor: string      // '' = sin asignar
  recaudo: number
  con_pago: boolean
  embargo: boolean
}

export async function recaudoLegalBase(fecha: string): Promise<CreditoLegal[]> {
  return lanzar(await supabase.rpc('recaudo_legal_base', { p_fecha: fecha }))
}

export async function recaudoLegalVigentes(fecha: string): Promise<{ credito: string; monto: number }[]> {
  return lanzar(await supabase.rpc('recaudo_legal_vigentes', { p_fecha: fecha }))
}

// ----------------------------------------------------------------------------- Roll rates (0019)
export interface CeldaRoll {
  origen: string   // '0'..'6' o 'Sin referencia'
  destino: string  // '0'..'6' o 'Sin registro'
  creditos: number
  saldo_base: number
  saldo_obs: number
}

export async function rollRatesGrilla(fecha: string, f: Filtros): Promise<CeldaRoll[]> {
  return lanzar(await supabase.rpc('roll_rates_grilla', { p_fecha: fecha, ...args(f) }))
}

// ----------------------------------------------------------------------------- Rodamiento real (0020)
export interface CeldaRodamiento {
  origen: string   // '0'..'6', 'Sin referencia' o 'Nuevo en el mes'
  destino: string  // '0'..'6' o 'Sin mora'
  creditos: number
  saldo_congelado: number
}

export async function rodamientoRealGrilla(fecha: string, f: Filtros): Promise<CeldaRodamiento[]> {
  return lanzar(await supabase.rpc('rodamiento_real_grilla', { p_fecha: fecha, ...args(f) }))
}

// ----------------------------------------------------------------------------- Cuentas a gestionar (0025, 0022)
export type VistaCuentas = 'cohorte' | 'activa'

export interface CuentaListado {
  credito: string
  origen: string
  destino: string
  movimiento: string
  saldo_congelado: number
  saldo_dia: number
  dias_mora: number | null
  prioridad: string
  estado_cobranza: string
  rango_intentos: string
  top: boolean
  gestiones_mes: number
  contacto_mes: number
  rpc_mes: number
  promesa_mes: number
  monto_prometido: number
  monto_pagado: number
  ultima_gestion: string | null
  dias_sin_gestion: number | null
  visitas_mes: number
  supervisor: string
  tipo_credito: string
  tipo_legal: string
  gestor: string
}

export async function cuentasListado(fecha: string, vista: VistaCuentas, f: Filtros): Promise<CuentaListado[]> {
  return lanzar(await supabase.rpc('cuentas_listado', { p_fecha: fecha, p_vista: vista, ...args(f) }))
}

export interface GestionDetalle {
  credito: string
  fecha_actividad: string
  usuario: string
  accion: string
  resultado: string
  contacto: number
  rpc: number
  promesa: number
  monto_promesa: number
  fecha_promesa: string | null
}

export interface VisitaDetalle {
  credito: string
  fecha_visita: string
  visitador: string
  accion: string
  resultado: string
  causa_no_pago: string
  parentesco: string
  num_fotos: number
  kilometros: number | null
}

// Consultas por lotes de créditos (la URL no admite listas muy largas).
async function porLotes<T>(creditos: string[], tabla: string, columnas: string, orden: string): Promise<T[]> {
  const salida: T[] = []
  for (let i = 0; i < creditos.length; i += 300) {
    const lote = creditos.slice(i, i + 300)
    const res = await supabase.from(tabla).select(columnas).in('credito', lote).order(orden, { ascending: false })
    if (res.error) throw new Error(res.error.message)
    salida.push(...((res.data ?? []) as T[]))
  }
  return salida
}

export function gestionesDe(creditos: string[]): Promise<GestionDetalle[]> {
  return porLotes<GestionDetalle>(creditos, 'gestion',
    'credito, fecha_actividad, usuario, accion, resultado, contacto, rpc, promesa, monto_promesa, fecha_promesa', 'fecha_actividad')
}

export function visitasDe(creditos: string[]): Promise<VisitaDetalle[]> {
  return porLotes<VisitaDetalle>(creditos, 'visita',
    'credito, fecha_visita, visitador, accion, resultado, causa_no_pago, parentesco, num_fotos, kilometros', 'fecha_visita')
}

// Datos personales (solo administradores generales: RLS es_super_admin en la base).
export interface ClienteDetalle {
  credito: string
  nombre_deudor: string | null
  edad: number | null
  genero: string | null
  salario: number | null
  profesion: string | null
  ubicacion: string | null
  dire_trabajo: string | null
  ciudad: string | null
}

export interface UbicacionDetalle {
  credito: string
  fecha_visita: string
  visitador: string
  resultado: string
  latitud: number
  longitud: number
}

export function clientesDe(creditos: string[]): Promise<ClienteDetalle[]> {
  return porLotes<ClienteDetalle>(creditos, 'cliente_loantape',
    'credito, nombre_deudor, edad, genero, salario, profesion, ubicacion, dire_trabajo, ciudad', 'credito')
}

export function ubicacionesDe(creditos: string[]): Promise<UbicacionDetalle[]> {
  return porLotes<UbicacionDetalle>(creditos, 'visita_ubicacion',
    'credito, fecha_visita, visitador, resultado, latitud, longitud', 'fecha_visita')
}

// Visitas del mes completas (el listado de la base pasa de 1,000 filas: se pagina).
async function todasLasFilas<T>(tabla: string, columnas: string, orden: string): Promise<T[]> {
  const salida: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const res = await supabase.from(tabla).select(columnas).order(orden, { ascending: true }).range(desde, desde + 999)
    if (res.error) throw new Error(res.error.message)
    const lote = (res.data ?? []) as T[]
    salida.push(...lote)
    if (lote.length < 1000) break
  }
  return salida
}

export function visitasMes(): Promise<VisitaDetalle[]> {
  return todasLasFilas<VisitaDetalle>('visita',
    'credito, fecha_visita, visitador, accion, resultado, causa_no_pago, parentesco, num_fotos, kilometros', 'fecha_visita')
}

export function ubicacionesMes(): Promise<UbicacionDetalle[]> {
  return todasLasFilas<UbicacionDetalle>('visita_ubicacion',
    'credito, fecha_visita, visitador, resultado, latitud, longitud', 'fecha_visita')
}

export interface GestionMes {
  credito: string
  fecha_actividad: string
  usuario: string
  contacto: number
  rpc: number
  promesa: number
  monto_promesa: number
}

export function gestionesMes(): Promise<GestionMes[]> {
  return todasLasFilas<GestionMes>('gestion',
    'credito, fecha_actividad, usuario, contacto, rpc, promesa, monto_promesa', 'fecha_actividad')
}

// Ficha de un crédito: su historial de cartera del mes y toda su actividad (lecturas pequeñas, por crédito).
export interface HistorialCartera {
  f_reporte: string
  saldo: number
  dias_mora: number | null
  bucket_actual: number | null
  gestor: string
  supervisor: string
  tipo_credito: string
  tipo_legal: string
}

export interface PagoCredito {
  fecha: string
  pago: number
  canal: string
}

export async function fichaCredito(credito: string): Promise<{
  historia: HistorialCartera[]; gestiones: GestionDetalle[]; pagos: PagoCredito[]; visitas: VisitaDetalle[]
}> {
  const [h, g, p, v] = await Promise.all([
    supabase.from('cobranza_diaria').select('f_reporte, saldo, dias_mora, bucket_actual, gestor, supervisor, tipo_credito, tipo_legal')
      .eq('credito', credito).order('f_reporte', { ascending: true }),
    supabase.from('gestion').select('credito, fecha_actividad, usuario, accion, resultado, contacto, rpc, promesa, monto_promesa, fecha_promesa')
      .eq('credito', credito).order('fecha_actividad', { ascending: false }),
    supabase.from('pago').select('fecha, pago, canal').eq('credito', credito).order('fecha', { ascending: false }),
    supabase.from('visita').select('credito, fecha_visita, visitador, accion, resultado, causa_no_pago, parentesco, num_fotos, kilometros')
      .eq('credito', credito).order('fecha_visita', { ascending: false }),
  ])
  for (const r of [h, g, p, v]) if (r.error) throw new Error(r.error.message)
  return {
    historia: (h.data ?? []) as HistorialCartera[],
    gestiones: (g.data ?? []) as GestionDetalle[],
    pagos: (p.data ?? []) as PagoCredito[],
    visitas: (v.data ?? []) as VisitaDetalle[],
  }
}
