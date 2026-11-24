import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useDatos } from '../lib/contexto'
import { fecha } from '../lib/formato'
import { MultiSelect, SelectBox } from './Selectores'

const PAGINAS = [
  { ruta: '/', etiqueta: 'Resumen gerencial' },
  { ruta: '/cartera', etiqueta: 'Cartera' },
  { ruta: '/recuperacion', etiqueta: 'Recuperación' },
]


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
            <SelectBox etiqueta="Fecha de seguimiento" opciones={[...fechas].reverse().map((f) => ({ valor: f, etiqueta: fecha(f) }))}
              valor={fechaSel ?? ''} onChange={setFecha} />
          )}
          {opciones && filtros && (
            <>
              <MultiSelect etiqueta="Supervisor" opciones={opciones.supervisor} valor={filtros.supervisor}
                onChange={(v) => setFiltros({ ...filtros, supervisor: v })} />
              <MultiSelect etiqueta="Tipo de crédito" opciones={opciones.tipo_credito} valor={filtros.tipo_credito}
                onChange={(v) => setFiltros({ ...filtros, tipo_credito: v })} />
              <MultiSelect etiqueta="Tipo legal" opciones={opciones.tipo_legal} valor={filtros.tipo_legal}
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
