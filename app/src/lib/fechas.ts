// Fechas de negocio en zona local. Nunca usar toISOString(): cambia el día según la hora UTC.

export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatoFecha(iso: string): string {
  // iso: aaaa-mm-dd → dd/mm/aaaa
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
