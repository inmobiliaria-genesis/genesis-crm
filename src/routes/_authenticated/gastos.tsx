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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CamposMetodo, MostrarMetodo } from "@/components/MetodoPago";
import { DialogoEliminar } from "@/components/DialogoEliminar";
import { METODOS_PAGO, ETIQUETA_METODO } from "@/lib/cobranza";
import { fecha, soles, hoyLima } from "@/lib/format";
import { usePerfil, puedeGastos, esAdmin } from "@/lib/sesion";
import {
  useCategorias,
  mesActual,
  inicioMes,
  finMes,
  subirComprobante,
  abrirComprobante,
  type Gasto,
  type Categoria,
  type Subcategoria,
} from "@/lib/gastos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos — Gestión de lotes" },
      { name: "description", content: "Pagos de gastos del mes por categoría, topes y reembolsos." },
      { property: "og:title", content: "Gastos — Gestión de lotes" },
      { property: "og:description", content: "Pagos de gastos del mes por categoría, topes y reembolsos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GastosPage,
});

const TODOS = "__todos";

function GastosPage() {
  const { data: perfil, isLoading } = usePerfil();
  const qc = useQueryClient();
  const permitido = puedeGastos(perfil);
  const [mes, setMes] = useState(mesActual());
  const [fCat, setFCat] = useState(TODOS);
  const [fSub, setFSub] = useState(TODOS);
  const [fMet, setFMet] = useState(TODOS);
  const [editar, setEditar] = useState<Gasto | null | "nuevo">(null);
  const [reembolsar, setReembolsar] = useState<Gasto | null>(null);
  const [eliminar, setEliminar] = useState<Gasto | null>(null);
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

  const gastos = useQuery({
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
    queryKey: ["gastos-reembolsos"],
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

  const nombreCat = useMemo(() => new Map((cats.data?.categorias ?? []).map((c) => [c.id, c.nombre])), [cats.data]);
  const nombreSub = useMemo(() => new Map((cats.data?.subcategorias ?? []).map((s) => [s.id, s.nombre])), [cats.data]);

  const filtrados = (gastos.data ?? []).filter(
    (g) =>
      (fCat === TODOS || g.categoria_id === fCat) &&
      (fSub === TODOS || g.subcategoria_id === fSub) &&
      (fMet === TODOS || g.metodo === fMet),
  );
  const filasCat = (resumen.data ?? []).filter((r) => r.subcategoria_id === null);
  const totalMes = filasCat.reduce((t, r) => t + Number(r.pagado), 0);
  const porPersona = useMemo(() => {
    const m = new Map<string, number>();
    (pendientes.data ?? []).forEach((g) => m.set(g.pagado_por ?? "—", (m.get(g.pagado_por ?? "—") ?? 0) + Number(g.monto)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pendientes.data]);

  function refrescar() {
    qc.invalidateQueries({ queryKey: ["gastos"] });
    qc.invalidateQueries({ queryKey: ["gastos-resumen"] });
    qc.invalidateQueries({ queryKey: ["gastos-reembolsos"] });
  }

  if (!isLoading && !permitido) {
    return (
      <AppShell titulo="Gastos">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </AppShell>
    );
  }

  const subsFiltro = (cats.data?.subcategorias ?? []).filter((s) => fCat === TODOS || s.categoria_id === fCat);

  return (
    <AppShell
      titulo="Gastos"
      descripcion="Pagos del mes por categoría, topes y reembolsos"
      acciones={
        <>
          <Input type="month" className="w-44" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
          <Button size="sm" onClick={() => setEditar("nuevo")}>
            <Plus className="h-4 w-4" /> Registrar pago
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Resumen por categoría</CardTitle>
            <p className="text-sm">
              Total del mes (incluye planilla): <span className="num text-lg font-semibold">{soles(totalMes)}</span>
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
                  const excede = r.tope !== null && Number(r.diferencia) < -0.005;
                  const esCat = r.subcategoria_id === null;
                  return (
                    <TableRow
                      key={`${r.categoria_id}-${r.subcategoria_id ?? "c"}`}
                      className={cn(excede && "bg-destructive/10", esCat && "font-medium")}
                    >
                      <TableCell className={cn(!esCat && "pl-8 text-muted-foreground")}>
                        {esCat ? r.categoria : r.subcategoria}
                      </TableCell>
                      <TableCell className="num text-right">{soles(r.pagado)}</TableCell>
                      <TableCell className="num text-right">{r.tope !== null ? soles(r.tope) : "—"}</TableCell>
                      <TableCell className={cn("num text-right", excede && "text-destructive")}>
                        {r.tope !== null ? soles(r.diferencia) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end gap-3">
            <CardTitle className="mr-auto text-base">Pagos del mes</CardTitle>
            <Filtro etiqueta="Categoría" valor={fCat} onValor={(v) => { setFCat(v); setFSub(TODOS); }}
              opciones={(cats.data?.categorias ?? []).map((c) => [c.id, c.nombre])} />
            <Filtro etiqueta="Subcategoría" valor={fSub} onValor={setFSub} opciones={subsFiltro.map((s) => [s.id, s.nombre])} />
            <Filtro etiqueta="Método" valor={fMet} onValor={setFMet} opciones={METODOS_PAGO.map((m) => [m, ETIQUETA_METODO[m]])} />
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
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {gastos.isLoading ? "Cargando…" : "No hay pagos con estos filtros."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{fecha(g.fecha)}</TableCell>
                      <TableCell>
                        {nombreCat.get(g.categoria_id)}
                        {g.subcategoria_id ? (
                          <span className="block text-xs text-muted-foreground">{nombreSub.get(g.subcategoria_id)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">
                        <Detalle g={g} />
                      </TableCell>
                      <TableCell><MostrarMetodo metodo={g.metodo} operacion={g.numero_operacion} /></TableCell>
                      <TableCell className="num text-right">{soles(g.monto)}</TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap text-right">
                        {g.comprobante_path ? (
                          <Button size="sm" variant="ghost" title="Ver comprobante"
                            onClick={() => abrirComprobante(g.comprobante_path!).catch((e) => toast.error(e.message))}>
                            <Paperclip className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => setEditar(g)}>Editar</Button>
                        {esAdmin(perfil) ? (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setEliminar(g)}>
                            Eliminar
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por reembolsar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {porPersona.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay reembolsos pendientes.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {porPersona.map(([p, t]) => (
                  <div key={p} className="rounded-md border border-border px-4 py-2">
                    <p className="text-xs text-muted-foreground">{p}</p>
                    <p className="num font-semibold">{soles(t)}</p>
                  </div>
                ))}
              </div>
            )}
            {(pendientes.data ?? []).length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Pagado por</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendientes.data ?? []).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{fecha(g.fecha)}</TableCell>
                      <TableCell>{g.pagado_por}</TableCell>
                      <TableCell>{g.subcategoria_id ? nombreSub.get(g.subcategoria_id) : ""}{g.notas ? ` · ${g.notas}` : ""}</TableCell>
                      <TableCell className="num text-right">{soles(g.monto)}</TableCell>
                      <TableCell className="text-right">
                        {esAdmin(perfil) ? (
                          <Button size="sm" onClick={() => setReembolsar(g)}>Marcar reembolsado</Button>
                        ) : (
                          <Badge variant="outline">Por reembolsar</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {editar && cats.data ? (
        <DialogoGasto
          gasto={editar === "nuevo" ? null : editar}
          categorias={cats.data.categorias}
          subcategorias={cats.data.subcategorias}
          onCerrar={(ok) => { setEditar(null); if (ok) refrescar(); }}
        />
      ) : null}
      {reembolsar ? (
        <DialogoReembolso gasto={reembolsar} onCerrar={(ok) => { setReembolsar(null); if (ok) refrescar(); }} />
      ) : null}
      <DialogoEliminar
        titulo="Eliminar pago de gasto"
        abierto={!!eliminar}
        onCambio={(o) => { if (!o) setEliminar(null); }}
        onConfirmar={async (motivo) => {
          const { error } = await supabase.from("gasto").update({ anulado: true, motivo_anulacion: motivo }).eq("id", eliminar!.id);
          if (error) return error.message;
          refrescar();
          return null;
        }}
      />
    </AppShell>
  );
}

function Filtro({ etiqueta, valor, onValor, opciones }: { etiqueta: string; valor: string; onValor: (v: string) => void; opciones: [string, string][] }) {
  return (
    <div className="w-44">
      <Label className="text-xs">{etiqueta}</Label>
      <Select value={valor} onValueChange={onValor}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opciones.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Detalle({ g }: { g: Gasto }) {
  const partes: string[] = [];
  if (g.trabajador) partes.push(`${g.trabajador} · ${g.dias ?? 0} días`);
  if (g.persona) partes.push(g.persona);
  if (g.descripcion) partes.push(g.descripcion);
  if (g.pagado_por) partes.push(`Pagado por ${g.pagado_por}`);
  if (g.notas) partes.push(g.notas);
  return (
    <>
      {partes.join(" · ") || <span className="text-muted-foreground">—</span>}
      {g.reembolso_estado === "por_reembolsar" ? <Badge variant="outline" className="ml-1">Por reembolsar</Badge> : null}
      {g.reembolso_estado === "reembolsado" ? (
        <span className="block text-xs text-muted-foreground">Reembolsado el {fecha(g.reembolso_fecha)}</span>
      ) : null}
    </>
  );
}

function DialogoGasto({
  gasto,
  categorias,
  subcategorias,
  onCerrar,
}: {
  gasto: Gasto | null;
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  onCerrar: (ok: boolean) => void;
}) {
  const manuales = categorias.filter((c) => c.manual || c.id === gasto?.categoria_id);
  const [f, setF] = useState({
    fecha: gasto?.fecha ?? hoyLima(),
    categoria_id: gasto?.categoria_id ?? "",
    subcategoria_id: gasto?.subcategoria_id ?? "",
    monto: gasto ? String(gasto.monto) : "",
    metodo: gasto?.metodo ?? "",
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
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const cat = categorias.find((c) => c.id === f.categoria_id);
  const subs = subcategorias.filter((s) => s.categoria_id === f.categoria_id);
  const sub = subs.find((s) => s.id === f.subcategoria_id);
  const esJornales = sub?.nombre.toLowerCase() === "jornales";
  const esViaticos = cat?.nombre.toLowerCase() === "viáticos";
  const esPublicidad = cat?.nombre.toLowerCase() === "publicidad";
  const esReembolso = cat?.tipo === "reembolso";
  const notaObligatoria = cat?.tipo === "otros" || !!sub?.exige_nota;

  const tope = useQuery({
    queryKey: ["tope-gasto", f.categoria_id, f.subcategoria_id, f.fecha, gasto?.id],
    enabled: !!f.categoria_id && (subs.length === 0 || !!f.subcategoria_id) && !!f.fecha,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tope_gasto", {
        _categoria_id: f.categoria_id,
        _subcategoria_id: (f.subcategoria_id || null) as string,
        _fecha: f.fecha,
        _excluir: (gasto?.id ?? null) as string,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const monto = Number(f.monto) || 0;
  const exceso = tope.data ? Number(tope.data.llevas) + monto - Number(tope.data.tope) : 0;

  const falta =
    !f.fecha || !f.categoria_id || (subs.length > 0 && !f.subcategoria_id) || monto <= 0 || !f.metodo ||
    (notaObligatoria && !f.notas.trim()) || (esPublicidad && !f.descripcion.trim()) ||
    (esJornales && (!f.trabajador.trim() || !(Number(f.dias) > 0))) || (esViaticos && !f.persona.trim()) ||
    (esReembolso && !f.pagado_por.trim());

  async function guardar() {
    setGuardando(true);
    try {
      let comprobante_path = gasto?.comprobante_path ?? null;
      if (archivo) comprobante_path = await subirComprobante(archivo, "gastos");
      const fila = {
        fecha: f.fecha,
        categoria_id: f.categoria_id,
        subcategoria_id: f.subcategoria_id || null,
        monto,
        metodo: f.metodo,
        numero_operacion: f.metodo === "efectivo" ? null : f.numero_operacion.trim() || null,
        comprobante_path,
        notas: f.notas.trim() || null,
        trabajador: esJornales ? f.trabajador.trim() : null,
        dias: esJornales ? Number(f.dias) : null,
        persona: esViaticos ? f.persona.trim() : null,
        descripcion: esPublicidad ? f.descripcion.trim() : null,
        pagado_por: esReembolso ? f.pagado_por.trim() : null,
      };
      const { error } = gasto
        ? await supabase.from("gasto").update(fila).eq("id", gasto.id)
        : await supabase.from("gasto").insert(fila);
      if (error) throw error;
      toast.success(gasto ? "Pago actualizado" : "Pago registrado");
      onCerrar(true);
    } catch (e) {
      toast.error("No se pudo guardar", { description: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar pago de gasto" : "Registrar pago de gasto"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Categoría</Label>
            <Select value={f.categoria_id} onValueChange={(v) => setF((p) => ({ ...p, categoria_id: v, subcategoria_id: "" }))}>
              <SelectTrigger><SelectValue placeholder="Elige la categoría" /></SelectTrigger>
              <SelectContent>
                {manuales.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {subs.length > 0 ? (
            <div className="space-y-1">
              <Label>Subcategoría</Label>
              <Select value={f.subcategoria_id} onValueChange={(v) => set("subcategoria_id", v)}>
                <SelectTrigger><SelectValue placeholder="Elige la subcategoría" /></SelectTrigger>
                <SelectContent>
                  {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {tope.data ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Llevas <span className="num">{soles(tope.data.llevas)}</span> de <span className="num">{soles(tope.data.tope)}</span> este mes
              {exceso > 0.005 ? (
                <span className="mt-1 block font-medium text-destructive">
                  Este pago supera el tope mensual por <span className="num">{soles(exceso)}</span>
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="space-y-1">
            <Label>Monto (S/)</Label>
            <Input type="number" step="0.01" min="0" value={f.monto} onChange={(e) => set("monto", e.target.value)} />
          </div>
          <CamposMetodo metodo={f.metodo} operacion={f.numero_operacion}
            onMetodo={(m) => set("metodo", m)} onOperacion={(o) => set("numero_operacion", o)} />
          {esJornales ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Trabajador</Label>
                <Input value={f.trabajador} onChange={(e) => set("trabajador", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Días</Label>
                <Input type="number" step="0.5" min="0" value={f.dias} onChange={(e) => set("dias", e.target.value)} />
              </div>
            </div>
          ) : null}
          {esViaticos ? (
            <div className="space-y-1">
              <Label>Persona</Label>
              <Input value={f.persona} onChange={(e) => set("persona", e.target.value)} />
            </div>
          ) : null}
          {esPublicidad ? (
            <div className="space-y-1">
              <Label>Descripción (para qué fue)</Label>
              <Input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
            </div>
          ) : null}
          {esReembolso ? (
            <div className="space-y-1">
              <Label>Pagado por</Label>
              <Input value={f.pagado_por} onChange={(e) => set("pagado_por", e.target.value)} />
              <p className="text-xs text-muted-foreground">Quedará como «Por reembolsar».</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Comprobante (opcional, foto o PDF, máx. 10 MB)</Label>
            <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            {gasto?.comprobante_path && !archivo ? <p className="text-xs text-muted-foreground">Ya tiene comprobante; sube otro para reemplazarlo.</p> : null}
          </div>
          <div className="space-y-1">
            <Label>Notas{notaObligatoria ? " (obligatoria)" : ""}</Label>
            <Textarea rows={2} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCerrar(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={falta || guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoReembolso({ gasto, onCerrar }: { gasto: Gasto; onCerrar: (ok: boolean) => void }) {
  const [fechaR, setFechaR] = useState(hoyLima());
  const [metodo, setMetodo] = useState("");
  const [op, setOp] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setOp(""); }, [gasto.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como reembolsado</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Devolver <span className="num font-semibold">{soles(gasto.monto)}</span> a {gasto.pagado_por}.
        </p>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Fecha de devolución</Label>
            <Input type="date" value={fechaR} onChange={(e) => setFechaR(e.target.value)} />
          </div>
          <CamposMetodo etiqueta="Método de devolución" metodo={metodo} operacion={op} onMetodo={setMetodo} onOperacion={setOp} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCerrar(false)}>Cancelar</Button>
          <Button
            disabled={!fechaR || !metodo || guardando}
            onClick={async () => {
              setGuardando(true);
              const { error } = await supabase.from("gasto").update({
                reembolso_estado: "reembolsado",
                reembolso_fecha: fechaR,
                reembolso_metodo: metodo,
                reembolso_operacion: metodo === "efectivo" ? null : op.trim() || null,
              }).eq("id", gasto.id);
              setGuardando(false);
              if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
              toast.success("Reembolso registrado");
              onCerrar(true);
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
