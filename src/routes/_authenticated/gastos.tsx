import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePerfil, puedeGastos } from "@/lib/sesion";
import { soles, fecha, hoyLima } from "@/lib/format";
import { METODOS_PAGO, ETIQUETA_METODO, etiquetaMetodo, llevaOperacion } from "@/lib/cobranza";
import {
  useCategorias,
  inicioMes,
  finMes,
  mesActualLima,
  subirComprobante,
  abrirComprobante,
  CLASE_SELECT,
  type Gasto,
} from "@/lib/gastos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos — Gestión de lotes" },
      { name: "description", content: "Registro de gastos por categoría, topes mensuales y reembolsos." },
      { property: "og:title", content: "Gastos — Gestión de lotes" },
      { property: "og:description", content: "Registro de gastos por categoría, topes mensuales y reembolsos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GastosPage,
});

const TODOS = "";

function GastosPage() {
  const { data: perfil, isLoading } = usePerfil();
  const permitido = puedeGastos(perfil);
  const admin = perfil?.rol === "admin";
  const [mes, setMes] = useState(mesActualLima());
  const [fCat, setFCat] = useState(TODOS);
  const [fSub, setFSub] = useState(TODOS);
  const [fMet, setFMet] = useState(TODOS);
  const [editando, setEditando] = useState<Gasto | "nuevo" | null>(null);
  const [reembolsar, setReembolsar] = useState<Gasto | null>(null);
  const [anular, setAnular] = useState<Gasto | null>(null);
  const cats = useCategorias();

  const resumen = useQuery({
    queryKey: ["gastos-resumen", mes],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resumen_gastos", { _mes: inicioMes(mes) });
      if (error) throw error;
      return data;
    },
  });

  const pagos = useQuery({
    queryKey: ["gastos", mes],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gasto")
        .select("*")
        .eq("anulado", false)
        .gte("fecha", inicioMes(mes))
        .lt("fecha", finMes(mes))
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const pendientes = useQuery({
    queryKey: ["gastos-por-reembolsar"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gasto")
        .select("*")
        .eq("anulado", false)
        .eq("reembolso_estado", "por_reembolsar")
        .order("fecha");
      if (error) throw error;
      return data;
    },
  });

  const nombreCat = (id: string | null) => cats.data?.categorias.find((c) => c.id === id)?.nombre ?? "—";
  const nombreSub = (id: string | null) => cats.data?.subcategorias.find((s) => s.id === id)?.nombre ?? "";

  const filtrados = useMemo(
    () =>
      (pagos.data ?? []).filter(
        (g) => (!fCat || g.categoria_id === fCat) && (!fSub || g.subcategoria_id === fSub) && (!fMet || g.metodo === fMet),
      ),
    [pagos.data, fCat, fSub, fMet],
  );

  const totalMes = (resumen.data ?? []).filter((r) => r.orden_sub === -1).reduce((a, r) => a + Number(r.pagado ?? 0), 0);

  const porPersona = useMemo(() => {
    const m = new Map<string, number>();
    (pendientes.data ?? []).forEach((g) => m.set(g.pagado_por ?? "—", (m.get(g.pagado_por ?? "—") ?? 0) + Number(g.monto)));
    return [...m.entries()];
  }, [pendientes.data]);

  if (!isLoading && !permitido) {
    return (
      <AppShell titulo="Gastos">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Gastos"
      descripcion="Pagos del mes por categoría, topes y reembolsos"
      acciones={
        <>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />
          <Button onClick={() => setEditando("nuevo")}>
            <Plus className="h-4 w-4" /> Registrar gasto
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Resumen del mes</CardTitle>
            <p className="text-sm">
              Total del mes (incluye planilla): <span className="font-semibold">{soles(totalMes)}</span>
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría / subcategoría</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Tope</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(resumen.data ?? []).map((r) => {
                  const excede = r.tope != null && Number(r.pagado) > Number(r.tope);
                  const esCat = r.orden_sub === -1;
                  return (
                    <TableRow key={`${r.categoria_id}-${r.subcategoria_id ?? "c"}`} className={cn(excede && "bg-destructive/10")}>
                      <TableCell className={cn(esCat ? "font-medium" : "pl-8 text-muted-foreground")}>
                        {esCat ? r.categoria : r.subcategoria}
                      </TableCell>
                      <TableCell className="text-right">{soles(r.pagado)}</TableCell>
                      <TableCell className="text-right">{r.tope == null ? "—" : soles(r.tope)}</TableCell>
                      <TableCell className={cn("text-right", excede && "font-semibold text-destructive")}>
                        {r.diferencia == null ? "—" : soles(r.diferencia)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagos del mes</CardTitle>
            <div className="grid gap-2 sm:grid-cols-3">
              <select className={CLASE_SELECT} value={fCat} onChange={(e) => { setFCat(e.target.value); setFSub(TODOS); }}>
                <option value="">Todas las categorías</option>
                {cats.data?.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select className={CLASE_SELECT} value={fSub} onChange={(e) => setFSub(e.target.value)}>
                <option value="">Todas las subcategorías</option>
                {cats.data?.subcategorias.filter((s) => !fCat || s.categoria_id === fCat).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <select className={CLASE_SELECT} value={fMet} onChange={(e) => setFMet(e.target.value)}>
                <option value="">Todos los métodos</option>
                {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Sin pagos</TableCell></TableRow>
                ) : null}
                {filtrados.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{fecha(g.fecha)}</TableCell>
                    <TableCell>
                      {nombreCat(g.categoria_id)}
                      {g.subcategoria_id ? <span className="text-muted-foreground"> · {nombreSub(g.subcategoria_id)}</span> : null}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {[g.trabajador && `${g.trabajador} (${g.dias} días)`, g.persona, g.descripcion, g.pagado_por && `Pagó: ${g.pagado_por}`, g.notas]
                        .filter(Boolean)
                        .join(" · ")}
                      {g.reembolso_estado ? (
                        <span className="ml-1 font-medium text-foreground">
                          [{g.reembolso_estado === "reembolsado" ? "Reembolsado" : "Por reembolsar"}]
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {etiquetaMetodo(g.metodo)}
                      {g.numero_operacion ? <span className="block text-xs text-muted-foreground">{g.numero_operacion}</span> : null}
                    </TableCell>
                    <TableCell className="text-right">{soles(g.monto)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {g.comprobante_path ? (
                        <Button size="sm" variant="ghost" onClick={() => abrirComprobante(g.comprobante_path!).catch((e) => toast.error(e.message))}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {(g as { comision_id?: string | null }).comision_id ? (
                        <span className="text-xs text-muted-foreground">Automático · se modifica en Comisiones</span>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditando(g)}>Editar</Button>
                          {admin ? <Button size="sm" variant="ghost" onClick={() => setAnular(g)}>Anular</Button> : null}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por reembolsar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {porPersona.length === 0 ? <p className="text-sm text-muted-foreground">No hay reembolsos pendientes.</p> : (
              <div className="flex flex-wrap gap-3">
                {porPersona.map(([p, t]) => (
                  <div key={p} className="rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{p}</span>: {soles(t)}
                  </div>
                ))}
              </div>
            )}
            {(pendientes.data ?? []).length ? (
              <Table>
                <TableBody>
                  {pendientes.data!.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{fecha(g.fecha)}</TableCell>
                      <TableCell>{g.pagado_por}</TableCell>
                      <TableCell>{nombreSub(g.subcategoria_id)}</TableCell>
                      <TableCell className="text-right">{soles(g.monto)}</TableCell>
                      <TableCell className="text-right">
                        {admin ? <Button size="sm" variant="outline" onClick={() => setReembolsar(g)}>Marcar reembolsado</Button> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {editando ? <DialogoGasto gasto={editando === "nuevo" ? null : editando} onCerrar={() => setEditando(null)} /> : null}
      {reembolsar ? <DialogoReembolso gasto={reembolsar} onCerrar={() => setReembolsar(null)} /> : null}
      {anular ? <DialogoAnular gasto={anular} onCerrar={() => setAnular(null)} /> : null}
    </AppShell>
  );
}

function useRefrescar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["gastos"] });
    qc.invalidateQueries({ queryKey: ["gastos-resumen"] });
    qc.invalidateQueries({ queryKey: ["gastos-por-reembolsar"] });
  };
}

function DialogoGasto({ gasto, onCerrar }: { gasto: Gasto | null; onCerrar: () => void }) {
  const cats = useCategorias();
  const refrescar = useRefrescar();
  const [f, setF] = useState({
    fecha: gasto?.fecha ?? hoyLima(),
    categoria_id: gasto?.categoria_id ?? "",
    subcategoria_id: gasto?.subcategoria_id ?? "",
    monto: gasto ? String(gasto.monto) : "",
    metodo: gasto?.metodo ?? "transferencia",
    numero_operacion: gasto?.numero_operacion ?? "",
    notas: gasto?.notas ?? "",
    trabajador: gasto?.trabajador ?? "",
    dias: gasto?.dias != null ? String(gasto.dias) : "",
    persona: gasto?.persona ?? "",
    descripcion: gasto?.descripcion ?? "",
    pagado_por: gasto?.pagado_por ?? "",
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tope, setTope] = useState<{ llevas: number; tope: number | null } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const cat = cats.data?.categorias.find((c) => c.id === f.categoria_id);
  const subs = cats.data?.subcategorias.filter((s) => s.categoria_id === f.categoria_id) ?? [];
  const sub = subs.find((s) => s.id === f.subcategoria_id);
  const esJornales = sub?.nombre.toLowerCase() === "jornales";
  const esViaticos = cat?.nombre.toLowerCase() === "viáticos";
  const esPublicidad = cat?.nombre.toLowerCase() === "publicidad";
  const esReembolso = cat?.tipo === "reembolso";
  const notaObligatoria = cat?.tipo === "otros" || !!sub?.exige_nota;

  useEffect(() => {
    if (!f.categoria_id || (subs.length && !f.subcategoria_id)) { setTope(null); return; }
    supabase
      .rpc("tope_gasto", {
        _categoria_id: f.categoria_id,
        _subcategoria_id: f.subcategoria_id || (null as unknown as string),
        _fecha: f.fecha,
        ...(gasto ? { _excluir: gasto.id } : {}),
      })
      .then(({ data }) => {
        const fila = Array.isArray(data) ? data[0] : null;
        setTope(fila && fila.tope != null ? { llevas: Number(fila.llevas), tope: Number(fila.tope) } : null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.categoria_id, f.subcategoria_id, f.fecha]);

  const exceso = tope?.tope != null ? tope.llevas + Number(f.monto || 0) - tope.tope : 0;

  async function guardar() {
    if (!f.categoria_id) { toast.error("Elige la categoría"); return; }
    if (!(Number(f.monto) > 0)) { toast.error("Indica el monto"); return; }
    setGuardando(true);
    try {
      const comprobante_path = archivo ? await subirComprobante(archivo) : gasto?.comprobante_path ?? null;
      const fila = {
        fecha: f.fecha,
        categoria_id: f.categoria_id,
        subcategoria_id: f.subcategoria_id || null,
        monto: Number(f.monto),
        metodo: f.metodo,
        numero_operacion: llevaOperacion(f.metodo) ? f.numero_operacion || null : null,
        notas: f.notas || null,
        trabajador: esJornales ? f.trabajador || null : null,
        dias: esJornales && f.dias ? Number(f.dias) : null,
        persona: esViaticos ? f.persona || null : null,
        descripcion: esPublicidad ? f.descripcion || null : null,
        pagado_por: esReembolso ? f.pagado_por || null : null,
        comprobante_path,
      };
      const { error } = gasto
        ? await supabase.from("gasto").update(fila).eq("id", gasto.id)
        : await supabase.from("gasto").insert(fila);
      if (error) throw error;
      toast.success("Gasto guardado");
      refrescar();
      onCerrar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
            <div>
              <Label>Monto (S/)</Label>
              <Input type="number" step="0.01" min="0" value={f.monto} onChange={(e) => set("monto", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Categoría</Label>
            <select className={CLASE_SELECT} value={f.categoria_id} onChange={(e) => setF((p) => ({ ...p, categoria_id: e.target.value, subcategoria_id: "" }))}>
              <option value="">Elige la categoría</option>
              {cats.data?.categorias.filter((c) => c.manual || c.id === gasto?.categoria_id).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          {subs.length ? (
            <div>
              <Label>Subcategoría</Label>
              <select className={CLASE_SELECT} value={f.subcategoria_id} onChange={(e) => set("subcategoria_id", e.target.value)}>
                <option value="">Elige la subcategoría</option>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          ) : null}
          {tope ? (
            <p className="text-sm text-muted-foreground">
              Llevas {soles(tope.llevas)} de {soles(tope.tope)} este mes.
              {exceso > 0.005 ? <span className="block font-medium text-destructive">Este pago supera el tope mensual por {soles(exceso)}</span> : null}
            </p>
          ) : null}
          {esJornales ? (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Trabajador</Label><Input value={f.trabajador} onChange={(e) => set("trabajador", e.target.value)} /></div>
              <div><Label>Días</Label><Input type="number" min="0" step="0.5" value={f.dias} onChange={(e) => set("dias", e.target.value)} /></div>
            </div>
          ) : null}
          {esViaticos ? <div><Label>Persona</Label><Input value={f.persona} onChange={(e) => set("persona", e.target.value)} /></div> : null}
          {esPublicidad ? <div><Label>¿Para qué fue?</Label><Input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></div> : null}
          {esReembolso ? (
            <div>
              <Label>Pagado por</Label>
              <Input value={f.pagado_por} onChange={(e) => set("pagado_por", e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Quedará como «Por reembolsar».</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Método</Label>
              <select className={CLASE_SELECT} value={f.metodo} onChange={(e) => set("metodo", e.target.value)}>
                {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>)}
              </select>
            </div>
            {llevaOperacion(f.metodo) ? (
              <div><Label>Código de operación (opcional)</Label><Input value={f.numero_operacion} onChange={(e) => set("numero_operacion", e.target.value)} /></div>
            ) : null}
          </div>
          <div>
            <Label>Comprobante (opcional, foto o PDF hasta 10 MB)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            {gasto?.comprobante_path && !archivo ? <p className="mt-1 text-xs text-muted-foreground">Ya tiene comprobante; sube otro para reemplazarlo.</p> : null}
          </div>
          <div>
            <Label>Notas{notaObligatoria ? " (obligatoria)" : ""}</Label>
            <Textarea value={f.notas} onChange={(e) => set("notas", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoReembolso({ gasto, onCerrar }: { gasto: Gasto; onCerrar: () => void }) {
  const refrescar = useRefrescar();
  const [f, setF] = useState({ fecha: hoyLima(), metodo: "transferencia", op: "" });
  async function guardar() {
    const { error } = await supabase
      .from("gasto")
      .update({
        reembolso_estado: "reembolsado",
        reembolso_fecha: f.fecha,
        reembolso_metodo: f.metodo,
        reembolso_operacion: llevaOperacion(f.metodo) ? f.op || null : null,
      })
      .eq("id", gasto.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Reembolso registrado");
    refrescar();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar reembolsado — {gasto.pagado_por} · {soles(gasto.monto)}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Fecha de devolución</Label><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
          <div>
            <Label>Método</Label>
            <select className={CLASE_SELECT} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
              {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>)}
            </select>
          </div>
          {llevaOperacion(f.metodo) ? <div><Label>Código de operación (opcional)</Label><Input value={f.op} onChange={(e) => setF({ ...f, op: e.target.value })} /></div> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAnular({ gasto, onCerrar }: { gasto: Gasto; onCerrar: () => void }) {
  const refrescar = useRefrescar();
  const [motivo, setMotivo] = useState("");
  async function guardar() {
    if (!motivo.trim()) { toast.error("Indica el motivo"); return; }
    const { error } = await supabase.from("gasto").update({ anulado: true, motivo_anulacion: motivo.trim() }).eq("id", gasto.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Gasto anulado");
    refrescar();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Anular gasto de {soles(gasto.monto)}</DialogTitle></DialogHeader>
        <Label>Motivo</Label>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={guardar}>Anular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
