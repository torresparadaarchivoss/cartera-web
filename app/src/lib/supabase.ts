import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configuracionCompleta = Boolean(url && anonKey && !anonKey.startsWith('PEGA_AQUI'))

// Sesión en sessionStorage: se cierra al cerrar la pestaña.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'sin-configurar', {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
})
