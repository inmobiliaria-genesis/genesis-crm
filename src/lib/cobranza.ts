import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Pago = Database["public"]["Tables"]["pago"]["Row"];

/** Valor vigente hoy de un ajuste de Configuración (null si no existe). */
export async function valorConfig(clave: string): Promise<number | null> {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const { data, error } = await supabase
    .from("config")
    .select("valor")
    .eq("clave", clave)
    .eq("anulado", false)
    .lte("vigente_desde", hoy)
    .order("vigente_desde", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.valor) : null;
}

export const METODOS_PAGO = ["transferencia", "efectivo", "yape", "plin"] as const;

export const ETIQUETA_METODO: Record<string, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  sin_dato: "Sin dato",
};

/** Etiqueta del método; "Sin dato" si el registro no lo tiene. */
export function etiquetaMetodo(m: string | null | undefined): string {
  return m ? (ETIQUETA_METODO[m] ?? m) : "Sin dato";
}

/** Solo transferencia, Yape y Plin llevan código de operación. */
export function llevaOperacion(m: string | null | undefined): boolean {
  return m === "transferencia" || m === "yape" || m === "plin";
}

export const ETIQUETA_RECIBIDO: Record<string, string> = {
  vendedor: "Vendedor",
  inmobiliaria: "Inmobiliaria",
};

export const ETIQUETA_CUOTA: Record<string, string> = {
  pagada: "Pagada",
  parcial: "Parcial",
  pendiente: "Pendiente",
  no_exigible: "No exigible por desistimiento",
};

/** Traduce el estado de venta del lote considerando su saldo pendiente. */
export function etiquetaEstadoLote(
  estado: string | null | undefined,
  saldoPendiente: number | null | undefined,
  enDesistimiento?: boolean | null,
): string {
  if (estado === "disponible") return "Libre";
  if (estado === "apartado") return "Separado";
  if (estado === "vendido") {
    if (enDesistimiento) return "En desistimiento";
    return Number(saldoPendiente ?? 0) > 0.005 ? "Pagando" : "Cancelado";
  }
  return estado ?? "—";
}

export type CuotaConEstado = {
  id: string;
  venta_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto_vigente: number;
  monto_pagado: number;
  saldo: number;
  estado: string;
  vencida: boolean;
};

async function estadosDeCuotas(ids: string[]) {
  if (ids.length === 0) return new Map<string, { monto_pagado: number; saldo: number; estado: string; vencida: boolean }>();
  const { data, error } = await supabase
    .from("cuota_estado")
    .select("cuota_id, monto_pagado, saldo, estado, vencida")
    .in("cuota_id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((e) => [
      e.cuota_id as string,
      {
        monto_pagado: Number(e.monto_pagado ?? 0),
        saldo: Number(e.saldo ?? 0),
        estado: e.estado ?? "pendiente",
        vencida: Boolean(e.vencida),
      },
    ]),
  );
}

/** Cronograma de una venta con el estado de cobranza de cada cuota. */
export function useCuotasDeVenta(ventaId: string | null) {
  return useQuery({
    queryKey: ["cuotas-venta", ventaId],
    enabled: !!ventaId,
    queryFn: async (): Promise<CuotaConEstado[]> => {
      const { data, error } = await supabase
        .from("cuota")
        .select("id, venta_id, numero, fecha_vencimiento, monto_vigente, anulado")
        .eq("venta_id", ventaId!)
        .eq("anulado", false)
        .order("numero");
      if (error) throw error;
      const mapa = await estadosDeCuotas((data ?? []).map((c) => c.id));
      return (data ?? []).map((c) => {
        const e = mapa.get(c.id);
        return {
          id: c.id,
          venta_id: c.venta_id,
          numero: c.numero,
          fecha_vencimiento: c.fecha_vencimiento,
          monto_vigente: Number(c.monto_vigente),
          monto_pagado: e?.monto_pagado ?? 0,
          saldo: e?.saldo ?? Number(c.monto_vigente),
          estado: e?.estado ?? "pendiente",
          vencida: e?.vencida ?? false,
        };
      });
    },
  });
}

/** Pagos de una venta con el detalle de cuotas a las que se aplicaron. */
export function usePagosDeVenta(ventaId: string | null) {
  return useQuery({
    queryKey: ["pagos-venta", ventaId],
    enabled: !!ventaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pago")
        .select(
          "*, aplicaciones:pago_aplicacion(id, monto_aplicado, anulado, cuota:cuota_id(numero))",
        )
        .eq("venta_id", ventaId!)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
