import { supabase } from './supabase'

// Administración (modules/admin.py): lectura y escritura de usuarios, asignaciones, metas, asuetos y presupuesto.
// La escritura la permite la base solo a administradores generales (RLS es_super_admin); la pantalla lo limita igual.

export type TipoUsuario = 'agente' | 'visitador'

export interface Usuario {
  id: number
  tipo: TipoUsuario
  usuario_norm: string
  nombre_mostrado: string | null
  estado: 'activo' | 'inactivo'
  rol: string | null
}

export interface Asignacion {
  usuario_id: number
  periodo: string
  supervisor: string | null
  tramo: string | null
  departamento: string | null
}

export interface MetaUsuario {
  usuario_id: number
  periodo: string
  indicador: string
  valor_meta: number
}

export interface MetaBucket {
  bucket: string
  periodo: string
  indicador: string
  valor_meta: number | null
}

export interface Asueto {
  fecha: string
  descripcion: string | null
}

export interface PresupuestoFpd {
  mes: string
  valor: number
}

function revisar<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export async function usuarios(): Promise<Usuario[]> {
  return revisar(await supabase.from('usuarios').select('id, tipo, usuario_norm, nombre_mostrado, estado, rol')
    .order('tipo').order('usuario_norm'))
}

export async function guardarUsuarios(cambios: Pick<Usuario, 'id' | 'nombre_mostrado' | 'estado'>[]): Promise<void> {
  for (const c of cambios) {
    revisar(await supabase.from('usuarios').update({ nombre_mostrado: c.nombre_mostrado, estado: c.estado }).eq('id', c.id)
      .select('id'))
  }
}

export async function asignaciones(): Promise<Asignacion[]> {
  return revisar(await supabase.from('asignaciones').select('usuario_id, periodo, supervisor, tramo, departamento'))
}

export async function guardarAsignaciones(filas: Asignacion[]): Promise<void> {
  if (!filas.length) return
  revisar(await supabase.from('asignaciones').upsert(filas, { onConflict: 'usuario_id,periodo' }).select('usuario_id'))
}

export async function metasUsuario(periodo: string): Promise<MetaUsuario[]> {
  return revisar(await supabase.from('metas_usuario').select('usuario_id, periodo, indicador, valor_meta').eq('periodo', periodo))
}

// valor null = quitar la meta del mes (como en el Streamlit: celda vacía).
export async function guardarMetasUsuario(periodo: string, cambios: { usuario_id: number; indicador: string; valor: number | null }[]): Promise<void> {
  for (const c of cambios) {
    if (c.valor === null) {
      revisar(await supabase.from('metas_usuario').delete().eq('usuario_id', c.usuario_id).eq('periodo', periodo)
        .eq('indicador', c.indicador).select('usuario_id'))
    } else {
      revisar(await supabase.from('metas_usuario').upsert(
        { usuario_id: c.usuario_id, periodo, indicador: c.indicador, valor_meta: c.valor },
        { onConflict: 'usuario_id,periodo,indicador' }).select('usuario_id'))
    }
  }
}

export async function metasBucket(periodo: string): Promise<MetaBucket[]> {
  return revisar(await supabase.from('metas_bucket').select('bucket, periodo, indicador, valor_meta').eq('periodo', periodo))
}

export async function guardarMetasBucket(periodo: string, cambios: { bucket: string; indicador: string; valor: number | null }[]): Promise<void> {
  for (const c of cambios) {
    revisar(await supabase.from('metas_bucket').upsert(
      { bucket: c.bucket, periodo, indicador: c.indicador, valor_meta: c.valor },
      { onConflict: 'bucket,periodo,indicador' }).select('bucket'))
  }
}

export async function asuetos(): Promise<Asueto[]> {
  return revisar(await supabase.from('asuetos').select('fecha, descripcion').order('fecha'))
}

export async function guardarAsueto(a: Asueto): Promise<void> {
  revisar(await supabase.from('asuetos').upsert(a, { onConflict: 'fecha' }).select('fecha'))
}

export async function borrarAsueto(fecha: string): Promise<void> {
  revisar(await supabase.from('asuetos').delete().eq('fecha', fecha).select('fecha'))
}

export async function presupuestoFpd(): Promise<PresupuestoFpd[]> {
  return revisar(await supabase.from('presupuesto_fpd').select('mes, valor').order('mes'))
}

export async function guardarPresupuestoFpd(p: PresupuestoFpd): Promise<void> {
  revisar(await supabase.from('presupuesto_fpd').upsert(p, { onConflict: 'mes' }).select('mes'))
}

// Parámetros de comisión: por clave, el valor del último periodo registrado hasta el periodo (si no hay, el tablero).
export async function parametrosComision(periodo: string): Promise<Record<string, number>> {
  const filas = revisar(await supabase.from('parametros_comision').select('periodo, clave, valor').lte('periodo', periodo)
    .order('periodo', { ascending: false })) as { periodo: string; clave: string; valor: number }[]
  const salida: Record<string, number> = {}
  for (const f of filas) if (!(f.clave in salida)) salida[f.clave] = Number(f.valor)
  return salida
}

// Recaudo legal: canal por gestor (vigente: el del mes o el último registrado) y metas del mes por gestor o canal.
export interface CanalGestor {
  gestor: string
  canal: string | null
  periodo_origen: string
}

export interface MetaLegal {
  llave: string
  periodo: string
  indicador: 'gestor' | 'canal'
  valor_meta: number | null
}

export async function canalesLegal(periodo: string): Promise<CanalGestor[]> {
  const filas = revisar(await supabase.from('legal_canal').select('gestor, canal, periodo').lte('periodo', periodo)
    .order('periodo', { ascending: false })) as { gestor: string; canal: string; periodo: string }[]
  const vistos = new Map<string, CanalGestor>()
  for (const f of filas) if (!vistos.has(f.gestor)) vistos.set(f.gestor, { gestor: f.gestor, canal: f.canal, periodo_origen: f.periodo })
  return [...vistos.values()]
}

export async function metasLegal(periodo: string): Promise<MetaLegal[]> {
  return revisar(await supabase.from('metas_legal').select('llave, periodo, indicador, valor_meta').eq('periodo', periodo)) as MetaLegal[]
}

export async function guardarCanalesLegal(periodo: string, cambios: { gestor: string; canal: string }[]): Promise<void> {
  if (!cambios.length) return
  revisar(await supabase.from('legal_canal').upsert(cambios.map((c) => ({ gestor: c.gestor, periodo, canal: c.canal })),
    { onConflict: 'gestor,periodo' }).select('gestor'))
}

export async function guardarMetasLegal(periodo: string, cambios: { llave: string; indicador: 'gestor' | 'canal'; valor: number | null }[]): Promise<void> {
  for (const c of cambios) {
    if (c.valor === null) {
      revisar(await supabase.from('metas_legal').delete().eq('llave', c.llave).eq('periodo', periodo).eq('indicador', c.indicador).select('llave'))
    } else {
      revisar(await supabase.from('metas_legal').upsert({ llave: c.llave, periodo, indicador: c.indicador, valor_meta: c.valor },
        { onConflict: 'llave,periodo,indicador' }).select('llave'))
    }
  }
}
