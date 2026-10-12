/**
 * Trae todas las filas de una consulta por partes de 1,000 (límite del servidor),
 * para que ningún listado se corte. `crear` debe devolver una consulta nueva cada vez.
 */
export async function todas<Q extends PromiseLike<{ data: unknown; error: unknown }>>(crear: () => Q): Promise<Awaited<Q>> {
  const PASO = 1000;
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += PASO) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (crear() as any).order("id").range(desde, desde + PASO - 1);
    const r = await q;
    if (r.error) return r as Awaited<Q>;
    const parte = (r.data ?? []) as unknown[];
    filas.push(...parte);
    if (parte.length < PASO) return { ...r, data: filas } as Awaited<Q>;
  }
}
