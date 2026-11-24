import { Outlet, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const { perfil, cerrarSesion } = useAuth()
  return (
    <>
      <header className="barra">
        <img src={`${import.meta.env.BASE_URL}brand/logo_claro.png`} alt="Instacredit" />
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/" style={{ color: 'white' }}>Resumen</Link>
          {perfil?.es_admin && (
            <Link to="/parametros" style={{ color: 'white' }}>Parámetros</Link>
          )}
        </nav>
        <span className="sep" />
        <span>{perfil?.nombre ?? ''}</span>
        <button className="boton" onClick={() => void cerrarSesion()}>Salir</button>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
