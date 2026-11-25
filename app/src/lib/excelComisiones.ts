import ExcelJS from 'exceljs'
import { escalaExcel } from './escala'

// Excel de comisiones como el del Streamlit (modules/comisiones.a_excel_comisiones): una hoja por equipo con la
// planilla de motorizados y la fila TOTAL, más una hoja Detalle por cuenta. En Alcance cuentas pago, escala de color
// entre los motorizados (rojo el menor, amarillo la mediana, verde el mayor).

export interface FilaPlanilla {
  Motorizado: string
  Usuario: string
  Puesto: string
  Cuentas: number | null
  'Cuentas válidas': number | null
  'Cumple cuota': number | null
  'Saldo capital': number | null
  'Recaudo válido': number | null
  Eficiencia: number | null
  'Comisión por mora': number | null
  'Comisión válida recaudo': number | null
  'Meta cuenta pago': number | null
  'Alcance cuentas pago': number | null
  'Comisión cuentas pago': number | null
  'Comisión total': number | null
}

export const COLUMNAS_PLANILLA: (keyof FilaPlanilla)[] = [
  'Motorizado', 'Usuario', 'Puesto', 'Cuentas', 'Cuentas válidas', 'Cumple cuota', 'Saldo capital', 'Recaudo válido',
  'Eficiencia', 'Comisión por mora', 'Comisión válida recaudo', 'Meta cuenta pago', 'Alcance cuentas pago',
  'Comisión cuentas pago', 'Comisión total',
]

const FORMATO: Partial<Record<keyof FilaPlanilla, string>> = {
  Cuentas: '#,##0', 'Cuentas válidas': '#,##0', 'Cumple cuota': '0.00%', 'Saldo capital': '#,##0.00',
  'Recaudo válido': '#,##0.00', Eficiencia: '0.00%', 'Comisión por mora': '#,##0.00', 'Comisión válida recaudo': '#,##0.00',
  'Meta cuenta pago': '0.00%', 'Alcance cuentas pago': '0.00%', 'Comisión cuentas pago': '#,##0.00', 'Comisión total': '#,##0.00',
}

const ESCALA_FILL = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex.replace('#', '') } })

export interface Hoja {
  nombre: string
  filas: (Record<string, string | number | null>)[]
  columnas: string[]
  conEscala?: string
  formatos?: Record<string, string>
  puestoMotorizado?: string
}

export async function descargarExcelComisiones(archivo: string, hojas: Hoja[]): Promise<void> {
  const libro = new ExcelJS.Workbook()
  for (const h of hojas) {
    const ws = libro.addWorksheet(h.nombre.slice(0, 31))
    ws.columns = h.columnas.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }))
    ws.getRow(1).font = { bold: true }
    h.filas.forEach((f) => ws.addRow(h.columnas.map((c) => f[c] ?? null)))
    h.columnas.forEach((c, j) => {
      const fmt = h.formatos?.[c]
      if (fmt) ws.getColumn(j + 1).numFmt = fmt
    })
    if (h.conEscala) {
      const j = h.columnas.indexOf(h.conEscala) + 1
      const motoridas = h.filas
        .map((f, i) => ({ i, f }))
        .filter(({ f }) => f.Puesto === h.puestoMotorizado)
      const colores = escalaExcel(motoridas.map(({ f }) => (f[h.conEscala!] as number | null)))
      motoridas.forEach(({ i }, k) => {
        const color = colores[k]
        if (color) ws.getCell(i + 2, j).fill = ESCALA_FILL(color)
      })
    }
  }
  const buf = await libro.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = archivo
  a.click()
  URL.revokeObjectURL(url)
}

export { FORMATO }
