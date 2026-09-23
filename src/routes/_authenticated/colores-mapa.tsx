import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePerfil, esAdmin } from "@/lib/sesion";
import { useColores, PALETA } from "@/lib/plano";

export const Route = createFileRoute("/_authenticated/colores-mapa")({
  head: () => ({
    meta: [
      { title: "Colores del mapa — Gestión de lotes" },
      { name: "description", content: "Color asignado a cada estado de lote en el plano." },
      { property: "og:title", content: "Colores del mapa — Gestión de lotes" },
      {
        property: "og:description",
        content: "Color asignado a cada estado de lote en el plano.",
      },
    ],
  }),
  component: ColoresPage,
});

function ColoresPage() {
  const { data: perfil } = usePerfil();
  const admin = esAdmin(perfil);
  const colores = useColores();
  const qc = useQueryClient();
  const [pendientes, setPendientes] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const cambios = Object.entries(pendientes);
    if (cambios.length === 0) return;
    setGuardando(true);
    for (const [estado, color] of cambios) {
      const { error } = await supabase.from("color_estado").update({ color }).eq("estado", estado);
      if (error) {
        setGuardando(false);
        toast.error("No se pudo guardar", { description: error.message });
        return;
      }
    }
    setGuardando(false);
    setPendientes({});
    toast.success("Colores actualizados");
    qc.invalidateQueries({ queryKey: ["colores-estado"] });
  }

  return (
    <AppShell
      titulo="Colores del mapa"
      descripcion="Color con el que se dibuja cada estado de lote en el plano"
      acciones={
        admin ? (
          <Button onClick={guardar} disabled={guardando || Object.keys(pendientes).length === 0}>
            Guardar
          </Button>
        ) : null
      }
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Estados registrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {colores.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay estados registrados.</p>
          ) : null}
          {colores.data?.map((c) => {
            const valor = pendientes[c.estado] ?? c.color;
            return (
              <div key={c.estado} className="flex items-center gap-3">
                <span
                  className="h-6 w-6 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: valor }}
                />
                <span className="flex-1 text-sm capitalize">{c.estado}</span>
                {admin ? (
                  <Select
                    value={valor}
                    onValueChange={(v) => setPendientes((p) => ({ ...p, [c.estado]: v }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PALETA.map((p) => (
                        <SelectItem key={p.valor} value={p.valor}>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: p.valor }}
                            />
                            {p.nombre}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="num text-xs text-muted-foreground">{valor}</span>
                )}
              </div>
            );
          })}
          {!admin ? (
            <p className="pt-2 text-xs text-muted-foreground">
              Solo un administrador puede cambiar estos colores.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}
