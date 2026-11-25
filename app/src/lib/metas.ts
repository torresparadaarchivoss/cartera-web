import type { GestionMes, VisitaDetalle } from './datos'

// Resultado real del mes a la fecha de corte por usuario (services/targets_engine.py: real_agentes y real_visitadores).
// Pendiente: PRP (con y sin SGL) y monto pagado por gestor, que la base aún no trae.

export type TipoMeta = 'agente' | 'visitador'

export interface Indicador {
  clave: string
  etiqueta: string
  acumulable: boolean
  formato: 'entero' | 'decimal' | 'dinero'
}

export const INDICADORES: Record<TipoMeta, Indicador[]> = {
  agente: [
    { clave: 'gestiones', etiqueta: 'Gestiones', acumulable: true, formato: 'entero' },
    { clave: 'creditos_gestionados', etiqueta: 'Créditos gestionados', acumulable: true, formato: 'entero' },
    { clave: 'contactos', etiqueta: 'Contactos', acumulable: true, formato: 'entero' },
    { clave: 'rpc', etiqueta: 'RPC', acumulable: true, formato: 'entero' },
    { clave: 'promesas', etiqueta: 'Promesas (sin SGL)', acumulable: true, formato: 'entero' },
    { clave: 'monto_prometido', etiqueta: 'Monto prometido', acumulable: true, formato: 'dinero' },
  ],
  visitador: [
    { clave: 'visitas', etiqueta: 'Visitas', acumulable: true, formato: 'entero' },
    { clave: 'creditos_visitados', etiqueta: 'Créditos únicos visitados', acumulable: true, formato: 'entero' },
    { clave: 'visitas_dia_activo', etiqueta: 'Visitas por día activo', acumulable: false, formato: 'decimal' },
    { clave: 'kilometros', etiqueta: 'Kilómetros recorridos', acumulable: true, formato: 'decimal' },
  ],
}

export type Real = Record<string, number>

const normAgente = (u: string) => u.trim().toLowerCase()
const normVisitador = (u: string) => u.trim().toUpperCase()

export function realAgentes(gestiones: GestionMes[], corte: string): Map<string, Real> {
  const hasta = gestiones.filter((g) => g.fecha_actividad.slice(0, 10) <= corte)
  const out = new Map<string, Real>()
  const get = (u: string) => {
    const r = out.get(u) ?? { gestiones: 0, creditos_gestionados: 0, contactos: 0, rpc: 0, promesas: 0, monto_prometido: 0 }
    out.set(u, r)
    return r
  }
  const creditos = new Map<string, Set<string>>()
  for (const g of hasta) {
    const u = normAgente(g.usuario)
    const r = get(u)
    r.gestiones += 1
    r.contactos += g.contacto
    r.rpc += g.rpc
    r.promesas += g.promesa
    const s = creditos.get(u) ?? new Set<string>()
    s.add(g.credito)
    creditos.set(u, s)
  }
  for (const [u, s] of creditos) get(u).creditos_gestionados = s.size
  // Monto prometido: última promesa de cada crédito, a nombre de quien la registró.
  const ultima = new Map<string, GestionMes>()
  for (const g of hasta) {
    if (!g.promesa) continue
    const previa = ultima.get(g.credito)
    if (!previa || g.fecha_actividad > previa.fecha_actividad) ultima.set(g.credito, g)
  }
  for (const g of ultima.values()) get(normAgente(g.usuario)).monto_prometido += g.monto_promesa
  return out
}

export function realVisitadores(visitas: VisitaDetalle[], corte: string): Map<string, Real> {
  const hasta = visitas.filter((v) => v.fecha_visita.slice(0, 10) <= corte)
  const grupos = new Map<string, VisitaDetalle[]>()
  for (const v of hasta) {
    const u = normVisitador(v.visitador)
    grupos.set(u, [...(grupos.get(u) ?? []), v])
  }
  const out = new Map<string, Real>()
  for (const [u, xs] of grupos) {
    const dias = new Set(xs.map((x) => x.fecha_visita.slice(0, 10))).size
    out.set(u, {
      visitas: xs.length,
      creditos_visitados: new Set(xs.map((x) => x.credito)).size,
      visitas_dia_activo: dias ? xs.length / dias : 0,
      kilometros: xs.reduce((a, x) => a + (x.kilometros ?? 0), 0),
    })
  }
  return out
}

// Cumplimiento = real ÷ meta a la fecha (indicadores mínimos). Sin meta, no hay cumplimiento.
export function cumplimiento(real: number, metaAFecha: number | null): number | null {
  if (metaAFecha === null || metaAFecha === 0) return null
  return real / metaAFecha
}

export const normalizarUsuario = (tipo: TipoMeta, usuario: string) =>
  tipo === 'agente' ? normAgente(usuario) : normVisitador(usuario)
