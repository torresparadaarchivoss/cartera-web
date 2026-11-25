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
    { clave: 'prp', etiqueta: 'PRP (con SGL)', acumulable: true, formato: 'entero' },
    { clave: 'promesas', etiqueta: 'Promesas (sin SGL)', acumulable: true, formato: 'entero' },
    { clave: 'monto_prometido', etiqueta: 'Monto prometido', acumulable: true, formato: 'dinero' },
  ],
  visitador: [
    { clave: 'visitas', etiqueta: 'Visitas', acumulable: true, formato: 'entero' },
    { clave: 'creditos_visitados', etiqueta: 'Créditos únicos visitados', acumulable: true, formato: 'entero' },
    { clave: 'visitas_dia_activo', etiqueta: 'Visitas por día activo', acumulable: false, formato: 'decimal' },
    { clave: 'prp', etiqueta: 'PRP (con SGL)', acumulable: true, formato: 'entero' },
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
    const r = out.get(u) ?? { gestiones: 0, creditos_gestionados: 0, contactos: 0, rpc: 0, promesas: 0, prp: 0, monto_prometido: 0 }
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
    r.promesas += g.promesa_catalogo
    r.prp += g.prp
    if (g.gestionada === 1) {
      const s = creditos.get(u) ?? new Set<string>()
      s.add(g.credito)
      creditos.set(u, s)
    }
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

export function realVisitadores(visitas: VisitaDetalle[], gestiones: GestionMes[], corte: string): Map<string, Real> {
  // PRP de un visitador: sus gestiones (con su mismo usuario) con código PRP, como en el Streamlit.
  const prp = new Map<string, number>()
  for (const g of gestiones) {
    if (g.fecha_actividad.slice(0, 10) > corte) continue
    const u = normAgente(g.usuario)
    prp.set(u, (prp.get(u) ?? 0) + g.prp)
  }
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
      prp: prp.get(normAgente(u)) ?? 0,
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

// Meta mensual de gestiones cuando no se capturó: meta día hábil × días hábiles del mes + meta sábado × sábados
// (services/targets_engine.completar_mensuales). Lunes a viernes pesan según PESOS; el sábado cuenta si su peso es > 0.
export function diasDelMes(periodo: string, pesos: number[]): { habiles: number; sabados: number } {
  const [a, m] = periodo.split('-').map(Number)
  const fin = new Date(a, m, 0).getDate()
  let habiles = 0
  let sabados = 0
  for (let dia = 1; dia <= fin; dia++) {
    const d = new Date(a, m - 1, dia).getDay() // 0 = domingo
    const idx = (d + 6) % 7 // 0 = lunes … 6 = domingo, como PESOS_DIAS
    if (idx < 5) habiles += pesos[idx] / pesos[0]
    if (idx === 5 && pesos[5] > 0) sabados += 1
  }
  return { habiles, sabados }
}

export interface MetaFila {
  usuario_id: number
  indicador: string
  valor_meta: number | null
}

// Metas mensuales vacías: se derivan de la diaria del usuario (services/targets_engine.completar_mensuales):
// gestiones (de gestion_habil y gestion_sabado) y PRP (de prp_habil y prp_sabado). Las derivadas se marcan.
const DERIVADAS: [string, string][] = [['gestiones', 'gestion'], ['prp', 'prp']]

export function completarGestiones(metas: MetaFila[], periodo: string, pesos: number[]): (MetaFila & { derivada?: boolean })[] {
  const salida: (MetaFila & { derivada?: boolean })[] = [...metas]
  const { habiles, sabados } = diasDelMes(periodo, pesos)
  const ids = new Set(metas.map((m) => m.usuario_id))
  const llenas = (ind: string) => new Map(metas.filter((m) => m.indicador === ind && m.valor_meta !== null)
    .map((m) => [m.usuario_id, m.valor_meta as number] as const))
  const proporcionSabado = pesos[0] ? pesos[5] / pesos[0] : 0.5
  for (const [mensual, base] of DERIVADAS) {
    const habil = llenas(`${base}_habil`)
    const sabado = llenas(`${base}_sabado`)
    const ya = new Set(metas.filter((m) => m.indicador === mensual && m.valor_meta !== null).map((m) => m.usuario_id))
    for (const uid of ids) {
      if (ya.has(uid) || !habil.has(uid)) continue
      const h = habil.get(uid) ?? 0
      const sab = sabado.get(uid) ?? h * proporcionSabado
      salida.push({ usuario_id: uid, indicador: mensual, valor_meta: h * habiles + sab * sabados, derivada: true })
    }
  }
  return salida
}
