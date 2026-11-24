import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as datos from './datos'
import type { Filtros, Opciones } from './datos'

interface Estado {
  cargando: boolean
  error: string | null
  fechas: string[]          // ascendente
  fecha: string | null      // fecha de corte elegida
  fechaBase: string | null  // primer día del mes cargado (para comparar «vs inicio»)
  opciones: Opciones | null
  filtros: Filtros | null
  setFecha: (f: string) => void
  setFiltros: (f: Filtros) => void
}

const Ctx = createContext<Estado | undefined>(undefined)

// tipo legal: por defecto todos menos JUR, igual que components/filters.py.
function defectoTipoLegal(valores: string[]): string[] {
  return valores.filter((v) => v.trim().toUpperCase() !== 'JUR')
}

export function DatosProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fechas, setFechas] = useState<string[]>([])
  const [fecha, setFecha] = useState<string | null>(null)
  const [opciones, setOpciones] = useState<Opciones | null>(null)
  const [filtros, setFiltros] = useState<Filtros | null>(null)

  useEffect(() => {
    let vigente = true
    Promise.all([datos.fechas(), datos.opciones()])
      .then(([f, o]) => {
        if (!vigente) return
        setFechas(f)
        setFecha(f.length ? f[f.length - 1] : null)
        setOpciones(o)
        setFiltros({ supervisor: [], tipo_credito: [], tipo_legal: defectoTipoLegal(o.tipo_legal) })
      })
      .catch((e: Error) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [])

  return (
    <Ctx.Provider
      value={{
        cargando,
        error,
        fechas,
        fecha,
        fechaBase: fechas[0] ?? null,
        opciones,
        filtros,
        setFecha: (f) => setFecha(f),
        setFiltros: (f) => setFiltros(f),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useDatos(): Estado {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDatos debe usarse dentro de DatosProvider')
  return c
}
