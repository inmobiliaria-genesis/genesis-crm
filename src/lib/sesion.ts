import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Rol = Database["public"]["Enums"]["app_rol"];
export type Perfil = Database["public"]["Tables"]["perfil"]["Row"];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  gerente_ventas: "Gerente de ventas",
  cobranza: "Cobranza",
  asesor: "Asesor",
  socio: "Socio",
};

export const ROLES: Rol[] = ["admin", "gerente_ventas", "cobranza", "asesor", "socio"];

export function usePerfil() {
  return useQuery({
    queryKey: ["perfil-actual"],
    staleTime: 60_000,
    queryFn: async (): Promise<Perfil | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("perfil")
        .select("*")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function esAdmin(perfil: Perfil | null | undefined) {
  return perfil?.rol === "admin";
}

/** Admin, gerente de ventas y socio: el socio edita exactamente lo mismo que el gerente. */
export function esGestion(perfil: Perfil | null | undefined) {
  return perfil?.rol === "admin" || perfil?.rol === "gerente_ventas" || perfil?.rol === "socio";
}

/** Admin y socio pueden ver pantallas administrativas (solo admin edita). */
export function puedeVerAdmin(perfil: Perfil | null | undefined) {
  return perfil?.rol === "admin" || perfil?.rol === "socio";
}

export function puedeComercial(perfil: Perfil | null | undefined) {
  return esGestion(perfil) || perfil?.rol === "asesor";
}

/** Registrar y anular pagos: admin, gerente de ventas y cobranza. */
export function puedeCobrar(perfil: Perfil | null | undefined) {
  return esGestion(perfil) || perfil?.rol === "cobranza";
}

export function puedeElegirVendedor(perfil: Perfil | null | undefined) {
  return esGestion(perfil);
}

export function puedeEditarEstructura(perfil: Perfil | null | undefined) {
  return esGestion(perfil);
}
