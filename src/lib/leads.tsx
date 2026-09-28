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

export const FUENTES = ["facebook", "instagram", "tiktok", "google", "radio", "influencer", "impresos", "oficina", "referido", "otros"] as const;
export const ETIQUETA_FUENTE: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  radio: "Radio",
  influencer: "Influencer",
  impresos: "Impresos",
  oficina: "Oficina",
  referido: "Referido",
  otros: "Otros",
};
export const ETIQUETA_ORIGEN: Record<string, string> = { promotor: "Promotor", marketing: "Marketing", sin_dato: "Sin dato" };

export const ETAPAS_LEAD = ["nuevo", "visita_agendada", "visito", "separo", "no_interesado"] as const;
export const ETIQUETA_ETAPA: Record<string, string> = {
  nuevo: "Nuevo",
  visita_agendada: "Visita agendada",
  visito: "Visitó",
  separo: "Separó",
  no_interesado: "No interesado",
};

export type Origen = {
  origen: string; // "" | promotor | marketing | sin_dato
  fuente: string;
  promotorId: string | null;
  referidoId: string | null;
  referidoNombre: string | null;
};
export const ORIGEN_VACIO: Origen = { origen: "", fuente: "", promotorId: null, referidoId: null, referidoNombre: null };

/** Convierte a columnas de la base (origen, fuente, promotor_id, referido_por_id). */
export function origenAColumnas(o: Origen) {
  const origen = o.origen || null;
  return {
    origen,
    fuente: origen === "marketing" ? o.fuente || null : null,
    promotor_id: origen === "promotor" ? o.promotorId : null,
    referido_por_id: origen === "marketing" && o.fuente === "referido" ? o.referidoId : null,
  };
}

export function origenDeFila(f: { origen?: string | null; fuente?: string | null; promotor_id?: string | null; referido_por_id?: string | null }): Origen {
  return { origen: f.origen ?? "", fuente: f.fuente ?? "", promotorId: f.promotor_id ?? null, referidoId: f.referido_por_id ?? null, referidoNombre: null };
}

/** Devuelve un mensaje de error si el origen está incompleto, o null. */
export function validarOrigen(o: Origen, obligatorio: boolean): string | null {
  if (!o.origen) return obligatorio ? "Elige el origen" : null;
  if (o.origen === "marketing" && !o.fuente) return "Elige la fuente";
  if (o.origen === "marketing" && o.fuente === "referido" && !o.referidoId) return "Busca al cliente que refirió por su DNI";
  return null;
}

export function textoOrigen(f: { origen?: string | null; fuente?: string | null }) {
  if (!f.origen) return "—";
  const o = ETIQUETA_ORIGEN[f.origen] ?? f.origen;
  return f.origen === "marketing" && f.fuente ? `${o} · ${ETIQUETA_FUENTE[f.fuente] ?? f.fuente}` : o;
}

export async function nombreClientePorId(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from("cliente").select("nombres, apellidos").eq("id", id).maybeSingle();
  return data ? `${data.nombres} ${data.apellidos}`.trim() : "Cliente vinculado";
}

/**
 * Origen unificado: Promotor (promotor opcional) o Marketing (fuente obligatoria;
 * si es Referido, "Referido por" con búsqueda por DNI).
 */
export function CampoOrigen({
  valor,
  onCambio,
  promotores,
  opcional = false,
  sinDato = false,
  onPromotor,
}: {
  valor: Origen;
  onCambio: (v: Origen) => void;
  promotores: { id: string; nombre: string }[];
  opcional?: boolean;
  sinDato?: boolean;
  onPromotor?: (id: string | null) => void;
}) {
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (valor.fuente !== "referido") setError(null);
  }, [valor.fuente]);

  useEffect(() => {
    if (valor.referidoId && !valor.referidoNombre) {
      nombreClientePorId(valor.referidoId).then((n) => onCambio({ ...valor, referidoNombre: n }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.referidoId]);

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
        <Label>Origen{opcional ? " (opcional)" : ""}</Label>
        <Select
          value={valor.origen || "ninguno"}
          onValueChange={(o) => {
            const origen = o === "ninguno" ? "" : o;
            onCambio({ origen, fuente: "", promotorId: null, referidoId: null, referidoNombre: null });
            if (valor.promotorId) onPromotor?.(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Elige el origen" />
          </SelectTrigger>
          <SelectContent>
            {opcional ? <SelectItem value="ninguno">Sin indicar</SelectItem> : null}
            <SelectItem value="promotor">Promotor</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            {sinDato ? <SelectItem value="sin_dato">Sin dato</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      {valor.origen === "promotor" ? (
        <div>
          <Label>Promotor (opcional)</Label>
          <Select
            value={valor.promotorId ?? "ninguno"}
            onValueChange={(p) => {
              const id = p === "ninguno" ? null : p;
              onCambio({ ...valor, promotorId: id });
              onPromotor?.(id);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ninguno">Sin promotor (lo consiguió el encargado)</SelectItem>
              {promotores.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {valor.origen === "marketing" ? (
        <div>
          <Label>Fuente</Label>
          <Select
            value={valor.fuente}
            onValueChange={(f) => onCambio({ ...valor, fuente: f, referidoId: null, referidoNombre: null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Elige la fuente" />
            </SelectTrigger>
            <SelectContent>
              {FUENTES.map((f) => (
                <SelectItem key={f} value={f}>
                  {ETIQUETA_FUENTE[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {valor.origen === "marketing" && valor.fuente === "referido" ? (
        <div>
          <Label>Referido por</Label>
          {valor.referidoId ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="flex-1">{valor.referidoNombre ?? "…"}</span>
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
