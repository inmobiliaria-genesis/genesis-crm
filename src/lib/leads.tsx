import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ORIGENES_LEAD = ["facebook", "instagram", "tiktok", "google", "referido", "oficina", "otro"] as const;
export const ETIQUETA_ORIGEN_LEAD: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  referido: "Referido",
  oficina: "Oficina",
  otro: "Otro",
};

export const ETAPAS_LEAD = ["nuevo", "visita_agendada", "visito", "separo", "no_interesado"] as const;
export const ETIQUETA_ETAPA: Record<string, string> = {
  nuevo: "Nuevo",
  visita_agendada: "Visita agendada",
  visito: "Visitó",
  separo: "Separó",
  no_interesado: "No interesado",
};

export type OrigenLead = { origen: string; referidoId: string | null; referidoNombre: string | null };
export const ORIGEN_VACIO: OrigenLead = { origen: "", referidoId: null, referidoNombre: null };

export async function nombreClientePorId(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from("cliente").select("nombres, apellidos").eq("id", id).maybeSingle();
  return data ? `${data.nombres} ${data.apellidos}`.trim() : "Cliente vinculado";
}

/** Selector de origen del lead + "Referido por" (búsqueda de cliente aprobado por DNI). */
export function CampoOrigenLead({ valor, onCambio }: { valor: OrigenLead; onCambio: (v: OrigenLead) => void }) {
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (valor.origen !== "referido") setError(null);
  }, [valor.origen]);

  async function buscar() {
    const t = dni.trim();
    if (!t) return;
    setBuscando(true);
    const { data } = await supabase.rpc("buscar_referido" as never, { _dni: t } as never);
    setBuscando(false);
    const fila = (Array.isArray(data) ? data[0] : null) as { cliente_id: string; nombre: string } | null;
    if (!fila) {
      setError("No se encontró un cliente aprobado con este DNI");
      onCambio({ ...valor, referidoId: null, referidoNombre: null });
      return;
    }
    setError(null);
    onCambio({ ...valor, referidoId: fila.cliente_id, referidoNombre: fila.nombre });
  }

  return (
    <>
      <div>
        <Label>Origen del lead</Label>
        <Select
          value={valor.origen || "ninguno"}
          onValueChange={(o) =>
            onCambio(o === "referido" ? { ...valor, origen: o } : { origen: o === "ninguno" ? "" : o, referidoId: null, referidoNombre: null })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ninguno">Sin indicar</SelectItem>
            {ORIGENES_LEAD.map((o) => (
              <SelectItem key={o} value={o}>
                {ETIQUETA_ORIGEN_LEAD[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {valor.origen === "referido" ? (
        <div>
          <Label>Referido por</Label>
          {valor.referidoId ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="flex-1">{valor.referidoNombre}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCambio({ ...valor, referidoId: null, referidoNombre: null })}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="DNI del cliente"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscar();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={buscar} disabled={buscando}>
                Buscar
              </Button>
            </div>
          )}
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </>
  );
}
