import { useEffect, useState } from 'react'
import * as adm from '../lib/administracion'
import type { Usuario } from '../lib/administracion'
import * as datos from '../lib/datos'
import { CANALES_LEGAL } from '../lib/datos'
import { Nota, Titulo } from './Bloques'

// Recaudo legal en Administración (modules/admin._tab_recaudo_legal): canal por gestor, meta individual y meta por canal.

type Borrador = Record<string, { canal?: string; meta?: string }>

function mesAnterior(periodo: string): string {
  const anio = Number(periodo.slice(0, 4))
  const mes = Number(periodo.slice(5, 7))
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`
}

export default function RecaudoLegalAdmin({ periodo, corte, usuarios, onGuardado }: {
  periodo: string
  corte: string
  usuarios: Usuario[]
  onGuardado: (m: string) => void
}) {
  const [vigentes, setVigentes] = useState<adm.CanalGestor[]>([])
  const [metas, setMetas] = useState<adm.MetaLegal[]>([])
  const [cuentas, setCuentas] = useState<Map<string, number>>(new Map())
  const [borrador, setBorrador] = useState<Borrador>({})
  const [canalMeta, setCanalMeta] = useState<Record<string, string>>({})
  const [origen, setOrigen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = (per: string) => {
    setError(null)
    Promise.all([adm.canalesLegal(per), adm.metasLegal(per), datos.recaudoLegalBase(corte)])
      .then(([v, m, base]) => {
        setVigentes(v)
        setMetas(m)
        const c = new Map<string, number>()
        for (const x of base) if (x.gestor) c.set(x.gestor, (c.get(x.gestor) ?? 0) + 1)
        setCuentas(c)
        setBorrador({})
        setCanalMeta(Object.fromEntries(m.filter((x) => x.indicador === 'canal').map((x) => [x.llave, String(x.valor_meta ?? '')])))
        setOrigen(null)
      })
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => {
    cargar(periodo)
  }, [periodo, corte]) // eslint-disable-line react-hooks/exhaustive-deps

  const nombres = new Map(usuarios.map((u) => [u.usuario_norm.toLowerCase(), u.nombre_mostrado || u.usuario_norm] as const))
  const metaGestor = (g: string) => metas.find((m) => m.indicador === 'gestor' && m.llave === g)?.valor_meta ?? null
  const canalVigente = (g: string) => vigentes.find((v) => v.gestor === g)
  const gestores = [...new Set([
    ...cuentas.keys(),
    ...vigentes.map((v) => v.gestor),
    ...metas.filter((m) => m.indicador === 'gestor').map((m) => m.llave),
  ])].sort()

  const valorCanal = (g: string) => borrador[g]?.canal ?? canalVigente(g)?.canal ?? ''
  const valorMeta = (g: string) => borrador[g]?.meta ?? (metaGestor(g) === null ? '' : String(metaGestor(g)))

  // Meta por canal: la suma de las individuales de sus gestores; si ninguno tiene, la del canal.
  const filasCanal = CANALES_LEGAL.map((c) => {
    const gs = gestores.filter((g) => valorCanal(g) === c && valorMeta(g) !== '')
    const suma = gs.length ? gs.reduce((a, g) => a + Number(valorMeta(g)), 0) : null
    const propia = canalMeta[c] ? Number(canalMeta[c]) : null
    return { c, suma, propia, usada: suma ?? propia }
  })
  const totalLegal = filasCanal.reduce((a, f) => a + (f.usada ?? 0), 0)

  const guardar = async () => {
    try {
      const canales = gestores
        .filter((g) => borrador[g]?.canal && borrador[g]!.canal !== (canalVigente(g)?.canal ?? ''))
        .map((g) => ({ gestor: g, canal: borrador[g]!.canal! }))
      await adm.guardarCanalesLegal(periodo, canales)
      const cambios: { llave: string; indicador: 'gestor' | 'canal'; valor: number | null }[] = []
      for (const g of gestores) {
        if (borrador[g]?.meta === undefined) continue
        const nuevo = borrador[g]!.meta === '' ? null : Number(borrador[g]!.meta)
        if (nuevo !== metaGestor(g)) cambios.push({ llave: g, indicador: 'gestor', valor: nuevo })
      }
      for (const f of filasCanal) {
        const actual = metas.find((m) => m.indicador === 'canal' && m.llave === f.c)?.valor_meta ?? null
        const nuevo = canalMeta[f.c] ? Number(canalMeta[f.c]) : null
        if (nuevo !== actual) cambios.push({ llave: f.c, indicador: 'canal', valor: nuevo })
      }
      await adm.guardarMetasLegal(periodo, cambios)
      onGuardado(`${canales.length + cambios.length} cambios guardados para ${periodo}.`)
      cargar(periodo)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const copiarMes = async () => {
    try {
      const anterior = mesAnterior(periodo)
      const m = await adm.metasLegal(anterior)
      setCanalMeta(Object.fromEntries(m.filter((x) => x.indicador === 'canal').map((x) => [x.llave, String(x.valor_meta ?? '')])))
      const b: Borrador = {}
      for (const x of m.filter((x) => x.indicador === 'gestor')) b[x.llave] = { meta: String(x.valor_meta ?? '') }
      setBorrador(b)
      setOrigen(anterior)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (error) return <div className="error-pantalla">{error}</div>
  return (
    <>
      <div className="dc-tarjeta">
        <Titulo texto={`Canal y meta por gestor · ${periodo}`} />
        <p style={{ fontSize: 12 }}>
          Canal de cada gestor de la cartera legal (JUR). Un mes sin cambios hereda el último registrado («Viene de»). Meta
          individual: monto del mes de cada gestor.
        </p>
        {origen && <Nota tipo="alerta" texto={`Metas precargadas con las de ${origen}. Revisa y guarda para aplicarlas a ${periodo}.`} />}
        <div className="ventana" style={{ maxHeight: 420 }}>
          <table className="dc-tabla">
            <thead>
              <tr><th>Gestor</th><th>Nombre</th><th>Cuentas legales</th><th>Canal</th><th>Viene de</th><th>Meta individual ($)</th></tr>
            </thead>
            <tbody>
              {gestores.map((g) => (
                <tr key={g}>
                  <td>{g}</td>
                  <td>{nombres.get(g) ?? g.toUpperCase()}</td>
                  <td>{cuentas.get(g) ?? 0}</td>
                  <td>
                    <select value={valorCanal(g)} onChange={(e) => setBorrador({ ...borrador, [g]: { ...borrador[g], canal: e.target.value } })}>
                      <option value="">—</option>
                      {CANALES_LEGAL.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>{canalVigente(g)?.periodo_origen ?? '—'}</td>
                  <td>
                    <input type="number" min={0} step="0.01" style={{ width: 120 }} value={valorMeta(g)}
                      onChange={(e) => setBorrador({ ...borrador, [g]: { ...borrador[g], meta: e.target.value } })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dc-tarjeta">
        <Titulo texto="Meta por canal" />
        <p style={{ fontSize: 12 }}>La meta de un canal es la suma de las metas individuales de sus gestores; si ninguno tiene, se usa la meta del canal.</p>
        <table className="dc-tabla">
          <thead><tr><th>Canal</th><th>Suma de metas individuales</th><th>Meta del canal ($)</th><th>Meta que se usa</th></tr></thead>
          <tbody>
            {filasCanal.map((f) => (
              <tr key={f.c}>
                <td>{f.c}</td>
                <td>{f.suma === null ? '—' : f.suma.toFixed(2)}</td>
                <td>
                  <input type="number" min={0} step="0.01" style={{ width: 140 }} value={canalMeta[f.c] ?? ''}
                    onChange={(e) => setCanalMeta({ ...canalMeta, [f.c]: e.target.value })} />
                </td>
                <td>{f.usada === null ? '—' : f.usada.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="total"><td>Legal</td><td /><td /><td>{totalLegal.toFixed(2)}</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="boton" onClick={guardar}>Guardar recaudo legal</button>
        <button className="boton" onClick={copiarMes}>Copiar metas desde el mes anterior</button>
      </div>
    </>
  )
}
