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

export async function promesasResumen(fecha: string, f: Filtros): Promise<PromesasResumen> {
  return lanzar(await supabase.rpc('cartera_promesas', { p_fecha: fecha, ...args(f) }))
}

export interface FilaPromesaTabla {
  fila: string
  vencidas: number
  vigentes: number
  promesado_mes: number
}

export async function promesasTabla(fecha: string, medida: 'monto' | 'saldo', f: Filtros): Promise<FilaPromesaTabla[]> {
  return lanzar(await supabase.rpc('cartera_promesas_tabla', { p_fecha: fecha, p_medida: medida, ...args(f) }))
}

export interface PuntoPromesaDia {
  fecha: string
  vig_monto: number
  vig_saldo: number
  promesas_dia: number
}

export async function promesasSerie(fecha: string, f: Filtros): Promise<PuntoPromesaDia[]> {
  return lanzar(await supabase.rpc('cartera_promesas_serie', { p_fecha: fecha, ...args(f) }))
}

export async function flujoMes(fecha: string, f: Filtros): Promise<FlujoMes> {
  return lanzar(await supabase.rpc('cartera_gestion_mes', { p_fecha: fecha, ...args(f) }))
}

export async function serie(dim: Dimension, f: Filtros): Promise<PuntoSerie[]> {
  return lanzar(await supabase.rpc('cartera_serie', { p_dimension: dim, ...args(f) }))
}
