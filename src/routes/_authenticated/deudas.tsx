import { ColOrden, coincide, useOrden } from "@/components/ListaControles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { CamposMetodo } from "@/components/MetodoPago";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePerfil, puedeGastos } from "@/lib/sesion";
import { soles, fecha, hoyLima } from "@/lib/format";
import { etiquetaMetodo } from "@/lib/cobranza";
import { abrirComprobante, CLASE_SELECT } from "@/lib/gastos";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/deudas")({
  head: () => ({
    meta: [
      { title: "Deudas — Gestión de lotes" },
      { name: "description", content: "Deudas pendientes de la empresa, abonos parciales y saldos." },
      { property: "og:title", content: "Deudas — Gestión de lotes" },
      { property: "og:description", content: "Deudas pendientes de la empresa, abonos parciales y saldos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeudasPage,
});

type Deuda = Database["public"]["Tables"]["deuda"]["Row"];
type Abono = Database["public"]["Tables"]["deuda_abono"]["Row"];

const TIPOS: Record<string, string> = {
  obligaciones_laborales: "Obligaciones laborales",
  proveedores: "Proveedores",
  prestamos: "Préstamos",
  impuestos: "Impuestos",
  otros: "Otros",
  comisiones: "Comisiones e incentivos",
};
const SUBTIPOS = ["CTS", "AFP", "ONP", "ESSALUD", "Gratificaciones", "Otros"];
const ESTADOS: Record<string, string> = { pendiente: "Pendiente", pagada_parte: "Pagada en parte", pagada: "Pagada" };

type Fila = {
  key: string;
  tipo: string;
  acreedor: string;
  concepto: string;
  total: number;
  abonado: number;
  saldo: number;
  vencimiento: string | null;
  estado: string;
  deuda?: Deuda;
  auto?: boolean;
};

async function subirDoc(archivo: File) {
  if (archivo.size > 10 * 1024 * 1024) throw new Error("El archivo supera 10 MB.");
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "bin";
  const ruta = `deudas/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("comprobantes").upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw error;
  return ruta;
}

function sumarDias(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function DeudasPage() {
  const { data: perfil, isLoading } = usePerfil();
  const permitido = puedeGastos(perfil);
  const admin = perfil?.rol === "admin";
  const qc = useQueryClient();
  const [fTipo, setFTipo] = useState("");
  const [fAcr, setFAcr] = useState("");
  const [fEst, setFEst] = useState("con_saldo");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [editando, setEditando] = useState<Deuda | "nueva" | null>(null);
  const [detalle, setDetalle] = useState<Deuda | null>(null);
  const [eliminar, setEliminar] = useState<Deuda | null>(null);

  const datos = useQuery({
    queryKey: ["deudas"],
    enabled: permitido,
    queryFn: async () => {
      const [d, r, c] = await Promise.all([
        supabase.from("deuda").select("*").eq("anulado", false).order("creado_en", { ascending: false }),
        supabase.from("deuda_resumen").select("*"),
        supabase
          .from("comision")
          .select("id, tipo, monto, estado, modalidad, mes, vendedor:encargado_id(nombre, apodo)")
          .eq("anulado", false)
          .or("and(modalidad.eq.historica,estado.eq.pendiente),and(tipo.eq.incentivo,estado.eq.por_pagar)"),
      ]);
      if (d.error) throw d.error;
      if (r.error) throw r.error;
      if (c.error) throw c.error;
      return { deudas: d.data, resumen: r.data, comisiones: c.data };
    },
  });

  const filas: Fila[] = useMemo(() => {
    if (!datos.data) return [];
    const res = new Map(datos.data.resumen.map((r) => [r.deuda_id, r]));
    const propias: Fila[] = datos.data.deudas.map((d) => {
      const r = res.get(d.id);
      return {
        key: d.id,
        tipo: d.tipo,
        acreedor: d.acreedor,
        concepto: d.subtipo ? `${d.subtipo} · ${d.concepto}` : d.concepto,
        total: Number(d.monto_total),
        abonado: Number(r?.abonado ?? 0),
        saldo: Number(r?.saldo ?? d.monto_total),
        vencimiento: d.fecha_vencimiento,
        estado: r?.estado ?? "pendiente",
        deuda: d,
      };
    });
    const autos: Fila[] = datos.data.comisiones.map((c) => {
      const v = c.vendedor as { nombre: string; apodo: string | null } | null;
      return {
        key: "c" + c.id,
        tipo: "comisiones",
        acreedor: v ? v.apodo || v.nombre : "—",
        concepto: c.tipo === "incentivo" ? "Incentivo por pagar" : "Comisión histórica pendiente",
        total: Number(c.monto),
        abonado: 0,
        saldo: Number(c.monto),
        vencimiento: null,
        estado: "pendiente",
        auto: true,
      };
    });
    return [...propias, ...autos];
  }, [datos.data]);

  const acreedores = useMemo(() => [...new Set(filas.map((f) => f.acreedor))].sort(), [filas]);
  const hoy = hoyLima();
  const en7 = sumarDias(hoy, 7);

  const visiblesBase = filas.filter((f) => {
    if (fTipo && f.tipo !== fTipo) return false;
    if (fAcr && f.acreedor !== fAcr) return false;
    if (fEst === "con_saldo" && f.saldo <= 0) return false;
    if (fEst && fEst !== "con_saldo" && fEst !== "todas" && f.estado !== fEst) return false;
    if (fDesde && (!f.vencimiento || f.vencimiento < fDesde)) return false;
    if (fHasta && (!f.vencimiento || f.vencimiento > fHasta)) return false;
    return coincide(buscar, f.acreedor, f.concepto);
  });
  const { ordenadas: visibles, orden, alternar } = useOrden(visiblesBase, {
    tipo: (f) => TIPOS[f.tipo] ?? f.tipo,
    acreedor: (f) => f.acreedor,
    concepto: (f) => f.concepto,
    total: (f) => Number(f.monto_total),
    abonado: (f) => f.abonado,
    saldo: (f) => f.saldo,
    vence: (f) => f.vencimiento,
    estado: (f) => f.estado,
  });

  const conSaldo = filas.filter((f) => f.saldo > 0);
  const total = conSaldo.reduce((a, f) => a + f.saldo, 0);
  const agrupar = (k: (f: Fila) => string) => {
    const m = new Map<string, number>();
    conSaldo.forEach((f) => m.set(k(f), (m.get(k(f)) ?? 0) + f.saldo));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["deudas"] });
    qc.invalidateQueries({ queryKey: ["deuda-abonos"] });
  };

  if (isLoading) return <AppShell titulo="Deudas"><p className="text-sm text-muted-foreground">Cargando…</p></AppShell>;
  if (!permitido) return <AppShell titulo="Deudas"><p className="text-sm text-muted-foreground">No tienes acceso a esta sección.</p></AppShell>;

  return (
    <AppShell
      titulo="Deudas"
      descripcion="Lo que la empresa tiene pendiente de pagar. Cada abono se registra como gasto."
      acciones={admin ? <Button onClick={() => setEditando("nueva")}><Plus className="mr-1 h-4 w-4" />Nueva deuda</Button> : null}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total adeudado</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{soles(total)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Por tipo</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {agrupar((f) => f.tipo).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span>{TIPOS[k]}</span><span>{soles(v)}</span></div>
            ))}
            {conSaldo.length === 0 ? <p className="text-muted-foreground">Sin deudas.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Por acreedor</CardTitle></CardHeader>
          <CardContent className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {agrupar((f) => f.acreedor).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span>{k}</span><span>{soles(v)}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="space-y-1"><Label>Buscar</Label><Input placeholder="Acreedor o concepto" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></div>
        <div className="space-y-1"><Label>Tipo</Label>
          <select className={CLASE_SELECT} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>Acreedor</Label>
          <select className={CLASE_SELECT} value={fAcr} onChange={(e) => setFAcr(e.target.value)}>
            <option value="">Todos</option>
            {acreedores.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label>Estado</Label>
          <select className={CLASE_SELECT} value={fEst} onChange={(e) => setFEst(e.target.value)}>
            <option value="con_saldo">Con saldo</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagada_parte">Pagada en parte</option>
            <option value="pagada">Pagada</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="space-y-1"><Label>Vence desde</Label><Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} /></div>
        <div className="space-y-1"><Label>Vence hasta</Label><Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} /></div>
        <div className="flex items-end"><Button variant="outline" onClick={() => { setBuscar(""); setFTipo(""); setFAcr(""); setFEst("con_saldo"); setFDesde(""); setFHasta(""); }}>Limpiar filtros</Button></div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Mostrando <span className="num">{visibles.length}</span> de <span className="num">{filas.length}</span></p>

      <div className="mt-4 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <ColOrden clave="tipo" orden={orden} onOrden={alternar}>Tipo</ColOrden>
              <ColOrden clave="acreedor" orden={orden} onOrden={alternar}>Acreedor</ColOrden>
              <ColOrden clave="concepto" orden={orden} onOrden={alternar}>Concepto</ColOrden>
              <ColOrden clave="total" orden={orden} onOrden={alternar} className="text-right">Monto total</ColOrden>
              <ColOrden clave="abonado" orden={orden} onOrden={alternar} className="text-right">Abonado</ColOrden>
              <ColOrden clave="saldo" orden={orden} onOrden={alternar} className="text-right">Saldo</ColOrden>
              <ColOrden clave="vence" orden={orden} onOrden={alternar}>Vencimiento</ColOrden>
              <ColOrden clave="estado" orden={orden} onOrden={alternar}>Estado</ColOrden>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((f) => {
              const vencida = f.saldo > 0 && f.vencimiento && f.vencimiento < hoy;
              const porVencer = f.saldo > 0 && f.vencimiento && f.vencimiento >= hoy && f.vencimiento <= en7;
              return (
                <TableRow key={f.key} className={cn(vencida && "bg-destructive/10", porVencer && "bg-yellow-500/15")}>
                  <TableCell>{TIPOS[f.tipo]}</TableCell>
                  <TableCell>{f.acreedor}</TableCell>
                  <TableCell>{f.concepto}</TableCell>
                  <TableCell className="text-right">{soles(f.total)}</TableCell>
                  <TableCell className="text-right">{soles(f.abonado)}</TableCell>
                  <TableCell className="text-right font-medium">{soles(f.saldo)}</TableCell>
                  <TableCell className={cn(vencida && "font-medium text-destructive")}>{f.vencimiento ? fecha(f.vencimiento) : "—"}</TableCell>
                  <TableCell>{ESTADOS[f.estado]}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {f.auto ? (
                      <Link to="/comisiones" className="text-xs text-primary underline">Ver en Comisiones</Link>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setDetalle(f.deuda!)}>Detalle</Button>
                        {admin ? <Button size="sm" variant="ghost" onClick={() => setEditando(f.deuda!)}>Editar</Button> : null}
                        {admin ? <Button size="sm" variant="ghost" onClick={() => setEliminar(f.deuda!)}>Eliminar</Button> : null}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {visibles.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">{datos.isLoading ? "Cargando…" : "No hay deudas con estos filtros."}</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {editando ? <DeudaForm deuda={editando === "nueva" ? null : editando} onClose={() => setEditando(null)} onOk={refrescar} /> : null}
      {detalle ? <DetalleDeuda deuda={detalle} admin={admin} onClose={() => setDetalle(null)} onCambio={refrescar} /> : null}
      {eliminar ? (
        <DialogoMotivo
          titulo="Eliminar deuda"
          onClose={() => setEliminar(null)}
          onConfirm={async (motivo) => {
            const { error } = await supabase.from("deuda").update({ anulado: true, motivo_anulacion: motivo }).eq("id", eliminar.id);
            if (error) throw error;
            toast.success("Deuda eliminada");
            refrescar();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function DeudaForm({ deuda, onClose, onOk }: { deuda: Deuda | null; onClose: () => void; onOk: () => void }) {
  const [tipo, setTipo] = useState(deuda?.tipo ?? "proveedores");
  const [subtipo, setSubtipo] = useState(deuda?.subtipo ?? "");
  const [acreedor, setAcreedor] = useState(deuda?.acreedor ?? "");
  const [concepto, setConcepto] = useState(deuda?.concepto ?? "");
  const [monto, setMonto] = useState(deuda ? String(deuda.monto_total) : "");
  const [venc, setVenc] = useState(deuda?.fecha_vencimiento ?? "");
  const [notas, setNotas] = useState(deuda?.notas ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const documento_path = archivo ? await subirDoc(archivo) : deuda?.documento_path ?? null;
      const fila = {
        tipo,
        subtipo: tipo === "obligaciones_laborales" ? subtipo || null : null,
        acreedor,
        concepto,
        monto_total: Number(monto),
        fecha_vencimiento: venc || null,
        notas: notas || null,
        documento_path,
      };
      const { error } = deuda
        ? await supabase.from("deuda").update(fila).eq("id", deuda.id)
        : await supabase.from("deuda").insert(fila);
      if (error) throw error;
      toast.success("Deuda guardada");
      onOk();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{deuda ? "Editar deuda" : "Nueva deuda"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Tipo</Label>
              <select className={CLASE_SELECT} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {Object.entries(TIPOS).filter(([k]) => k !== "comisiones").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {tipo === "obligaciones_laborales" ? (
              <div className="space-y-1"><Label>Subtipo</Label>
                <select className={CLASE_SELECT} value={subtipo} onChange={(e) => setSubtipo(e.target.value)}>
                  <option value="">Elige…</option>
                  {SUBTIPOS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
          </div>
          <div className="space-y-1"><Label>Acreedor</Label><Input value={acreedor} onChange={(e) => setAcreedor(e.target.value)} placeholder="A quién se le debe" /></div>
          <div className="space-y-1"><Label>Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Monto total (S/)</Label><Input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
            <div className="space-y-1"><Label>Vencimiento (opcional)</Label><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Documento (foto o PDF, máx. 10 MB)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            {deuda?.documento_path && !archivo ? <p className="text-xs text-muted-foreground">Ya tiene documento; sube otro para reemplazarlo.</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalleDeuda({ deuda, admin, onClose, onCambio }: { deuda: Deuda; admin: boolean; onClose: () => void; onCambio: () => void }) {
  const [abonar, setAbonar] = useState(false);
  const [anular, setAnular] = useState<Abono | null>(null);
  const abonos = useQuery({
    queryKey: ["deuda-abonos", deuda.id],
    queryFn: async () => {
      const [a, r] = await Promise.all([
        supabase.from("deuda_abono").select("*").eq("deuda_id", deuda.id).order("fecha", { ascending: false }),
        supabase.from("deuda_resumen").select("*").eq("deuda_id", deuda.id).maybeSingle(),
      ]);
      if (a.error) throw a.error;
      if (r.error) throw r.error;
      return { abonos: a.data, resumen: r.data };
    },
  });
  const saldo = Number(abonos.data?.resumen?.saldo ?? deuda.monto_total);
  const abrir = (p: string) => abrirComprobante(p).catch((e) => toast.error(e.message));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{deuda.acreedor} — {deuda.concepto}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div><p className="text-muted-foreground">Tipo</p><p>{TIPOS[deuda.tipo]}{deuda.subtipo ? ` · ${deuda.subtipo}` : ""}</p></div>
          <div><p className="text-muted-foreground">Monto total</p><p>{soles(deuda.monto_total)}</p></div>
          <div><p className="text-muted-foreground">Abonado</p><p>{soles(abonos.data?.resumen?.abonado ?? 0)}</p></div>
          <div><p className="text-muted-foreground">Saldo</p><p className="font-semibold">{soles(saldo)}</p></div>
        </div>
        {deuda.notas ? <p className="text-sm text-muted-foreground">{deuda.notas}</p> : null}
        <div className="flex gap-2">
          {deuda.documento_path ? <Button size="sm" variant="outline" onClick={() => abrir(deuda.documento_path!)}><Paperclip className="mr-1 h-4 w-4" />Documento</Button> : null}
          {admin && saldo > 0 ? <Button size="sm" onClick={() => setAbonar(true)}><Plus className="mr-1 h-4 w-4" />Registrar abono</Button> : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Fecha</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Método</TableHead><TableHead>Notas</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {(abonos.data?.abonos ?? []).map((a) => (
              <TableRow key={a.id} className={cn(a.anulado && "text-muted-foreground line-through")}>
                <TableCell>{fecha(a.fecha)}</TableCell>
                <TableCell className="text-right">{soles(a.monto)}</TableCell>
                <TableCell>{etiquetaMetodo(a.metodo)}{a.numero_operacion ? ` · ${a.numero_operacion}` : ""}</TableCell>
                <TableCell>{a.notas}</TableCell>
                <TableCell className="no-underline">{a.anulado ? `Anulado: ${a.motivo_anulacion ?? ""}` : "Vigente"}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {a.comprobante_path ? <Button size="sm" variant="ghost" onClick={() => abrir(a.comprobante_path!)}><Paperclip className="h-4 w-4" /></Button> : null}
                  {a.gasto_id ? <Link to="/gastos" className="px-2 text-xs text-primary underline">Gasto</Link> : null}
                  {admin && !a.anulado ? <Button size="sm" variant="ghost" onClick={() => setAnular(a)}>Anular</Button> : null}
                </TableCell>
              </TableRow>
            ))}
            {abonos.data?.abonos.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Sin abonos.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        {abonar ? <AbonoForm deudaId={deuda.id} saldo={saldo} onClose={() => setAbonar(false)} onOk={onCambio} /> : null}
        {anular ? (
          <DialogoMotivo
            titulo="Anular abono"
            onClose={() => setAnular(null)}
            onConfirm={async (motivo) => {
              const { error } = await supabase.from("deuda_abono").update({ anulado: true, motivo_anulacion: motivo }).eq("id", anular.id);
              if (error) throw error;
              toast.success("Abono anulado; su gasto también se anuló");
              onCambio();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AbonoForm({ deudaId, saldo, onClose, onOk }: { deudaId: string; saldo: number; onClose: () => void; onOk: () => void }) {
  const [fechaA, setFechaA] = useState(hoyLima());
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("transferencia");
  const [operacion, setOperacion] = useState("");
  const [notas, setNotas] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const comprobante_path = archivo ? await subirDoc(archivo) : null;
      const { error } = await supabase.from("deuda_abono").insert({
        deuda_id: deudaId, fecha: fechaA, monto: Number(monto), metodo,
        numero_operacion: operacion || null, notas: notas || null, comprobante_path,
      });
      if (error) throw error;
      toast.success("Abono registrado y agregado a Gastos");
      onOk();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar abono</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Saldo pendiente: {soles(saldo)}</p>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Fecha</Label><Input type="date" max={hoyLima()} value={fechaA} onChange={(e) => setFechaA(e.target.value)} /></div>
            <div className="space-y-1"><Label>Monto (S/)</Label><Input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
          </div>
          <CamposMetodo metodo={metodo} operacion={operacion} onMetodo={setMetodo} onOperacion={setOperacion} />
          <div className="space-y-1"><Label>Comprobante (opcional, máx. 10 MB)</Label><Input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-1"><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMotivo({ titulo, onClose, onConfirm }: { titulo: string; onClose: () => void; onConfirm: (m: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState("");
  const [ok, setOk] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-1"><Label>Motivo (obligatorio)</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!motivo.trim() || ok}
            onClick={async () => {
              setOk(true);
              try { await onConfirm(motivo.trim()); onClose(); } catch (e) { toast.error((e as Error).message); setOk(false); }
            }}
          >Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
