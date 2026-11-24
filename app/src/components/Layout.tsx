import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useDatos } from '../lib/contexto'
import { fecha } from '../lib/formato'

const PAGINAS = [
  { ruta: '/', etiqueta: 'Resumen gerencial' },
  { ruta: '/cartera', etiqueta: 'Cartera' },
  { ruta: '/recuperacion', etiqueta: 'Recuperación' },
]

const SIN_DATO = '(sin dato)'

function Multi({ etiqueta, valores, seleccion, onChange, nombre }: {
  etiqueta: string
  valores: string[]
  seleccion: string[]
  onChange: (v: string[]) => void
  nombre?: (v: string) => string
}) {
  return (
    <label>
      {etiqueta}
      <select
        multiple
        value={seleccion}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      >
        {valores.map((v) => (
          <option key={v} value={v}>{nombre ? nombre(v) : (v || SIN_DATO)}</option>
        ))}
      </select>
    </label>
  )
}

export default function Layout() {
  const { perfil, cerrarSesion } = useAuth()
  const { fechas, fecha: fechaSel, setFecha, opciones, filtros, setFiltros, cargando, error } = useDatos()
  const ubicacion = useLocation()

  return (
    <>
      <header className="barra-sup">
        <img src={`${import.meta.env.BASE_URL}brand/logo_oscuro.png`} alt="Instacredit" />
        <span className="usuario">{perfil?.nombre ?? ''}</span>
        <span className="sep" />
        <button className="boton" onClick={() => void cerrarSesion()}>Salir</button>
      </header>
      <div className="con-lateral">
        <aside className="lateral">
          <div className="marca">Cartera y cobranza · El Salvador</div>
          <nav style={{ display: 'grid', gap: 4 }}>
            {PAGINAS.map((p) => (
              <Link key={p.ruta} to={p.ruta} className={ubicacion.pathname === p.ruta ? 'activo' : undefined}
                style={{ color: 'var(--indigo)', textDecoration: 'none', padding: '0.28rem 0.5rem', borderRadius: 8, fontWeight: ubicacion.pathname === p.ruta ? 700 : 600,
                  background: ubicacion.pathname === p.ruta ? '#eaf5ec' : undefined }}>
                {p.etiqueta}
              </Link>
            ))}
          </nav>
          <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--linea)' }} />
          {cargando && <div className="vacio">Cargando fechas…</div>}
          {error && <div className="error-pantalla">{error}</div>}
          {fechas.length > 0 && (
            <label>
              Fecha de seguimiento
              <select value={fechaSel ?? ''} onChange={(e) => setFecha(e.target.value)}>
                {[...fechas].reverse().map((f) => <option key={f} value={f}>{fecha(f)}</option>)}
              </select>
            </label>
          )}
          {opciones && filtros && (
            <>
              <Multi etiqueta="Supervisor" valores={opciones.supervisor} seleccion={filtros.supervisor}
                onChange={(v) => setFiltros({ ...filtros, supervisor: v })} />
              <Multi etiqueta="Tipo de crédito" valores={opciones.tipo_credito} seleccion={filtros.tipo_credito}
                onChange={(v) => setFiltros({ ...filtros, tipo_credito: v })} />
              <Multi etiqueta="Tipo legal" valores={opciones.tipo_legal} seleccion={filtros.tipo_legal}
                onChange={(v) => setFiltros({ ...filtros, tipo_legal: v })} />
              <div className="marca">Un filtro vacío incluye todos los valores. Tipo legal excluye JUR por defecto.</div>
            </>
          )}
          {fechas.length > 0 && (
            <div className="marca">
              Fechas disponibles: {fecha(fechas[0])} al {fecha(fechas[fechas.length - 1])}.
            </div>
          )}
        </aside>
        <main className="contenido">
          <Outlet />
        </main>
      </div>
    </>
  )
}
