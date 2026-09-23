import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Vendedor = Database["public"]["Tables"]["vendedor"]["Row"];

export const TIPOS_VENDEDOR = ["encargado", "promotor"] as const;
export const ESTADOS_VENDEDOR = ["activo", "salio"] as const;

export const ETIQUETA_TIPO: Record<string, string> = { encargado: "Encargado", promotor: "Promotor" };
export const ETIQUETA_ESTADO_VENDEDOR: Record<string, string> = { activo: "Activo", salio: "Salió" };
export const ETIQUETA_ORIGEN: Record<string, string> = { promotor: "Promotor", marketing: "Marketing" };

/** Nombre para mostrar en toda la app: agrega "(salió)" si corresponde. */
export function nombreVendedor(
  v: { nombre: string; apodo?: string | null; estado?: string | null } | null | undefined,
) {
  if (!v) return "—";
  const base = v.apodo ? `${v.nombre} "${v.apodo}"` : v.nombre;
  return v.estado === "salio" ? `${base} (salió)` : base;
}

export function useVendedores() {
  return useQuery({
    queryKey: ["vendedores"],
    queryFn: async (): Promise<Vendedor[]> => {
      const { data, error } = await supabase
        .from("vendedor")
        .select("*")
        .eq("anulado", false)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });
}
