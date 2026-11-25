import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configuracionCompleta } from './lib/supabase'
import { DatosProvider } from './lib/contexto'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Resumen from './pages/Resumen'
import Cartera from './pages/Cartera'
import Recuperacion from './pages/Recuperacion'
import RollRates from './pages/RollRates'
import RodamientoReal from './pages/RodamientoReal'
import CuentasGestionar from './pages/CuentasGestionar'
import VisitasCampo from './pages/VisitasCampo'
import GestionCobros from './pages/GestionCobros'

// Guarda: sin sesión → /login
function Protegido({ children }: { children: JSX.Element }) {
  const { cargando, session } = useAuth()
  if (cargando) return <p className="contenido">Cargando…</p>
  if (!session) return <Navigate to="/login" replace />
  return children
}

// Guarda: sin permiso de administrador → redirige
function SoloAdmin({ children }: { children: JSX.Element }) {
  const { cargando, perfil } = useAuth()
  if (cargando) return <p className="contenido">Cargando…</p>
  if (!perfil?.es_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  if (!configuracionCompleta) {
    return (
      <div className="contenido">
        <div className="aviso">
          <strong>Falta la configuración.</strong> Copiá <code>app/.env.production.example</code> como{' '}
          <code>app/.env.production</code> y pegá la URL y la anon key de Supabase.
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protegido>
                <DatosProvider>
                  <Layout />
                </DatosProvider>
              </Protegido>
            }
          >
            <Route path="/" element={<Resumen />} />
            <Route path="/cartera" element={<Cartera />} />
            <Route path="/recuperacion" element={<Recuperacion />} />
            <Route path="/roll-rates" element={<RollRates />} />
            <Route path="/rodamiento-real" element={<RodamientoReal />} />
            <Route path="/cuentas-gestionar" element={<CuentasGestionar />} />
            <Route path="/visitas-campo" element={<VisitasCampo />} />
            <Route path="/gestion-cobros" element={<GestionCobros />} />
            <Route
              path="/parametros"
              element={
                <SoloAdmin>
                  <p>Parámetros (pendiente de portar).</p>
                </SoloAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </HashRouter>
  )
}
