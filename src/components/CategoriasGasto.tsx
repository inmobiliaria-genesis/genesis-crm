import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { soles } from "@/lib/format";
import { useCategorias } from "@/lib/gastos";

/** Categorías, subcategorías y topes de gasto. Solo admin edita; los cambios quedan en la Bitácora. */
export function CategoriasGasto({ editable }: { editable: boolean }) {
  const cats = useCategorias();
  const qc = useQueryClient();
  const [nuevaSub, setNuevaSub] = useState<Record<string, string>>({});
  const refrescar = () => qc.invalidateQueries({ queryKey: ["gasto-categorias"] });

  async function cambiarTope(tabla: "gasto_categoria" | "gasto_subcategoria", id: string, actual: number | null, valor: string) {
    const tope = valor.trim() === "" ? null : Number(valor);
    if (tope === actual || (tope !== null && !(tope >= 0))) return;
    const { error } = await supabase.from(tabla).update({ tope }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tope actualizado");
    refrescar();
  }

  async function agregarSub(categoriaId: string) {
    const nombre = (nuevaSub[categoriaId] ?? "").trim();
    if (!nombre) return;
    const orden = (cats.data?.subcategorias.filter((s) => s.categoria_id === categoriaId).length ?? 0) + 1;
    const { error } = await supabase
      .from("gasto_subcategoria")
      .insert({ categoria_id: categoriaId, nombre, orden, exige_nota: nombre.toLowerCase() === "otros" });
    if (error) return toast.error(error.message);
    setNuevaSub((p) => ({ ...p, [categoriaId]: "" }));
    refrescar();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categorías de gasto y topes mensuales</CardTitle>
        <p className="text-xs text-muted-foreground">El historial de cambios queda en la Bitácora. Deja el tope vacío si no tiene.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {cats.data?.categorias.map((c) => {
          const subs = cats.data.subcategorias.filter((s) => s.categoria_id === c.id);
          return (
            <div key={c.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {c.nombre}
                  {!c.manual ? <span className="ml-2 text-xs text-muted-foreground">(automática)</span> : null}
                </p>
                <TopeCampo editable={editable} valor={c.tope} onGuardar={(v) => cambiarTope("gasto_categoria", c.id, c.tope, v)} />
              </div>
              {subs.length ? (
                <ul className="mt-2 space-y-1">
                  {subs.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 pl-4 text-sm">
                      <span>{s.nombre}</span>
                      <TopeCampo editable={editable} valor={s.tope} onGuardar={(v) => cambiarTope("gasto_subcategoria", s.id, s.tope, v)} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {editable && c.manual && c.tipo !== "otros" ? (
                <div className="mt-2 flex gap-2 pl-4">
                  <Input
                    className="h-8"
                    placeholder="Nueva subcategoría"
                    value={nuevaSub[c.id] ?? ""}
                    onChange={(e) => setNuevaSub((p) => ({ ...p, [c.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => agregarSub(c.id)}>Agregar</Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TopeCampo({ editable, valor, onGuardar }: { editable: boolean; valor: number | null; onGuardar: (v: string) => void }) {
  if (!editable) return <span className="text-sm text-muted-foreground">{valor == null ? "Sin tope" : `Tope ${soles(valor)}`}</span>;
  return (
    <Input
      className="h-8 w-32"
      type="number"
      step="0.01"
      placeholder="Sin tope"
      defaultValue={valor == null ? "" : String(valor)}
      onBlur={(e) => onGuardar(e.target.value)}
    />
  );
}
