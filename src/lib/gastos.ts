import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Categoria = Database["public"]["Tables"]["gasto_categoria"]["Row"];
export type Subcategoria = Database["public"]["Tables"]["gasto_subcategoria"]["Row"];
export type Gasto = Database["public"]["Tables"]["gasto"]["Row"];

export const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function useCategorias(incluirAnuladas = false) {
  return useQuery({
    queryKey: ["gasto-categorias", incluirAnuladas],
    queryFn: async () => {
      let qc = supabase.from("gasto_categoria").select("*").order("orden");
      let qs = supabase.from("gasto_subcategoria").select("*").order("orden");
      if (!incluirAnuladas) {
        qc = qc.eq("anulado", false);
        qs = qs.eq("anulado", false);
      }
      const [c, s] = await Promise.all([qc, qs]);
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      return { categorias: c.data, subcategorias: s.data };
    },
  });
}

/** Primer día del mes (aaaa-mm-01) a partir de "aaaa-mm". */
export function inicioMes(mes: string) {
  return `${mes}-01`;
}

export function finMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return d.toISOString().slice(0, 10);
}

export function mesActualLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date()).slice(0, 7);
}

export async function subirComprobante(archivo: File): Promise<string> {
  if (archivo.size > 10 * 1024 * 1024) throw new Error("El comprobante supera 10 MB.");
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "bin";
  const ruta = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("comprobantes").upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw error;
  return ruta;
}

export async function abrirComprobante(ruta: string) {
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(ruta, 600);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}
