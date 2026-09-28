import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hoyLima } from "@/lib/format";

export type Categoria = Database["public"]["Tables"]["gasto_categoria"]["Row"];
export type Subcategoria = Database["public"]["Tables"]["gasto_subcategoria"]["Row"];
export type Gasto = Database["public"]["Tables"]["gasto"]["Row"];

export const BUCKET_COMPROBANTES = "comprobantes";
const TIPOS_COMPROBANTE = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

/** "YYYY-MM" del mes actual en Lima. */
export function mesActual(): string {
  return hoyLima().slice(0, 7);
}

/** Primer día del mes ("YYYY-MM-01"). */
export function inicioMes(mes: string): string {
  return `${mes}-01`;
}

export function finMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return d.toISOString().slice(0, 10);
}

export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const t = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, 15)),
  );
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function useCategorias() {
  return useQuery({
    queryKey: ["gasto-categorias"],
    queryFn: async () => {
      const [c, s] = await Promise.all([
        supabase.from("gasto_categoria").select("*").eq("anulado", false).order("orden"),
        supabase.from("gasto_subcategoria").select("*").eq("anulado", false).order("orden"),
      ]);
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      return { categorias: c.data, subcategorias: s.data };
    },
  });
}

/** Sube un comprobante (foto o PDF, máx. 10 MB) y devuelve su ruta en el almacenamiento privado. */
export async function subirComprobante(archivo: File, carpeta: "gastos" | "planilla"): Promise<string> {
  if (archivo.size > 10 * 1024 * 1024) throw new Error("El comprobante supera los 10 MB.");
  if (!TIPOS_COMPROBANTE.includes(archivo.type)) throw new Error("Solo se aceptan fotos (JPG, PNG, WebP) o PDF.");
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "bin";
  const ruta = `${carpeta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_COMPROBANTES).upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw error;
  return ruta;
}

export async function abrirComprobante(ruta: string) {
  const { data, error } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta, 300);
  if (error || !data) throw error ?? new Error("No se pudo abrir el comprobante");
  window.open(data.signedUrl, "_blank", "noopener");
}
