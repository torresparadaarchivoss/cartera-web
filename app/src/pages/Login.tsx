import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

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
    if (err) setError('Correo o contraseña incorrectos.')
  }

  return (
    <div className="contenido" style={{ maxWidth: 420 }}>
      <div className="tarjeta">
        <img
          src={`${import.meta.env.BASE_URL}brand/prestamito_saludando.png`}
          alt=""
          style={{ height: 140, display: 'block', margin: '0 auto 12px' }}
        />
        <h1>Cartera y Cobros</h1>
        <p style={{ color: 'var(--gris)' }}>Ingresá con tu cuenta de Instacredit.</p>
        <form onSubmit={entrar} style={{ display: 'grid', gap: 12 }}>
          <input type="email" placeholder="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          <input type="password" placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} required />
          {error && <div className="error-pantalla">{error}</div>}
          <button className="boton" type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
