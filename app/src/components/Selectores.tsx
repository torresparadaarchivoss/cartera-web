import { useEffect, useMemo, useRef, useState } from 'react'

// Widgets con el aspecto de Streamlit (multiselect y selectbox del tema de components/theme.py).
// Multiselección: chips verdes con × y lista desplegable con buscador y marca de selección.

interface Base {
  etiqueta: string
  ayuda?: string
}

function useCerrarAfuera(ref: React.RefObject<HTMLDivElement | null>, abierto: boolean, cerrar: () => void) {
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar()
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto, ref, cerrar])
}

export function MultiSelect({ etiqueta, ayuda, opciones, valor, onChange, formato, placeholder = 'Todos' }: Base & {
  opciones: string[]
  valor: string[]
  onChange: (v: string[]) => void
  formato?: (v: string) => string
  placeholder?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const cerrar = () => { setAbierto(false); setTexto('') }
  useCerrarAfuera(ref, abierto, cerrar)
  const nombre = (v: string) => (formato ? formato(v) : v || '(sin dato)')
  const filtradas = useMemo(
    () => opciones.filter((o) => nombre(o).toLowerCase().includes(texto.toLowerCase())),
    [opciones, texto], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const alternar = (v: string) =>
    onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v])

  return (
    <div className="st-campo" ref={ref}>
      <div className="st-etiqueta" title={ayuda}>{etiqueta}</div>
      <div className="st-wrap">
      <div className={`st-caja${abierto ? ' abierta' : ''}`} onClick={() => setAbierto(true)}>
        {valor.length === 0 && !abierto && <span className="st-placeholder">{placeholder}</span>}
        {valor.map((v) => (
          <span key={v} className="st-chip">
            {nombre(v)}
            <button type="button" aria-label={`Quitar ${nombre(v)}`} onClick={(e) => { e.stopPropagation(); alternar(v) }}>×</button>
          </span>
        ))}
        <input
          className="st-entrada"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          placeholder={valor.length === 0 ? '' : ''}
          aria-label={etiqueta}
        />
        <span className="st-flecha">▾</span>
      </div>
      {abierto && (
        <ul className="st-lista" role="listbox" aria-multiselectable="true">
          {filtradas.length === 0 && <li className="st-vacio">Sin coincidencias</li>}
          {filtradas.map((o) => {
            const sel = valor.includes(o)
            return (
              <li key={o} role="option" aria-selected={sel} className={sel ? 'sel' : undefined}
                onMouseDown={(e) => { e.preventDefault(); alternar(o) }}>
                <span className="st-check">{sel ? '✓' : ''}</span>
                {nombre(o)}
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </div>
  )
}

export function SelectBox<T extends string>({ etiqueta, ayuda, opciones, valor, onChange }: Base & {
  opciones: { valor: T; etiqueta: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cerrar = () => setAbierto(false)
  useCerrarAfuera(ref, abierto, cerrar)
  const actual = opciones.find((o) => o.valor === valor)?.etiqueta ?? ''
  return (
    <div className="st-campo" ref={ref}>
      <div className="st-etiqueta" title={ayuda}>{etiqueta}</div>
      <div className="st-wrap">
      <div className={`st-caja${abierto ? ' abierta' : ''}`} onClick={() => setAbierto(!abierto)} role="combobox"
        aria-expanded={abierto} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(!abierto) } }}>
        <span className="st-valor">{actual}</span>
        <span className="st-flecha">▾</span>
      </div>
      {abierto && (
        <ul className="st-lista" role="listbox">
          {opciones.map((o) => (
            <li key={o.valor} role="option" aria-selected={o.valor === valor}
              className={o.valor === valor ? 'sel' : undefined}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.valor); cerrar() }}>
              {o.etiqueta}
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}
