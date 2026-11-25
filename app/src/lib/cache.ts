// Caché en memoria de las consultas: al cambiar de página no se vuelve a bajar lo que ya se trajo. Cada entrada vence
// a los TTL (5 min por defecto). Si una consulta falla, no se guarda.
const cache = new Map<string, { t: number; p: Promise<unknown> }>()
const TTL = 5 * 60 * 1000

export function memo<T>(clave: string, fn: () => Promise<T>, ttl = TTL): Promise<T> {
  const previo = cache.get(clave)
  if (previo && Date.now() - previo.t < ttl) return previo.p as Promise<T>
  const p = fn().catch((e) => {
    cache.delete(clave)
    throw e
  })
  cache.set(clave, { t: Date.now(), p })
  return p
}

// Tras guardar cambios de administración o de cargas, se descartan las consultas afectadas.
export function invalidar(prefijo = ''): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefijo)) cache.delete(k)
}

// Páginas en paralelo: la base devuelve como máximo 1,000 filas por consulta. Se piden 4 páginas a la vez hasta que una
// venga corta.
export async function paginar<T>(pedir: (desde: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const LOTE = 4
  const salida: T[] = []
  for (let base = 0; ; base += LOTE * 1000) {
    const paginas = await Promise.all(Array.from({ length: LOTE }, (_, k) => pedir(base + k * 1000)))
    for (const r of paginas) {
      if (r.error) throw new Error(r.error.message)
      const filas = r.data ?? []
      salida.push(...filas)
      if (filas.length < 1000) return salida
    }
  }
}
