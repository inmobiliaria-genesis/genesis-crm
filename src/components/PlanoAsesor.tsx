import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { soles, numero } from "@/lib/format";
import { useColores, colorDe, esForma, type Forma } from "@/lib/plano";

const ETIQUETA: Record<string, string> = { disponible: "Libre", apartado: "Separado", vendido: "Vendido" };

type Marca = {
  id: string;
  manzana: string;
  numero: number;
  forma: Forma;
  estado: string;
  area_m2: number | null;
  precio_lista: number | null;
};

/** Plano de solo lectura para el asesor: datos mínimos vía función segura. */
export function PlanoAsesor() {
  const navigate = useNavigate();
  const colores = useColores();
  const [planoId, setPlanoId] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const planos = useQuery({
    queryKey: ["planos-vigentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano")
        .select("id, nombre, imagen_path, etapa:etapa_id(nombre)")
        .eq("vigente", true)
        .eq("anulado", false);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!planoId && planos.data?.[0]) setPlanoId(planos.data[0].id);
  }, [planos.data, planoId]);
  const plano = planos.data?.find((p) => p.id === planoId) ?? null;

  const imagen = useQuery({
    queryKey: ["plano-imagen", plano?.imagen_path],
    enabled: !!plano?.imagen_path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("planos").createSignedUrl(plano!.imagen_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const marcas = useQuery({
    queryKey: ["plano-asesor", planoId],
    enabled: !!planoId,
    queryFn: async (): Promise<Marca[]> => {
      const rpc = supabase.rpc.bind(supabase);
      const { data, error } = await rpc("plano_asesor" as never, { _plano_id: planoId } as never);
      if (error) throw error;
      return ((data ?? []) as unknown as (Omit<Marca, "forma"> & { forma: unknown })[])
        .filter((m) => esForma(m.forma))
        .map((m) => ({ ...m, forma: m.forma as Forma }));
    },
  });
  const elegido = useMemo(() => marcas.data?.find((m) => m.id === sel) ?? null, [marcas.data, sel]);
  const libre = elegido && elegido.estado === "disponible" && elegido.area_m2 != null && elegido.precio_lista != null;

  return (
    <AppShell titulo="Plano" descripcion="Estado de los lotes de la lotización">
      <div className="mb-4 flex items-center gap-3">
        <Select value={planoId} onValueChange={(v) => { setPlanoId(v); setSel(null); }}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Elige un plano" />
          </SelectTrigger>
          <SelectContent>
            {planos.data?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.etapa?.nombre} · {p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(ETIQUETA).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full" style={{ background: colorDe(k, colores.data) }} />
              {v}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative overflow-auto rounded-lg border border-border bg-card">
          {imagen.data ? (
            <div className="relative">
              <img src={imagen.data} alt="Plano de la lotización" className="block w-full" />
              {marcas.data?.map((m) => {
                const color = colorDe(m.estado, colores.data);
                const f = m.forma;
                const estilo =
                  f.tipo === "punto"
                    ? { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: 18, height: 18, transform: "translate(-50%,-50%)", borderRadius: 9999 }
                    : { left: `${f.x1 * 100}%`, top: `${f.y1 * 100}%`, width: `${(f.x2 - f.x1) * 100}%`, height: `${(f.y2 - f.y1) * 100}%` };
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={`Mz ${m.manzana} · Lote ${m.numero}`}
                    onClick={() => setSel(m.id)}
                    className="absolute border-2 opacity-80 hover:opacity-100"
                    style={{ ...estilo, background: `${color}99`, borderColor: sel === m.id ? "currentColor" : color }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{planos.data?.length === 0 ? "No hay planos vigentes." : "Cargando plano…"}</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          {!elegido ? (
            <p className="text-muted-foreground">Toca un lote en el plano.</p>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold">Mz {elegido.manzana} · Lote {elegido.numero}</p>
              <Badge variant="outline">{ETIQUETA[elegido.estado] ?? elegido.estado}</Badge>
              {libre ? (
                <>
                  <p>Área: {numero(elegido.area_m2!)} m²</p>
                  <p>Precio de lista: {soles(elegido.precio_lista!)}</p>
                  <Button className="w-full" onClick={() => navigate({ to: "/apartados", search: { nuevoLote: elegido.id } })}>
                    Apartar
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
