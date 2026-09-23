import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Muestra un enlace a la venta o al apartado vigente del lote, si existe. */
export function EnlaceLote({ loteId }: { loteId: string }) {
  const info = useQuery({
    queryKey: ["enlace-lote", loteId],
    queryFn: async () => {
      const [venta, reserva] = await Promise.all([
        supabase.from("venta").select("id").eq("lote_id", loteId).eq("anulado", false).maybeSingle(),
        supabase
          .from("reserva")
          .select("id, fecha_limite, convertida_a_venta_id")
          .eq("lote_id", loteId)
          .eq("anulado", false)
          .order("fecha", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return { venta: venta.data, reserva: reserva.data };
    },
  });

  if (info.data?.venta) {
    return (
      <Link to="/ventas" search={{ venta: info.data.venta.id }} className="text-sm underline">
        Ver la venta de este lote
      </Link>
    );
  }
  const r = info.data?.reserva;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  if (r && !r.convertida_a_venta_id && (r.fecha_limite ?? "") >= hoy) {
    return (
      <Link to="/apartados" className="text-sm underline">
        Ver el apartado de este lote
      </Link>
    );
  }
  return null;
}
