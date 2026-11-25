import { useEffect, useState } from 'react'
import RecaudoLegalAdmin from '../components/RecaudoLegalAdmin'
import ParametrosAdmin from '../components/ParametrosAdmin'
import { useDatos } from '../lib/contexto'
import * as adm from '../lib/administracion'
import type { Asignacion, Asueto, MetaBucket, MetaUsuario, TipoUsuario, Usuario } from '../lib/administracion'
import { Nota, Titulo } from '../components/Bloques'
import { Radios } from '../components/Selectores'

// Administración (modules/admin.py). Solo administradores generales: la base también lo exige (RLS).
// Pendiente: importar el catálogo desde el Excel de PRP, sincronizar usuarios desde las fuentes, parámetros de
// comisión y coreografía, y recaudo legal (canal y meta por gestor).

const SECCIONES = ['Usuarios', 'Asignación', 'Metas por usuario', 'Metas por bucket', 'Recaudo legal', 'Parámetros', 'Asuetos y presupuesto FPD'] as const
type Seccion = (typeof SECCIONES)[number]
const DEPARTAMENTOS = ['Administrativa', 'Legal']

// Indicadores (services/targets_engine.py): clave, etiqueta, formato.
const IND_VISITADOR = [
  { clave: 'visitas', etiqueta: 'Visitas', formato: 'entero' },
  { clave: 'creditos_visitados', etiqueta: 'Créditos únicos visitados', formato: 'entero' },
  { clave: 'visitas_dia_activo', etiqueta: 'Visitas por día activo', formato: 'decimal' },
  { clave: 'kilometros', etiqueta: 'Kilómetros recorridos', formato: 'decimal' },
  { clave: 'prp', etiqueta: 'PRP (con SGL)', formato: 'entero' },
]
const IND_AGENTE = [
  { clave: 'gestiones', etiqueta: 'Gestiones', formato: 'entero' },
  { clave: 'creditos_gestionados', etiqueta: 'Créditos gestionados', formato: 'entero' },
  { clave: 'contactos', etiqueta: 'Contactos', formato: 'entero' },
  { clave: 'rpc', etiqueta: 'RPC', formato: 'entero' },
  { clave: 'promesas', etiqueta: 'Promesas (sin SGL)', formato: 'entero' },
  { clave: 'prp', etiqueta: 'PRP (con SGL)', formato: 'entero' },
  { clave: 'monto_prometido', etiqueta: 'Monto prometido', formato: 'dinero' },
  { clave: 'monto_pagado', etiqueta: 'Monto pagado', formato: 'dinero' },
  { clave: 'gestion_habil', etiqueta: 'Meta gestión día hábil', formato: 'decimal' },
  { clave: 'gestion_sabado', etiqueta: 'Meta gestión sábado', formato: 'decimal' },
  { clave: 'prp_habil', etiqueta: 'Meta PRP día hábil', formato: 'decimal' },
  { clave: 'prp_sabado', etiqueta: 'Meta PRP sábado', formato: 'decimal' },
]
const IND_BUCKET = [
  { clave: 'mejora_saldo', etiqueta: 'Mejora de saldo (%)', formato: 'pct' },
  { clave: 'mantiene_max', etiqueta: 'Mantiene máximo (%)', formato: 'pct' },
  { clave: 'desmejora_max', etiqueta: 'Desmejora máxima (%)', formato: 'pct' },
  { clave: 'recuperacion', etiqueta: 'Recuperación ($)', formato: 'dinero' },
]
const BUCKETS = ['0', '1', '2', '3', '4', '5', '6']

type Ind = { clave: string; etiqueta: string; formato: string }

