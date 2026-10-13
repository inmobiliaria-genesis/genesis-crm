import { createElement } from "react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Color de respaldo cuando un estado no tiene fila en color_estado. */
export const COLOR_RESPALDO = "#9ca3af";

/** Paleta cerrada de colores bien diferenciados entre sí. */
export const PALETA: { valor: string; nombre: string }[] = [
  { valor: "#2563eb", nombre: "Azul" },
  { valor: "#16a34a", nombre: "Verde" },
  { valor: "#f59e0b", nombre: "Ámbar" },
  { valor: "#dc2626", nombre: "Rojo" },
  { valor: "#7c3aed", nombre: "Morado" },
  { valor: "#0891b2", nombre: "Turquesa" },
  { valor: "#db2777", nombre: "Rosa" },
  { valor: "#65a30d", nombre: "Lima" },
  { valor: "#ea580c", nombre: "Naranja" },
  { valor: "#475569", nombre: "Pizarra" },
];

export type FormaPunto = { tipo: "punto"; x: number; y: number };
export type FormaRect = { tipo: "rect"; x1: number; y1: number; x2: number; y2: number };
export type Forma = FormaPunto | FormaRect;

export function esForma(valor: unknown): valor is Forma {
  if (!valor || typeof valor !== "object") return false;
  const f = valor as Record<string, unknown>;
  if (f["tipo"] === "punto") return typeof f["x"] === "number" && typeof f["y"] === "number";
  if (f["tipo"] === "rect")
    return (
      typeof f["x1"] === "number" &&
      typeof f["y1"] === "number" &&
      typeof f["x2"] === "number" &&
      typeof f["y2"] === "number"
    );
  return false;
}

/** Colores de estado leídos de la base. */
export function useColores() {
  return useQuery({
    queryKey: ["colores-estado"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("color_estado")
        .select("estado, color, anulado")
        .eq("anulado", false)
        .order("estado");
      if (error) throw error;
      return data;
    },
  });
}

export function colorDe(
  estado: string | null | undefined,
  colores: { estado: string; color: string }[] | undefined,
): string {
  if (!estado) return COLOR_RESPALDO;
  return colores?.find((c) => c.estado === estado)?.color ?? COLOR_RESPALDO;
}

/** Estado detallado de cada lote (disponible, apartado, vendido, cancelado), calculado en la base. */
export function useEstadoDetalleLotes() {
  return useQuery({
    queryKey: ["lote-estado-detalle"],
    queryFn: async () => {
      const { todas } = await import("@/lib/todas");
      const { data, error } = await todas(() => supabase.from("lote_estado").select("lote_id, estado_detalle"), "lote_id");
      if (error) throw error;
      return new Map((data ?? []).map((e) => [e.lote_id as string, e.estado_detalle as string]));
    },
  });
}

/** Etiqueta de saldo de una venta activa según el estado de su lote. */
export function EtiquetaSaldoVenta({ estado, colores }: { estado: string | undefined; colores: { estado: string; color: string }[] | undefined }) {
  if (estado !== "vendido" && estado !== "cancelado") return null;
  const c = colorDe(estado, colores);
  return createElement(Badge, { variant: "outline", style: { borderColor: c, color: c } }, estado === "cancelado" ? "Cancelada" : "Con saldo");
}
