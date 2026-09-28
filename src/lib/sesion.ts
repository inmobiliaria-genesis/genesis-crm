import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Rol = Database["public"]["Enums"]["app_rol"];
export type Perfil = Database["public"]["Tables"]["perfil"]["Row"];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  gerente_ventas: "Gerente de ventas",
  contabilidad: "Contabilidad",
  asesor: "Asesor",
  socio: "Socio",
};

export const ROLES: Rol[] = ["admin", "gerente_ventas", "contabilidad", "asesor", "socio"];

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

/** Registrar y anular pagos de clientes: admin, gerente de ventas y socio (contabilidad solo ve). */
export function puedeCobrar(perfil: Perfil | null | undefined) {
  return esGestion(perfil);
}

export function puedeElegirVendedor(perfil: Perfil | null | undefined) {
  return esGestion(perfil);
}

export function puedeEditarEstructura(perfil: Perfil | null | undefined) {
  return esGestion(perfil);
}

export function esAsesor(perfil: Perfil | null | undefined) {
  return perfil?.rol === "asesor";
}

/** Gastos y planilla: admin, socio y contabilidad. */
export function puedeGastos(perfil: Perfil | null | undefined) {
  return perfil?.rol === "admin" || perfil?.rol === "socio" || perfil?.rol === "contabilidad";
}
