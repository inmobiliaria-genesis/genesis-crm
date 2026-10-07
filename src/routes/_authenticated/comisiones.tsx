import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarraFiltros, ColOrden, FiltroMulti, enLista, useOrden } from "@/components/ListaControles";
import { toast } from "sonner";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePerfil } from "@/lib/sesion";
import { fecha, hoyLima, soles } from "@/lib/format";
import { nombreVendedor, useVendedores } from "@/lib/vendedores";
import { CamposMetodo } from "@/components/MetodoPago";
import { etiquetaMetodo, llevaOperacion } from "@/lib/cobranza";
import { subirComprobante } from "@/lib/gastos";
import { BotonHistorica } from "@/components/DialogoHistorica";

export const Route = createFileRoute("/_authenticated/comisiones")({
  head: () => ({
    meta: [
      { title: "Comisiones — Gestión de lotes" },
      { name: "description", content: "Comisiones e incentivos de encargados." },
      { property: "og:title", content: "Comisiones — Gestión de lotes" },
      { property: "og:description", content: "Comisiones e incentivos de encargados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComisionesPage,
});

const ESTADOS = ["pendiente_cobro_vendedor", "cobrada_vendedor", "pendiente", "retenido", "por_pagar", "pagada", "pagada_antes_crm", "perdida", "anulada"] as const;
const ETQ_ESTADO: Record<string, string> = {
  pendiente_cobro_vendedor: "Pendiente de cobro por el vendedor",
  cobrada_vendedor: "Cobrada por el vendedor",
  pagada_antes_crm: "Pagada antes del CRM",
  pendiente: "Pendiente",
  retenido: "Retenido",
  por_pagar: "Por pagar",
  pagada: "Pagada",
  perdida: "Perdida",
  anulada: "Anulada",
};
const ETQ_TIPO: Record<string, string> = { comision: "Comisión", incentivo: "Incentivo", manual: "Manual" };
const TODOS = "__todos";

function tipoDe(c: { tipo: string; modalidad?: string | null }) {
  if (c.tipo === "comision") return c.modalidad === "historica" ? "Comisión histórica" : "Comisión (cobra el vendedor)";
  return ETQ_TIPO[c.tipo] ?? c.tipo;
}
/** Comisiones que paga la empresa y admin puede marcar como pagadas. */
function sePuedePagar(c: { tipo: string; modalidad?: string | null; estado: string }) {
  if (c.tipo === "incentivo") return c.estado === "por_pagar";
  if (c.tipo === "manual") return c.estado === "pendiente";
  return c.modalidad === "historica" && c.estado === "pendiente";
}

function mesDe(c: { mes: string | null; fecha_generada: string; venta?: { fecha_venta: string | null } | null }) {
  return (c.mes ?? c.venta?.fecha_venta ?? c.fecha_generada).slice(0, 7);
}

function ComisionesPage() {
  const { data: perfil, isLoading } = usePerfil();
  const admin = perfil?.rol === "admin";
  const puedeVer = !!perfil;
  const qc = useQueryClient();
  const vendedores = useVendedores();
  const [fEnc, setFEnc] = useState<string[]>([]);
  const [fTipo, setFTipo] = useState<string[]>([]);
  const [fEstado, setFEstado] = useState<string[]>([]);
  const [fMes, setFMes] = useState("");
  const [pagando, setPagando] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<{ id: string; estado: "anulada" | "perdida" | "pendiente" | "por_pagar" } | null>(null);
  const [manual, setManual] = useState(false);
  const [mesRecalc, setMesRecalc] = useState(hoyLima().slice(0, 7));

  const comisiones = useQuery({
    queryKey: ["comisiones"],
    enabled: !!puedeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comision")
        .select(
          "*, encargado:encargado_id(nombre, apodo, estado), venta:venta_id(fecha_venta, anulado, lote:lote_id(numero, manzana:manzana_id(letra)))",
        )
        .order("fecha_generada", { ascending: false });
      if (error) throw error;
      const filas = data ?? [];
      // El asesor no lee la tabla de lotes: completamos manzana y número con la función segura
      const faltan = filas.filter((c) => c.venta && !c.venta.lote && c.venta_id).map((c) => c.venta_id!);
      if (faltan.length) {
        const { data: vs } = await supabase.from("venta").select("id, lote_id").in("id", faltan);
        const rpc = supabase.rpc.bind(supabase);
        const { data: et } = await rpc("etiquetas_lote" as never, { _ids: (vs ?? []).map((v) => v.lote_id) } as never);
        const porLote = new Map(((et ?? []) as unknown as { id: string; manzana: string; numero: number }[]).map((e) => [e.id, e]));
        const porVenta = new Map((vs ?? []).map((v) => [v.id, porLote.get(v.lote_id)]));
        for (const c of filas) {
          const e = c.venta_id ? porVenta.get(c.venta_id) : undefined;
          if (c.venta && !c.venta.lote && e) (c.venta as { lote: unknown }).lote = { numero: e.numero, manzana: { letra: e.manzana } };
        }
      }
      return filas;
    },
  });

  const resumen = useQuery({
    queryKey: ["comision-resumen"],
    enabled: !!puedeVer,
    queryFn: async () => {
      const { data, error } = await supabase.from("comision_resumen").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const hoy = hoyLima();
  const historicas = useQuery({
    queryKey: ["ventas-historicas-mes", hoy.slice(0, 7)],
    enabled: !!admin,
    queryFn: async () => {
      const ini = `${hoy.slice(0, 7)}-01`;
      const [y, m] = hoy.slice(0, 7).split("-").map(Number);
      const fin = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("venta")
        .select("id, fecha_venta, encargado:vendedor!venta_encargado_id_fkey(nombre, apodo, estado), lote:lote_id(numero, manzana:manzana_id(letra))")
        .eq("es_historica", true)
        .eq("anulado", false)
        .gte("fecha_venta", ini)
        .lt("fecha_venta", fin)
        .order("fecha_venta");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtradas = useMemo(
    () =>
      (comisiones.data ?? []).filter(
        (c) =>
          enLista(c.encargado_id, fEnc) &&
          enLista(c.tipo, fTipo) &&
          enLista(c.estado, fEstado) &&
          (!fMes || mesDe(c) === fMes),
      ),
    [comisiones.data, fEnc, fTipo, fEstado, fMes],
  );
  const { ordenadas, orden, alternar } = useOrden(filtradas, {
    generada: (c) => c.fecha_generada,
    encargado: (c) => nombreVendedor(c.encargado),
    tipo: (c) => tipoDe(c as { tipo: string; modalidad?: string | null }),
    venta: (c) => (c.venta?.lote ? `${c.venta.lote.manzana?.letra ?? ""}-${String(c.venta.lote.numero).padStart(5, "0")}` : null),
    mes: (c) => mesDe(c),
    monto: (c) => Number(c.monto),
    estado: (c) => ETQ_ESTADO[c.estado] ?? c.estado,
  });
  const totales = useMemo(() => {
    const t: Record<string, number> = {};
    filtradas.forEach((c) => (t[c.estado] = (t[c.estado] ?? 0) + Number(c.monto)));
    return t;
  }, [filtradas]);

  const encargados = (vendedores.data ?? []).filter((v) => v.tipo === "encargado");
  const nombreEnc = (id: string) => nombreVendedor(encargados.find((e) => e.id === id));

  async function recalcular() {
    const { error } = await supabase.rpc("recalcular_mes", { _mes: `${mesRecalc}-01` });
    if (error) { toast.error("No se pudo recalcular", { description: error.message }); return; }
    toast.success("Mes recalculado");
    qc.invalidateQueries();
  }

  if (!isLoading && !puedeVer) {
    return (
      <AppShell titulo="Comisiones">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo={perfil?.rol === "asesor" ? "Mis comisiones" : "Comisiones"}
      descripcion={perfil?.rol === "asesor" ? "Tus comisiones e incentivos" : "Comisiones e incentivos de encargados"}
      acciones={
        admin ? (
          <>
            <Input type="month" className="w-40" value={mesRecalc} onChange={(e) => setMesRecalc(e.target.value)} />
            <Button size="sm" variant="outline" onClick={recalcular}>
              <RefreshCw className="mr-1 h-4 w-4" /> Recalcular mes
            </Button>
            <Button size="sm" onClick={() => setManual(true)}>
              <Plus className="mr-1 h-4 w-4" /> Comisión manual
            </Button>
          </>
        ) : null
      }
    >
      <div className="space-y-6">
        {admin ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas de este mes aún marcadas como históricas</CardTitle>
            </CardHeader>
            <CardContent>
              {(historicas.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas en esta situación.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lote</TableHead>
                      <TableHead>Fecha de venta</TableHead>
                      <ColOrden clave="encargado" orden={orden} onOrden={alternar}>Encargado</ColOrden>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historicas.data ?? []).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>Mz {v.lote?.manzana?.letra} · Lote {v.lote?.numero}</TableCell>
                        <TableCell>{fecha(v.fecha_venta)}</TableCell>
                        <TableCell>{nombreVendedor(v.encargado)}</TableCell>
                        <TableCell className="text-right">
                          <BotonHistorica ventaId={v.id} esHistorica />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen por encargado</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Encargado</TableHead>
                  <TableHead className="text-right">Por cobrar del cliente</TableHead>
                  <TableHead className="text-right">Cobrada por el vendedor</TableHead>
                  <TableHead className="text-right">Deuda pendiente</TableHead>
                  <TableHead className="text-right">Retenido</TableHead>
                  <TableHead className="text-right">Por pagar</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(resumen.data ?? []).map((r) => (
                  <TableRow key={r.encargado_id ?? ""}>
                    <TableCell>{nombreEnc(r.encargado_id ?? "")}</TableCell>
                    <TableCell className="num text-right">{soles((r as { pendiente_cobro?: number }).pendiente_cobro ?? 0)}</TableCell>
                    <TableCell className="num text-right">{soles((r as { cobrada_vendedor?: number }).cobrada_vendedor ?? 0)}</TableCell>
                    <TableCell className="num text-right">{soles(r.pendiente)}</TableCell>
                    <TableCell className="num text-right">{soles(r.retenido)}</TableCell>
                    <TableCell className="num text-right">{soles(r.por_pagar)}</TableCell>
                    <TableCell className="num text-right">{soles(r.pagado)}</TableCell>
                  </TableRow>
                ))}
                {(resumen.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">Sin comisiones.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <BarraFiltros
          onLimpiar={() => { setFEnc([]); setFTipo([]); setFEstado([]); setFMes(""); }}
          mostrando={filtradas.length}
          total={comisiones.data?.length ?? 0}
        >
          <FiltroMulti label="Encargado" opciones={encargados.map((e) => ({ valor: e.id, etiqueta: nombreVendedor(e) }))} valor={fEnc} onCambio={setFEnc} />
          <FiltroMulti label="Tipo" opciones={Object.entries(ETQ_TIPO).map(([k, v]) => ({ valor: k, etiqueta: v }))} valor={fTipo} onCambio={setFTipo} />
          <FiltroMulti label="Estado" opciones={Object.entries(ETQ_ESTADO).map(([k, v]) => ({ valor: k, etiqueta: v }))} valor={fEstado} onCambio={setFEstado} />
          <div className="space-y-1">
            <Label>Mes</Label>
            <Input type="month" value={fMes} onChange={(e) => setFMes(e.target.value)} />
          </div>
        </BarraFiltros>

        <div className="flex flex-wrap gap-2">
          {ESTADOS.map((e) => (
            <Badge key={e} variant="outline" className="num">
              {ETQ_ESTADO[e]}: {soles(totales[e] ?? 0)}
            </Badge>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <ColOrden clave="generada" orden={orden} onOrden={alternar}>Generada</ColOrden>
              <TableHead>Encargado</TableHead>
              <ColOrden clave="tipo" orden={orden} onOrden={alternar}>Tipo</ColOrden>
              <ColOrden clave="venta" orden={orden} onOrden={alternar}>Venta</ColOrden>
              <ColOrden clave="mes" orden={orden} onOrden={alternar}>Mes</ColOrden>
              <ColOrden clave="monto" orden={orden} onOrden={alternar} className="text-right">Monto</ColOrden>
              <ColOrden clave="estado" orden={orden} onOrden={alternar}>Estado</ColOrden>
              <TableHead>Detalle</TableHead>
              {admin ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((c) => (
              <TableRow key={c.id} className={c.estado === "anulada" ? "opacity-50" : ""}>
                <TableCell>{fecha(c.fecha_generada)}</TableCell>
                <TableCell>{nombreVendedor(c.encargado)}</TableCell>
                <TableCell>{tipoDe(c as { tipo: string; modalidad?: string | null })}</TableCell>
                <TableCell>
                  {c.venta ? `Mz ${c.venta.lote?.manzana?.letra} · Lote ${c.venta.lote?.numero}` : "—"}
                </TableCell>
                <TableCell>{c.mes ? fecha(c.mes).slice(3) : c.venta?.fecha_venta ? fecha(c.venta.fecha_venta).slice(3) : "—"}</TableCell>
                <TableCell className="num text-right">{soles(c.monto)}</TableCell>
                <TableCell>
                  <Badge variant={c.estado === "pagada" ? "secondary" : "outline"}>{ETQ_ESTADO[c.estado]}</Badge>
                  {c.alerta_venta_anulada ? (
                    <span className="mt-1 flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" /> venta anulada después del pago
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-56 text-xs text-muted-foreground">
                  {c.fecha_pago ? `Pagada ${fecha(c.fecha_pago)} (${etiquetaMetodo(c.forma_pago)}${(c as { numero_operacion?: string | null }).numero_operacion ? ` · Op. ${(c as { numero_operacion?: string | null }).numero_operacion}` : ""}). ` : ""}
                  {c.motivo_anulacion ?? c.motivo_estado ?? ""} {c.observacion ?? ""}
                </TableCell>
                {admin ? (
                  <TableCell className="space-x-1 whitespace-nowrap text-right">
                    {sePuedePagar(c as { tipo: string; modalidad?: string | null; estado: string }) ? (
                      <Button size="sm" variant="outline" onClick={() => setPagando(c.id)}>Marcar como pagada</Button>
                    ) : null}
                    {c.estado === "pagada" ? (
                      <Button size="sm" variant="ghost" onClick={() => setCambiando({ id: c.id, estado: c.tipo === "incentivo" ? "por_pagar" : "pendiente" })}>Anular pago</Button>
                    ) : null}
                    {c.tipo === "incentivo" && (c.estado === "retenido" || c.estado === "por_pagar") ? (
                      <Button size="sm" variant="ghost" onClick={() => setCambiando({ id: c.id, estado: "perdida" })}>Perdida</Button>
                    ) : null}
                    {c.estado !== "anulada" ? (
                      <Button size="sm" variant="ghost" onClick={() => setCambiando({ id: c.id, estado: "anulada" })}>Anular</Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">Sin resultados.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {pagando ? <DialogoPagar id={pagando} onCerrar={() => setPagando(null)} /> : null}
      {cambiando ? <DialogoMotivo {...cambiando} onCerrar={() => setCambiando(null)} /> : null}
      {manual ? <DialogoManual encargados={encargados} onCerrar={() => setManual(false)} /> : null}
    </AppShell>
  );
}

function Filtro({ label, valor, onChange, opciones }: {
  label: string; valor: string; onChange: (v: string) => void; opciones: [string, string][];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opciones.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function DialogoPagar({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(hoyLima());
  const [metodo, setMetodo] = useState("");
  const [operacion, setOperacion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      const comprobante_path = archivo ? await subirComprobante(archivo) : null;
      const { error } = await supabase.from("comision")
        .update({
          estado: "pagada", fecha_pago: f, forma_pago: metodo,
          numero_operacion: llevaOperacion(metodo) ? operacion.trim() || null : null,
          comprobante_path, observacion: obs.trim() || null,
        } as never)
        .eq("id", id);
      if (error) throw error;
      toast.success("Pago registrado; se creó el gasto correspondiente");
      qc.invalidateQueries();
      onCerrar();
    } catch (e) {
      toast.error("No se pudo registrar", { description: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar como pagada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Fecha de pago</Label>
            <Input type="date" max={hoyLima()} value={f} onChange={(e) => setF(e.target.value)} /></div>
          <CamposMetodo metodo={metodo} operacion={operacion} onMetodo={setMetodo} onOperacion={setOperacion} />
          <div className="space-y-1"><Label>Comprobante (opcional)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-1"><Label>Observación</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={guardar} disabled={!f || !metodo || guardando}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMotivo({ id, estado, onCerrar }: { id: string; estado: "anulada" | "perdida" | "pendiente" | "por_pagar"; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  async function guardar() {
    const cambios = estado === "anulada"
      ? { estado, anulado: true, motivo_anulacion: motivo.trim() }
      : { estado, motivo_estado: motivo.trim() };
    const { error } = await supabase.from("comision").update(cambios).eq("id", id);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success(estado === "anulada" ? "Anulada" : estado === "perdida" ? "Marcada como perdida" : "Pago anulado");
    qc.invalidateQueries();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{estado === "anulada" ? "Anular comisión" : estado === "perdida" ? "Marcar incentivo como perdido" : "Anular el pago (su gasto también se anula)"}</DialogTitle></DialogHeader>
        <div className="space-y-1"><Label>Motivo</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="destructive" onClick={guardar} disabled={!motivo.trim()}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoManual({ encargados, onCerrar }: {
  encargados: { id: string; nombre: string; apodo: string | null; estado: string }[]; onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [enc, setEnc] = useState("");
  const [venta, setVenta] = useState(TODOS);
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const ventas = useQuery({
    queryKey: ["ventas-para-manual"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venta")
        .select("id, lote:lote_id(numero, manzana:manzana_id(letra))").eq("anulado", false);
      if (error) throw error;
      return data ?? [];
    },
  });
  async function guardar() {
    const { error } = await supabase.from("comision").insert({
      tipo: "manual", encargado_id: enc, venta_id: venta === TODOS ? null : venta,
      monto: Number(monto), observacion: obs.trim() || null,
    });
    if (error) { toast.error("No se pudo registrar", { description: error.message }); return; }
    toast.success("Comisión manual registrada");
    qc.invalidateQueries();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Comisión manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Encargado</Label>
            <Select value={enc} onValueChange={setEnc}>
              <SelectTrigger><SelectValue placeholder="Elegir" /></SelectTrigger>
              <SelectContent>{encargados.map((e) => <SelectItem key={e.id} value={e.id}>{nombreVendedor(e)}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Venta (opcional)</Label>
            <Select value={venta} onValueChange={setVenta}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Sin venta</SelectItem>
                {(ventas.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>Mz {v.lote?.manzana?.letra} · Lote {v.lote?.numero}</SelectItem>
                ))}
              </SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Monto (S/)</Label>
            <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
          <div className="space-y-1"><Label>Observación</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={guardar} disabled={!enc || !(Number(monto) > 0)}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
