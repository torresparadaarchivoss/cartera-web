import * as XLSX from 'xlsx'

// Exporta tablas de la base a Excel: una hoja por tabla. Las columnas salen con el nombre que se les da aquí.
export interface Hoja {
  nombre: string
  filas: Record<string, string | number | boolean | null | undefined>[]
}

export function descargarExcel(archivo: string, hojas: Hoja[]): void {
  const libro = XLSX.utils.book_new()
  for (const h of hojas) {
    const hoja = h.filas.length ? XLSX.utils.json_to_sheet(h.filas) : XLSX.utils.aoa_to_sheet([['(sin filas)']])
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31))
  }
  XLSX.writeFile(libro, archivo)
}
