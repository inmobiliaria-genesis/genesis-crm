import { Badge } from "@/components/ui/badge";
import { ETIQUETA_APROBACION } from "@/lib/ventas";

export function EstadoAprobacion({ estado, motivo }: { estado: string; motivo?: string | null }) {
  return (
    <div>
      <Badge variant={estado === "aprobado" ? "secondary" : estado === "rechazado" ? "destructive" : "outline"}>
        {ETIQUETA_APROBACION[estado] ?? estado}
      </Badge>
      {estado === "rechazado" && motivo ? (
        <p className="mt-1 text-xs text-muted-foreground">Motivo: {motivo}</p>
      ) : null}
    </div>
  );
}
