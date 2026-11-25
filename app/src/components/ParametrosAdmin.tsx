import { useEffect, useState } from 'react'
import * as adm from '../lib/administracion'
import { TASA_DMT_DEFECTO, TASA_EFECTIVA_DEFECTO, GENERALES_DEFECTO, CATEGORIAS } from '../lib/comisiones'
import { Nota, Titulo } from './Bloques'

// Parámetros de comisión y de coreografía por mes (Administración → Parámetros). Un mes sin valores muestra los de
// fábrica (los del tablero); al guardar, se escriben solo los valores que cambian.

const COREO: { clave: string; etiqueta: string; defecto: number; paso?: string }[] = [
  { clave: 'dias_max_promesa', etiqueta: 'Días máx. de la promesa al pago', defecto: 5, paso: 'any' },
  { clave: 'dias_salida_campo_prorroga', etiqueta: 'Prórroga: días hábiles para salir a campo', defecto: 1, paso: 'any' },
  { clave: 'dias_visita_pyme', etiqueta: 'PYME: días hábiles para visitar', defecto: 2, paso: 'any' },
  { clave: 'dias_visita_fpd', etiqueta: 'FPD: días hábiles para visitar', defecto: 2, paso: 'any' },
  { clave: 'dias_fpd_desde_renovacion', etiqueta: 'FPD: días máx. desde la renovación', defecto: 60, paso: 'any' },
  { clave: 'dias_gracia_fpd', etiqueta: 'FPD: días de gracia tras la primera cuota', defecto: 0, paso: 'any' },
  { clave: 'bucket_max_pyme', etiqueta: 'PYME: bucket máximo de entrada', defecto: 2, paso: 'any' },
  { clave: 'bucket_max_prorroga', etiqueta: 'Prórroga: bucket máximo de entrada', defecto: 1, paso: 'any' },
  { clave: 'sabado_habil', etiqueta: 'Sábado hábil (1 sí, 0 no)', defecto: 1, paso: 'any' },
  { clave: 'dias_alerta_sin_gestion', etiqueta: 'Alerta: días sin gestión', defecto: 3, paso: 'any' },
  { clave: 'umbral_verde', etiqueta: 'Semáforo verde desde', defecto: 0.9, paso: '0.01' },
  { clave: 'umbral_amarillo', etiqueta: 'Semáforo amarillo desde', defecto: 0.7, paso: '0.01' },
]

const GENERALES: { clave: keyof typeof GENERALES_DEFECTO; etiqueta: string; paso: string }[] = [
  { clave: 'tope_mora', etiqueta: 'Tope de la comisión por mora ($)', paso: '0.01' },
  { clave: 'meta_cuentas_pago', etiqueta: 'Meta de cuentas que pagan cuota (fracción)', paso: '0.01' },
  { clave: 'tope_alcance', etiqueta: 'Tope del alcance de cuentas pago (fracción)', paso: '0.01' },
  { clave: 'monto_cuentas_pago', etiqueta: 'Comisión por cuentas pago al 100 % de alcance ($)', paso: '0.01' },
  { clave: 'dias_dmt', etiqueta: 'Días de la ventana de recaudo (efectivas y DMT)', paso: '1' },
]

export default function ParametrosAdmin({ periodo, onGuardado }: { periodo: string; onGuardado: (m: string) => void }) {
  // Valores guardados del mes (o del último mes anterior): comisión por su clave, coreografía con prefijo «coreo:».
  const [valores, setValores] = useState<Record<string, string>>({})
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    setError(null)
    Promise.all([adm.parametrosTabla('parametros_comision', periodo), adm.parametrosTabla('parametros_coreografia', periodo)])
      .then(([c, k]) => {
        const v: Record<string, string> = {}
        for (const [x, n] of Object.entries(c)) v[x] = String(n)
        for (const [x, n] of Object.entries(k)) v[`coreo:${x}`] = String(n)
        setValores(v)
        setBorrador({})
      })
      .catch((e: Error) => setError(e.message))
  }
  useEffect(cargar, [periodo]) // eslint-disable-line react-hooks/exhaustive-deps

  const mostrar = (clave: string, defecto: number) => borrador[clave] ?? valores[clave] ?? String(defecto)

  const guardar = async () => {
    try {
      const comCambios: { clave: string; valor: number }[] = []
      const coreoCambios: { clave: string; valor: number }[] = []
      for (const [clave, v] of Object.entries(borrador)) {
        const n = Number(v)
        if (v === '' || Number.isNaN(n)) continue
        if (clave.startsWith('coreo:')) coreoCambios.push({ clave: clave.slice(6), valor: n })
        else comCambios.push({ clave, valor: n })
      }
      await adm.guardarParametros('parametros_comision', periodo, comCambios)
      await adm.guardarParametros('parametros_coreografia', periodo, coreoCambios)
      onGuardado(`${comCambios.length + coreoCambios.length} parámetros guardados para ${periodo}.`)
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const campo = (paso: string, valorActual: string, onCambio: (v: string) => void) => (
    <input type="number" step={paso} value={valorActual} style={{ width: 120 }} onChange={(e) => onCambio(e.target.value)} />
  )

  if (error) return <div className="error-pantalla">{error}</div>
  return (
    <>
      <Nota texto={`Parámetros de ${periodo}. Un mes sin valores guardados usa los de fábrica (los del tablero).`} />
      <div className="dc-tarjeta">
        <Titulo texto="Comisión de motorizados (tasas y topes)" />
        <p style={{ fontSize: 12 }}>
          Tasas por due de inicio de mes (fracción): efectiva y DMT. Los valores mostrados son los del mes o los de fábrica.
        </p>
        <table className="dc-tabla">
          <thead><tr><th>Due de inicio de mes</th><th>Tasa efectiva</th><th>Tasa DMT</th></tr></thead>
          <tbody>
            {CATEGORIAS.map((c) => (
              <tr key={c}>
                <td>{c}</td>
                <td>{campo('0.001', mostrar(`tasa_efectiva|${c}`, TASA_EFECTIVA_DEFECTO[c]),
                  (v) => setBorrador({ ...borrador, [`tasa_efectiva|${c}`]: v }))}</td>
                <td>{campo('0.001', mostrar(`tasa_dmt|${c}`, TASA_DMT_DEFECTO[c]),
                  (v) => setBorrador({ ...borrador, [`tasa_dmt|${c}`]: v }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="dc-tabla" style={{ marginTop: 12 }}>
          <tbody>
            {GENERALES.map((g) => (
              <tr key={g.clave}>
                <td>{g.etiqueta}</td>
                <td>{campo(g.paso, mostrar(g.clave, GENERALES_DEFECTO[g.clave]),
                  (v) => setBorrador({ ...borrador, [g.clave]: v }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dc-tarjeta">
        <Titulo texto="Coreografías de gestión" />
        <table className="dc-tabla">
          <tbody>
            {COREO.map((p) => (
              <tr key={p.clave}>
                <td>{p.etiqueta}</td>
                <td>{campo(p.paso ?? 'any', mostrar(`coreo:${p.clave}`, p.defecto),
                  (v) => setBorrador({ ...borrador, [`coreo:${p.clave}`]: v }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="boton" onClick={guardar}>Guardar parámetros</button>
    </>
  )
}
