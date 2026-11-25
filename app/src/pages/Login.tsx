import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Inicio de sesión con la identidad Instacredit (marca-instacredit): panel verde con Prestamito y el slogan,
// tarjeta blanca con el formulario. Títulos en Inter Tight, cuerpo en Nunito Sans (la fuente del tablero).
export default function Login() {
  const { session, cargando } = useAuth()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!cargando && session) return <Navigate to="/" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: correo, password: clave })
    setEnviando(false)
    if (err) setError(`No pudimos ingresarte: ${err.message}`)
  }

  const base = import.meta.env.BASE_URL
  return (
    <div className="login">
      <section className="login-panel">
        <img className="login-logo" src={`${base}brand/logo_claro.png`} alt="Instacredit" />
        <div className="login-texto">
          <h2>Cartera y Cobros</h2>
          <p>Seguimiento de la cartera, la gestión y la recuperación, todo en un lugar.</p>
          <span className="login-slogan">¡Apoyándote siempre!</span>
        </div>
        <img className="login-prestamito" src={`${base}brand/prestamito_saludando.png`} alt="Prestamito saludando" />
      </section>
      <section className="login-formulario">
        <div className="login-tarjeta">
          <h1>¡Hola de nuevo!</h1>
          <p>Ingresá con tu cuenta de Instacredit.</p>
          <form onSubmit={entrar} className="login-form">
            <label>
              Correo
              <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="username" required />
            </label>
            <label>
              Contraseña
              <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button className="login-boton" type="submit" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="login-pie">¿No podés entrar? Escribile a tu supervisor para que te den acceso.</p>
        </div>
      </section>
    </div>
  )
}
