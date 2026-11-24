import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Perfil {
  id: string
  nombre: string
  es_admin: boolean
  es_admin_pais: boolean
  paises: string[]
}

interface AuthState {
  cargando: boolean
  session: Session | null
  perfil: Perfil | null
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargarPerfil(s: Session | null) {
      if (!s) {
        if (vigente) setPerfil(null)
        return
      }
      // Perfil y países asignados: la función de base controla qué ve cada usuario (RLS).
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre, es_admin, es_admin_pais')
        .eq('id', s.user.id)
        .maybeSingle()
      if (!vigente) return
      if (error || !data) {
        setPerfil(null)
        return
      }
      const { data: paises } = await supabase.rpc('paises_del_usuario')
      if (!vigente) return
      setPerfil({ ...data, paises: (paises as string[] | null) ?? [] })
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!vigente) return
      setSession(data.session)
      await cargarPerfil(data.session)
      if (vigente) setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, s) => {
      setSession(s)
      await cargarPerfil(s)
    })

    return () => {
      vigente = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ cargando, session, perfil, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
