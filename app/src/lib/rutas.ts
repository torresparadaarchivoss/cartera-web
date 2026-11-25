// Tipo de ruta del cliente (services/loantape.py): «Ruta Interna» si el texto contiene SAN SALVADOR o SANTA TECLA
// (sin tildes ni mayúsculas); «Ruta Foránea» en otro caso; «Sin dato» si el campo viene vacío o no hay cierre.
// Sale de datos personales (domicilio y trabajo): solo se muestra a administradores.

export const RUTA_INTERNA = 'Ruta Interna'
export const RUTA_FORANEA = 'Ruta Foránea'
export const SIN_DATO = 'Sin dato'
export const RUTAS = [RUTA_INTERNA, RUTA_FORANEA, SIN_DATO] as const

export function tipoRuta(texto: string | null | undefined): string {
  const t = (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
  if (t.replace(/[\s.,-]/g, '') === '') return SIN_DATO
  return t.includes('SAN SALVADOR') || t.includes('SANTA TECLA') ? RUTA_INTERNA : RUTA_FORANEA
}