// Mes anterior «aaaa-mm» (para copiar metas).
const mesAnterior = (periodo: string) => {
  const anio = Number(periodo.slice(0, 4))
  const mes = Number(periodo.slice(5, 7))
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`
}

const aTexto = (v: string) => (v.trim() === '' ? null : v.trim())
const aNumero = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))

export default function Administracion() {
  const { fecha: corte } = useDatos()
  const periodo = corte ? corte.slice(0, 7) : ''
  const [seccion, setSeccion] = useState<Seccion>('Usuarios')
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [asig, setAsig] = useState<Asignacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargarBase = () => {
    setError(null)
    Promise.all([adm.usuarios(), adm.asignaciones()])
      .then(([u, a]) => {
        setUsuarios(u)
        setAsig(a)
      })
      .catch((e: Error) => setError(e.message))
  }
  useEffect(cargarBase, [])

  if (error) return <div className="error-pantalla">No se pudo cargar la administración: {error}</div>
  if (!usuarios || !asig) return <p className="vacio">Cargando la administración…</p>

  return (
    <>
      <h1 style={{ marginBottom: 6 }}>Administración</h1>
      <p className="dc-desc">
        Usuarios, asignaciones mensuales, metas y parámetros. Cada cambio queda guardado con la fecha de la base.
      </p>
      <div className="dc-tarjeta">
        <Radios etiqueta="Sección" opciones={[...SECCIONES]} valor={seccion} onChange={(s) => { setAviso(null); setSeccion(s) }} />
      </div>
      {aviso && <Nota texto={aviso} />}
      {seccion === 'Usuarios' && <SeccionUsuarios usuarios={usuarios} onGuardado={(m) => { setAviso(m); cargarBase() }} />}
      {seccion === 'Asignación' && periodo && (
        <SeccionAsignacion periodo={periodo} usuarios={usuarios} asig={asig}
          onGuardado={(m) => { setAviso(m); cargarBase() }} />
      )}
      {seccion === 'Metas por usuario' && periodo && (
        <SeccionMetasUsuario periodo={periodo} usuarios={usuarios} asig={asig} onGuardado={(m) => setAviso(m)} />
      )}
      {seccion === 'Metas por bucket' && periodo && <SeccionMetasBucket periodo={periodo} onGuardado={(m) => setAviso(m)} />}
      {seccion === 'Recaudo legal' && periodo && corte && (
        <RecaudoLegalAdmin periodo={periodo} corte={corte} usuarios={usuarios} onGuardado={(m) => setAviso(m)} />
      )}
      {seccion === 'Parámetros' && periodo && <ParametrosAdmin periodo={periodo} onGuardado={(m) => setAviso(m)} />}
      {seccion === 'Asuetos y presupuesto FPD' && <SeccionAsuetos onGuardado={(m) => setAviso(m)} />}
    </>
  )
}

function SeccionUsuarios({ usuarios, onGuardado }: { usuarios: Usuario[]; onGuardado: (m: string) => void }) {
  const [tipo, setTipo] = useState<TipoUsuario>('agente')
  const [nuevo, setNuevo] = useState({ usuario: '', nombre: '', rol: 'agente' })
  const agregar = async () => {
    try {
      await adm.crearUsuario({ tipo, usuario: nuevo.usuario, nombre: nuevo.nombre, rol: tipo === 'agente' ? nuevo.rol : 'visitador' })
      setNuevo({ usuario: '', nombre: '', rol: 'agente' })
      onGuardado(`Usuario ${nuevo.usuario.trim()} agregado.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const [verInactivos, setVerInactivos] = useState(false)
  const [borrador, setBorrador] = useState<Record<number, { nombre: string; estado: 'activo' | 'inactivo' }>>({})
  const [error, setError] = useState<string | null>(null)
  const lista = usuarios.filter((u) => u.tipo === tipo && (verInactivos || u.estado === 'activo'))
  const valor = (u: Usuario) => borrador[u.id] ?? { nombre: u.nombre_mostrado ?? '', estado: u.estado }

  const guardar = async () => {
    const cambios = usuarios.filter((u) => borrador[u.id] && (
      borrador[u.id].nombre !== (u.nombre_mostrado ?? '') || borrador[u.id].estado !== u.estado))
    try {
      await adm.guardarUsuarios(cambios.map((u) => ({ id: u.id, nombre_mostrado: aTexto(borrador[u.id].nombre), estado: borrador[u.id].estado })))
      setBorrador({})
      onGuardado(`${cambios.length} usuarios guardados.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="dc-tarjeta">
      <Titulo texto="Catálogo de usuarios" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
        <Radios etiqueta="Tipo" opciones={['agente', 'visitador'] as TipoUsuario[]} valor={tipo} onChange={setTipo} />
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Incluir inactivos
        </label>
        <button className="boton" onClick={guardar} disabled={Object.keys(borrador).length === 0}>Guardar cambios</button>
      </div>
      {error && <div className="error-pantalla">{error}</div>}
      <table className="dc-tabla">
        <thead><tr><th>Usuario</th><th>Nombre mostrado</th><th>Estado</th></tr></thead>
        <tbody>
          {lista.map((u) => {
            const v = valor(u)
            return (
              <tr key={u.id}>
                <td>{u.usuario_norm}</td>
                <td><input value={v.nombre} onChange={(e) => setBorrador({ ...borrador, [u.id]: { ...v, nombre: e.target.value } })} /></td>
                <td>
                  <select value={v.estado} onChange={(e) => setBorrador({ ...borrador, [u.id]: { ...v, estado: e.target.value as 'activo' | 'inactivo' } })}>
                    <option value="activo">activo</option><option value="inactivo">inactivo</option>
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', margin: '8px 0' }}>
        <label style={{ fontSize: 12 }}>Usuario<br /><input value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Nombre mostrado<br /><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
        {tipo === 'agente' && (
          <label style={{ fontSize: 12 }}>Rol<br />
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
              <option value="agente">agente</option><option value="supervisor">supervisor</option><option value="visitador">visitador</option>
            </select>
          </label>
        )}
        <button className="boton" onClick={agregar} disabled={!nuevo.usuario.trim()}>Agregar usuario</button>
      </div>
      <p style={{ fontSize: 12 }}>Los usuarios que aparecen en la actividad del mes se dan de alta solos. Aquí se agregan los que no tienen actividad todavía.</p>
    </div>
  )
}

function SeccionAsignacion({ periodo, usuarios, asig, onGuardado }: {
  periodo: string; usuarios: Usuario[]; asig: Asignacion[]; onGuardado: (m: string) => void
}) {
  const [tipo, setTipo] = useState<TipoUsuario>('agente')
  const [borrador, setBorrador] = useState<Record<number, Partial<Asignacion>>>({})
  const [error, setError] = useState<string | null>(null)

  // Un mes sin registro hereda el último registrado (como en el Streamlit).
  const vigente = (uid: number): Asignacion | null => {
    const filas = asig.filter((a) => a.usuario_id === uid && a.periodo <= periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))
    return filas[0] ?? null
  }
  const lista = usuarios.filter((u) => u.tipo === tipo && u.estado === 'activo')
  const supervisores = [...new Set(asig.map((a) => a.supervisor).filter((s): s is string => !!s))].sort()
  const tramos = [...new Set(asig.map((a) => a.tramo).filter((s): s is string => !!s))].sort()

  const actual = (u: Usuario) => {
    const base = vigente(u.id)
    const b = borrador[u.id] ?? {}
    return {
      supervisor: b.supervisor !== undefined ? b.supervisor : base?.supervisor ?? null,
      tramo: b.tramo !== undefined ? b.tramo : base?.tramo ?? null,
      departamento: b.departamento !== undefined ? b.departamento : base?.departamento ?? null,
      heredado: base && base.periodo !== periodo ? base.periodo : null,
    }
  }

  const guardar = async () => {
    const filas: Asignacion[] = []
    for (const u of lista) {
      if (!borrador[u.id]) continue
      const v = actual(u)
      filas.push({ usuario_id: u.id, periodo, supervisor: v.supervisor, tramo: v.tramo, departamento: v.departamento })
    }
    try {
      await adm.guardarAsignaciones(filas)
      setBorrador({})
      onGuardado(`${filas.length} asignaciones guardadas para ${periodo}.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="dc-tarjeta">
      <Titulo texto={`Asignación de ${periodo}`} />
      <p style={{ fontSize: 12 }}>
        Supervisor y equipo (Administrativa o Legal) de cada usuario. Si un mes no tiene registro se usa el del último mes
        registrado («Viene de»). Al guardar solo se escriben las filas que cambiaste.
      </p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
        <Radios etiqueta="Tipo" opciones={['agente', 'visitador'] as TipoUsuario[]} valor={tipo} onChange={setTipo} />
        <button className="boton" onClick={guardar} disabled={Object.keys(borrador).length === 0}>Guardar asignación</button>
      </div>
      {error && <div className="error-pantalla">{error}</div>}
      <div style={{ maxHeight: 520, overflow: 'auto' }}>
        <table className="dc-tabla">
          <thead><tr><th>Usuario</th><th>Viene de</th><th>Supervisor</th><th>Tramo</th><th>Departamento</th></tr></thead>
          <tbody>
            {lista.map((u) => {
              const v = actual(u)
              return (
                <tr key={u.id}>
                  <td>{u.nombre_mostrado || u.usuario_norm}</td>
                  <td>{v.heredado ?? '—'}</td>
                  <td>
                    <select value={v.supervisor ?? ''} onChange={(e) => setBorrador({ ...borrador, [u.id]: { ...borrador[u.id], supervisor: aTexto(e.target.value) } })}>
                      <option value="">—</option>
                      {supervisores.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={v.tramo ?? ''} onChange={(e) => setBorrador({ ...borrador, [u.id]: { ...borrador[u.id], tramo: aTexto(e.target.value) } })}>
                      <option value="">—</option>
                      {tramos.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={v.departamento ?? ''} onChange={(e) => setBorrador({ ...borrador, [u.id]: { ...borrador[u.id], departamento: aTexto(e.target.value) } })}>
                      <option value="">—</option>
                      {DEPARTAMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SeccionMetasUsuario({ periodo, usuarios, asig, onGuardado }: {
  periodo: string; usuarios: Usuario[]; asig: Asignacion[]; onGuardado: (m: string) => void
}) {
  const [tipo, setTipo] = useState<TipoUsuario>('agente')
  const [verInactivos, setVerInactivos] = useState(false)
  const [metas, setMetas] = useState<MetaUsuario[] | null>(null)
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    setBorrador({})
    adm.metasUsuario(periodo).then(setMetas).catch((e: Error) => setError(e.message))
  }
  useEffect(cargar, [periodo])

  const inds: Ind[] = tipo === 'agente' ? IND_AGENTE : IND_VISITADOR
  const lista = usuarios.filter((u) => u.tipo === tipo && (verInactivos || u.estado === 'activo'))
  const clave = (uid: number, ind: string) => `${uid}|${ind}`
  const valorActual = (uid: number, ind: string): string => {
    if (clave(uid, ind) in borrador) return borrador[clave(uid, ind)]
    const m = metas?.find((x) => x.usuario_id === uid && x.indicador === ind)
    return m ? String(m.valor_meta) : ''
  }
  const tramoDe = (uid: number) => asig.filter((a) => a.usuario_id === uid && a.periodo <= periodo)
    .sort((a, b) => b.periodo.localeCompare(a.periodo))[0]

  // Copia las metas del mes anterior al borrador: se guardan con «Guardar metas».
  const copiar = async () => {
    try {
      const anterior = await adm.metasUsuario(mesAnterior(periodo))
      const b: Record<string, string> = {}
      for (const x of anterior) b[`${x.usuario_id}|${x.indicador}`] = String(x.valor_meta)
      setBorrador(b)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const guardar = async () => {
    const cambios: { usuario_id: number; indicador: string; valor: number | null }[] = []
    for (const [k, v] of Object.entries(borrador)) {
      const [uid, ind] = k.split('|')
      const previo = metas?.find((x) => x.usuario_id === Number(uid) && x.indicador === ind)?.valor_meta ?? null
      const nuevo = aNumero(v)
      if (nuevo === previo) continue
      cambios.push({ usuario_id: Number(uid), indicador: ind, valor: nuevo })
    }
    try {
      await adm.guardarMetasUsuario(periodo, cambios)
      onGuardado(`${cambios.length} metas guardadas para ${periodo}.`)
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="dc-tarjeta">
      <Titulo texto={`Metas por usuario · ${periodo}`} />
      <p style={{ fontSize: 12 }}>
        Celda vacía = sin meta. Borra una celda para quitar la meta. Las metas de gestión y PRP diarias (día hábil y
        sábado) son las del consolidado de PRP.
      </p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
        <Radios etiqueta="Tipo" opciones={['agente', 'visitador'] as TipoUsuario[]} valor={tipo} onChange={(t) => { setBorrador({}); setTipo(t) }} />
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Incluir inactivos
        </label>
        <button className="boton" onClick={copiar}>Copiar desde {mesAnterior(periodo)}</button>
        <button className="boton" onClick={guardar} disabled={Object.keys(borrador).length === 0}>Guardar metas</button>
      </div>
      {error && <div className="error-pantalla">{error}</div>}
      {!metas ? <p className="vacio">Cargando metas…</p> : (
        <div style={{ maxHeight: 560, overflow: 'auto' }}>
          <table className="dc-tabla">
            <thead>
              <tr>
                <th>Usuario</th>{tipo === 'agente' && <><th>Tramo</th><th>Supervisor</th></>}
                {inds.map((i) => <th key={i.clave}>{i.etiqueta}</th>)}
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre_mostrado || u.usuario_norm}</td>
                  {tipo === 'agente' && <><td>{tramoDe(u.id)?.tramo ?? '—'}</td><td>{tramoDe(u.id)?.supervisor ?? '—'}</td></>}
                  {inds.map((i) => (
                    <td key={i.clave}>
                      <input type="number" step={i.formato === 'entero' ? 1 : 0.01} min={0} style={{ width: 96 }}
                        value={valorActual(u.id, i.clave)}
                        onChange={(e) => setBorrador({ ...borrador, [clave(u.id, i.clave)]: e.target.value })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SeccionMetasBucket({ periodo, onGuardado }: { periodo: string; onGuardado: (m: string) => void }) {
  const [metas, setMetas] = useState<MetaBucket[] | null>(null)
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    setBorrador({})
    adm.metasBucket(periodo).then(setMetas).catch((e: Error) => setError(e.message))
  }
  useEffect(cargar, [periodo])

  const valorActual = (b: string, i: string) => {
    if (`${b}|${i}` in borrador) return borrador[`${b}|${i}`]
    const m = metas?.find((x) => x.bucket === b && x.indicador === i)
    return m?.valor_meta === null || m === undefined ? '' : String(m.valor_meta)
  }

  // Copia las metas del mes anterior al borrador (en porcentaje, como se muestran); se guardan con «Guardar».
  const copiar = async () => {
    try {
      const anterior = await adm.metasBucket(mesAnterior(periodo))
      const b: Record<string, string> = {}
      for (const x of anterior) {
        if (x.valor_meta === null) continue
        const esPct = IND_BUCKET.find((i) => i.clave === x.indicador)?.formato === 'pct'
        b[`${x.bucket}|${x.indicador}`] = String(esPct ? Number(x.valor_meta) * 100 : Number(x.valor_meta))
      }
      setBorrador(b)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const guardar = async () => {
    const cambios: { bucket: string; indicador: string; valor: number | null }[] = []
    for (const [k, v] of Object.entries(borrador)) {
      const [b, i] = k.split('|')
      const nuevo = aNumero(v)
      const previo = metas?.find((x) => x.bucket === b && x.indicador === i)?.valor_meta ?? null
      if (nuevo === previo) continue
      // Los porcentajes se capturan en 0 a 100 y se guardan como fracción (como en el Streamlit).
      const esPct = IND_BUCKET.find((x) => x.clave === i)?.formato === 'pct'
      cambios.push({ bucket: b, indicador: i, valor: nuevo === null ? null : esPct ? nuevo / 100 : nuevo })
    }
    try {
      await adm.guardarMetasBucket(periodo, cambios)
      onGuardado(`${cambios.length} metas por bucket guardadas para ${periodo}.`)
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="dc-tarjeta">
      <Titulo texto={`Metas por bucket · ${periodo}`} />
      <p style={{ fontSize: 12 }}>
        Porcentajes de 0 a 100. No aplica: mejora en bucket 0, desmejora en bucket 6. Recuperación en dólares por bucket.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="boton" onClick={copiar}>Copiar desde {mesAnterior(periodo)}</button>
        <button className="boton" onClick={guardar} disabled={Object.keys(borrador).length === 0}>Guardar metas por bucket</button>
      </div>
      {error && <div className="error-pantalla">{error}</div>}
      {!metas ? <p className="vacio">Cargando metas…</p> : (
        <table className="dc-tabla">
          <thead><tr><th>Bucket</th>{IND_BUCKET.map((i) => <th key={i.clave}>{i.etiqueta}</th>)}</tr></thead>
          <tbody>
            {BUCKETS.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                {IND_BUCKET.map((i) => {
                  const esPct = i.formato === 'pct'
                  const shown = (() => {
                    const v = valorActual(b, i.clave)
                    return esPct && v !== '' && !(`${b}|${i.clave}` in borrador) ? String(Number(v) * 100) : v
                  })()
                  return (
                    <td key={i.clave}>
                      <input type="number" step="0.01" min={0} style={{ width: 96 }} value={shown}
                        onChange={(e) => setBorrador({ ...borrador, [`${b}|${i.clave}`]: e.target.value })} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SeccionAsuetos({ onGuardado }: { onGuardado: (m: string) => void }) {
  const [asuetos, setAsuetos] = useState<Asueto[] | null>(null)
  const [presupuesto, setPresupuesto] = useState<{ mes: string; valor: string }[] | null>(null)
  const [nuevoFecha, setNuevoFecha] = useState('')
  const [nuevoDesc, setNuevoDesc] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    Promise.all([adm.asuetos(), adm.presupuestoFpd()])
      .then(([a, p]) => {
        setAsuetos(a)
        setPresupuesto(p.map((x) => ({ mes: x.mes, valor: String(x.valor) })))
      })
      .catch((e: Error) => setError(e.message))
  }
  useEffect(cargar, [])

  const agregarAsueto = async () => {
    if (!nuevoFecha) return
    try {
      await adm.guardarAsueto({ fecha: nuevoFecha, descripcion: aTexto(nuevoDesc) })
      setNuevoFecha('')
      setNuevoDesc('')
      onGuardado('Asueto guardado.')
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const quitarAsueto = async (fecha: string) => {
    try {
      await adm.borrarAsueto(fecha)
      onGuardado('Asueto quitado.')
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const guardarPresupuesto = async (mes: string, valor: string) => {
    const n = aNumero(valor)
    if (n === null) return
    try {
      await adm.guardarPresupuestoFpd({ mes, valor: n })
      onGuardado(`Presupuesto FPD de ${mes} guardado.`)
      cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (error) return <div className="error-pantalla">{error}</div>
  if (!asuetos || !presupuesto) return <p className="vacio">Cargando…</p>

  return (
    <>
      <div className="dc-tarjeta">
        <Titulo texto="Asuetos" />
        <p style={{ fontSize: 12 }}>Días sin hábil: no cuentan para el prorrateo de metas ni para los días de gestión.</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <div className="st-campo"><div className="st-etiqueta">Fecha</div>
            <input type="date" value={nuevoFecha} onChange={(e) => setNuevoFecha(e.target.value)} /></div>
          <div className="st-campo"><div className="st-etiqueta">Descripción</div>
            <input value={nuevoDesc} onChange={(e) => setNuevoDesc(e.target.value)} /></div>
          <button className="boton" onClick={agregarAsueto} disabled={!nuevoFecha}>Agregar asueto</button>
        </div>
        <table className="dc-tabla">
          <thead><tr><th>Fecha</th><th>Descripción</th><th></th></tr></thead>
          <tbody>
            {asuetos.map((a) => (
              <tr key={a.fecha}><td>{a.fecha}</td><td>{a.descripcion ?? '—'}</td>
                <td><button className="boton" onClick={() => quitarAsueto(a.fecha)}>Quitar</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dc-tarjeta">
        <Titulo texto="Presupuesto FPD por cosecha" />
        <p style={{ fontSize: 12 }}>Tasa máxima sobre el saldo pagaré (0,045 = 4,5 %), por mes de la primera cuota.</p>
        <table className="dc-tabla">
          <thead><tr><th>Mes</th><th>Tasa máxima</th></tr></thead>
          <tbody>
            {presupuesto.map((p, i) => (
              <tr key={p.mes}>
                <td>{p.mes}</td>
                <td>
                  <input type="number" step="0.0001" value={p.valor} style={{ width: 120 }}
                    onChange={(e) => setPresupuesto(presupuesto.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                    onBlur={(e) => guardarPresupuesto(p.mes, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
