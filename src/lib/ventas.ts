import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Cliente = Database["public"]["Tables"]["cliente"]["Row"];
export type Reserva = Database["public"]["Tables"]["reserva"]["Row"];
export type Venta = Database["public"]["Tables"]["venta"]["Row"];
export type Cuota = Database["public"]["Tables"]["cuota"]["Row"];

export const TIPOS_DOCUMENTO = ["DNI", "CE", "Pasaporte", "RUC"] as const;
export const FORMAS_PAGO = ["efectivo", "transferencia", "cheque", "tarjeta"] as const;
export const ESTADOS_CIVILES = ["Soltero(a)", "Casado(a)", "Conviviente", "Divorciado(a)", "Viudo(a)"];
export const REGIMENES = ["Sociedad de gananciales", "Separación de patrimonios"];

export function nombreCliente(c: Pick<Cliente, "nombres" | "apellidos"> | null | undefined) {
  if (!c) return "—";
  return `${c.apellidos} ${c.nombres}`.trim();
}

export function documentoCliente(c: Pick<Cliente, "tipo_documento" | "numero_documento"> | null | undefined) {
  if (!c) return "—";
  return `${c.tipo_documento} ${c.numero_documento}`;
}

/**
 * modo "selector": solo clientes aprobados (y, para el asesor, también sus pendientes).
 * modo "todos": todo lo que la persona puede ver (incluye pendientes y rechazados).
 */
export function useClientes(busqueda = "", modo: "selector" | "todos" = "selector") {
  return useQuery({
    queryKey: ["clientes", busqueda, modo],
    queryFn: async () => {
      let q = supabase.from("cliente").select("*").eq("anulado", false).order("apellidos").limit(50);
      if (modo === "selector") q = q.neq("estado_aprobacion", "rechazado");
      const t = busqueda.trim();
      if (t) {
        q = q.or(
          `numero_documento.ilike.%${t}%,nombres.ilike.%${t}%,apellidos.ilike.%${t}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      if (modo === "selector") {
        const { data: auth } = await supabase.auth.getUser();
        return data.filter((c) => c.estado_aprobacion === "aprobado" || c.creado_por === auth.user?.id);
      }
      return data;
    },
  });
}

export const ETIQUETA_APROBACION: Record<string, string> = {
  pendiente: "Pendiente de aprobación",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export type LoteConUbicacion = {
  id: string;
  numero: number;
  area_m2: number | null;
  precio_lista: number | null;
  manzana_id: string;
  manzana_letra: string;
  etapa: string;
  proyecto: string;
  estado: string;
  etiqueta: string;
};

export function useLotesConEstado(asesor = false) {
  return useQuery({
    queryKey: ["lotes-con-estado", asesor],
    queryFn: async (): Promise<LoteConUbicacion[]> => {
      if (asesor) {
        const rpc = supabase.rpc.bind(supabase);
        const { data, error } = await rpc("lotes_asesor" as never);
        if (error) throw error;
        return ((data ?? []) as unknown as { id: string; manzana: string; numero: number; area_m2: number; precio_lista: number }[]).map((l) => ({
          id: l.id, numero: l.numero, area_m2: l.area_m2, precio_lista: l.precio_lista,
          manzana_id: "", manzana_letra: l.manzana, etapa: "", proyecto: "",
          estado: "disponible", etiqueta: `Mz ${l.manzana} · Lote ${l.numero}`,
        }));
      }
      const { data, error } = await supabase
        .from("lote")
        .select(
          "id, numero, area_m2, precio_lista, manzana_id, manzana:manzana_id(letra, tipo, etapa:etapa_id(nombre, proyecto:proyecto_id(nombre)))",
        )
        .eq("anulado", false)
        .order("numero");
      if (error) throw error;
      const { data: estados, error: e2 } = await supabase.from("lote_estado").select("*");
      if (e2) throw e2;
      const mapa = new Map((estados ?? []).map((e) => [e.lote_id, e.estado ?? "disponible"]));
      return (data ?? [])
        .filter((l) => l.manzana?.tipo === "residencial")
        .map((l) => {
          const letra = l.manzana?.letra ?? "?";
          return {
            id: l.id,
            numero: l.numero,
            area_m2: l.area_m2,
            precio_lista: l.precio_lista,
            manzana_id: l.manzana_id,
            manzana_letra: letra,
            etapa: l.manzana?.etapa?.nombre ?? "",
            proyecto: l.manzana?.etapa?.proyecto?.nombre ?? "",
            estado: mapa.get(l.id) ?? "disponible",
            etiqueta: `Mz ${letra} · Lote ${l.numero}`,
          };
        })
        .sort((a, b) =>
          a.manzana_letra === b.manzana_letra
            ? a.numero - b.numero
            : a.manzana_letra.localeCompare(b.manzana_letra),
        );
    },
  });
}

export function usePerfilesActivos() {
  return useQuery({
    queryKey: ["perfiles-activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfil")
        .select("id, nombre, rol")
        .eq("anulado", false)
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });
}

export function reservaVigente(r: Pick<Reserva, "fecha_limite" | "convertida_a_venta_id" | "anulado">) {
  if (r.anulado) return false;
  if (r.convertida_a_venta_id) return false;
  if (!r.fecha_limite) return false;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  return r.fecha_limite >= hoy;
}

export function sumaCuotas(cuotas: { monto_original: number }[]) {
  return cuotas.reduce((t, c) => t + Number(c.monto_original), 0);
}
