import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DialogoEliminar } from "@/components/DialogoEliminar";
import { useCategorias, type Categoria, type Subcategoria } from "@/lib/gastos";
import { soles, fechaHora } from "@/lib/format";

type Edicion =
  | { tipo: "categoria"; fila: Categoria | null }
  | { tipo: "subcategoria"; fila: Subcategoria | null; categoriaId: string };

/** Categorías, subcategorías y topes de gastos; solo admin edita. Historial desde la bitácora. */
export function CategoriasGasto({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const cats = useCategorias();
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [eliminar, setEliminar] = useState<{ tabla: "gasto_categoria" | "gasto_subcategoria"; id: string; nombre: string } | null>(null);

  const historial = useQuery({
    queryKey: ["gasto-categorias-historial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bitacora")
        .select("id, tabla, accion, valores_antes, valores_despues, fecha_hora")
        .in("tabla", ["gasto_categoria", "gasto_subcategoria"])
        .order("fecha_hora", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  function refrescar() {
    qc.invalidateQueries({ queryKey: ["gasto-categorias"] });
    qc.invalidateQueries({ queryKey: ["gasto-categorias-historial"] });
  }

  const tope = (t: number | null) => (t === null ? "Sin tope" : soles(t));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Categorías de gastos y topes mensuales</CardTitle>
        {editable ? (
          <Button size="sm" variant="outline" onClick={() => setEdicion({ tipo: "categoria", fila: null })}>
            <Plus className="h-4 w-4" /> Categoría
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría / subcategoría</TableHead>
              <TableHead className="text-right">Tope mensual</TableHead>
              <TableHead />
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(cats.data?.categorias ?? []).map((c) => (
              <Fragment key={c.id}>
                <TableRow className="font-medium">
                  <TableCell>{c.nombre}</TableCell>
                  <TableCell className="num text-right">{tope(c.tope === null ? null : Number(c.tope))}</TableCell>
                  <TableCell>{!c.manual ? <Badge variant="outline">Automática</Badge> : null}</TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap text-right">
                    {editable ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEdicion({ tipo: "subcategoria", fila: null, categoriaId: c.id })}>+ Subcategoría</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEdicion({ tipo: "categoria", fila: c })}>Editar</Button>
                        {c.manual && c.tipo === "normal" ? (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setEliminar({ tabla: "gasto_categoria", id: c.id, nombre: c.nombre })}>Eliminar</Button>
                        ) : null}
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
                {(cats.data?.subcategorias ?? []).filter((s) => s.categoria_id === c.id).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-8 text-muted-foreground">{s.nombre}{s.exige_nota ? " (nota obligatoria)" : ""}</TableCell>
                    <TableCell className="num text-right text-muted-foreground">{tope(s.tope === null ? null : Number(s.tope))}</TableCell>
                    <TableCell />
                    <TableCell className="space-x-1 text-right">
                      {editable ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEdicion({ tipo: "subcategoria", fila: s, categoriaId: c.id })}>Editar</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setEliminar({ tabla: "gasto_subcategoria", id: s.id, nombre: s.nombre })}>Eliminar</Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>

        <div>
          <p className="mb-2 text-sm font-medium">Historial de cambios</p>
          {(historial.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(historial.data ?? []).map((h) => {
                const d = (h.valores_despues ?? {}) as { nombre?: string; tope?: number | null };
                const a = (h.valores_antes ?? {}) as { nombre?: string; tope?: number | null };
                const texto =
                  h.accion === "INSERT" ? `Creada «${d.nombre}» con tope ${tope(d.tope ?? null)}`
                  : h.accion === "ANULAR" ? `Eliminada «${d.nombre}»`
                  : a.tope !== d.tope ? `«${d.nombre}»: tope ${tope(a.tope ?? null)} → ${tope(d.tope ?? null)}`
                  : a.nombre !== d.nombre ? `Renombrada «${a.nombre}» → «${d.nombre}»`
                  : `Actualizada «${d.nombre}»`;
                return (
                  <li key={h.id} className="flex gap-3">
                    <span className="w-36 shrink-0 text-muted-foreground">{fechaHora(h.fecha_hora)}</span>
                    <span>{texto}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>

      {edicion ? <DialogoEdicion edicion={edicion} onCerrar={(ok) => { setEdicion(null); if (ok) refrescar(); }} /> : null}
      <DialogoEliminar
        titulo={`Eliminar «${eliminar?.nombre ?? ""}»`}
        abierto={!!eliminar}
        onCambio={(o) => { if (!o) setEliminar(null); }}
        onConfirmar={async (motivo) => {
          const { error } = await supabase.from(eliminar!.tabla).update({ anulado: true, motivo_anulacion: motivo }).eq("id", eliminar!.id);
          if (error) return error.message;
          refrescar();
          return null;
        }}
      />
    </Card>
  );
}

function DialogoEdicion({ edicion, onCerrar }: { edicion: Edicion; onCerrar: (ok: boolean) => void }) {
  const f = edicion.fila;
  const [nombre, setNombre] = useState(f?.nombre ?? "");
  const [tope, setTope] = useState(f?.tope != null ? String(f.tope) : "");
  const [exigeNota, setExigeNota] = useState(edicion.tipo === "subcategoria" ? (edicion.fila?.exige_nota ?? false) : false);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const t = tope.trim() === "" ? null : Number(tope);
    let error;
    if (edicion.tipo === "categoria") {
      const fila = { nombre: nombre.trim(), tope: t };
      ({ error } = edicion.fila
        ? await supabase.from("gasto_categoria").update(fila).eq("id", edicion.fila.id)
        : await supabase.from("gasto_categoria").insert({ ...fila, orden: 50 }));
    } else {
      const fila = { nombre: nombre.trim(), tope: t, exige_nota: exigeNota };
      ({ error } = edicion.fila
        ? await supabase.from("gasto_subcategoria").update(fila).eq("id", edicion.fila.id)
        : await supabase.from("gasto_subcategoria").insert({ ...fila, categoria_id: edicion.categoriaId, orden: 50 }));
    }
    setGuardando(false);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success("Guardado");
    onCerrar(true);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{f ? "Editar" : "Nueva"} {edicion.tipo === "categoria" ? "categoría" : "subcategoría"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Tope mensual (S/, vacío = sin tope)</Label>
            <Input type="number" step="0.01" min="0" value={tope} onChange={(e) => setTope(e.target.value)} />
          </div>
          {edicion.tipo === "subcategoria" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={exigeNota} onChange={(e) => setExigeNota(e.target.checked)} /> Nota obligatoria
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCerrar(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={!nombre.trim() || guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
