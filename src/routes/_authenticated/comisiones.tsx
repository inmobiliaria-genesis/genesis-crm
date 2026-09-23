import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { FORMAS_PAGO } from "@/lib/ventas";
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

const ESTADOS = ["pendiente", "retenido", "por_pagar", "pagada", "perdida", "anulada"] as const;
const ETQ_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  retenido: "Retenido",
  por_pagar: "Por pagar",
  pagada: "Pagada",
  perdida: "Perdida",
  anulada: "Anulada",
};
const ETQ_TIPO: Record<string, string> = { comision: "Comisión", incentivo: "Incentivo", manual: "Manual" };
const TODOS = "__todos";

function mesDe(c: { mes: string | null; fecha_generada: string; venta?: { fecha_firma: string | null } | null }) {
  return (c.mes ?? c.venta?.fecha_firma ?? c.fecha_generada).slice(0, 7);
}

function ComisionesPage() {
  const { data: perfil, isLoading } = usePerfil();
  const admin = perfil?.rol === "admin";
  const puedeVer = perfil && perfil.rol !== "cobranza" && perfil.rol !== "socio";
  const qc = useQueryClient();
  const vendedores = useVendedores();
  const [fEnc, setFEnc] = useState(TODOS);
  const [fTipo, setFTipo] = useState(TODOS);
  const [fEstado, setFEstado] = useState(TODOS);
  const [fMes, setFMes] = useState("");
  const [pagando, setPagando] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<{ id: string; estado: "anulada" | "perdida" } | null>(null);
  const [manual, setManual] = useState(false);
  const [mesRecalc, setMesRecalc] = useState(hoyLima().slice(0, 7));

  const comisiones = useQuery({
    queryKey: ["comisiones"],
    enabled: !!puedeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comision")
        .select(
          "*, encargado:encargado_id(nombre, apodo, estado), venta:venta_id(fecha_firma, anulado, lote:lote_id(numero, manzana:manzana_id(letra)))",
        )
        .order("fecha_generada", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
        .select("id, fecha_firma, encargado:vendedor!venta_encargado_id_fkey(nombre, apodo, estado), lote:lote_id(numero, manzana:manzana_id(letra))")
        .eq("es_historica", true)
        .eq("anulado", false)
        .gte("fecha_firma", ini)
        .lt("fecha_firma", fin)
        .order("fecha_firma");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtradas = useMemo(
    () =>
      (comisiones.data ?? []).filter(
        (c) =>
          (fEnc === TODOS || c.encargado_id === fEnc) &&
          (fTipo === TODOS || c.tipo === fTipo) &&
          (fEstado === TODOS || c.estado === fEstado) &&
          (!fMes || mesDe(c) === fMes),
      ),
    [comisiones.data, fEnc, fTipo, fEstado, fMes],
  );
  const totales = useMemo(() => {
    const t: Record<string, number> = {};
    filtradas.forEach((c) => (t[c.estado] = (t[c.estado] ?? 0) + Number(c.monto)));
    return t;
  }, [filtradas]);

  const encargados = (vendedores.data ?? []).filter((v) => v.tipo === "encargado");
  const nombreEnc = (id: string) => nombreVendedor(encargados.find((e) => e.id === id));

  async function recalcular() {
    const { error } = await supabase.rpc("recalcular_mes", { _mes: `${mesRecalc}-01` });
    if (error) return toast.error("No se pudo recalcular", { description: error.message });
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
      titulo="Comisiones"
      descripcion="Comisiones e incentivos de encargados"
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
              <CardTitle className="text-base">Ventas firmadas este mes aún marcadas como históricas</CardTitle>
            </CardHeader>
            <CardContent>
              {(historicas.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas en esta situación.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lote</TableHead>
                      <TableHead>Firma</TableHead>
                      <TableHead>Encargado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historicas.data ?? []).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>Mz {v.lote?.manzana?.letra} · Lote {v.lote?.numero}</TableCell>
                        <TableCell>{fecha(v.fecha_firma)}</TableCell>
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
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Retenido</TableHead>
                  <TableHead className="text-right">Por pagar</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(resumen.data ?? []).map((r) => (
                  <TableRow key={r.encargado_id ?? ""}>
                    <TableCell>{nombreEnc(r.encargado_id ?? "")}</TableCell>
                    <TableCell className="num text-right">{soles(r.pendiente)}</TableCell>
                    <TableCell className="num text-right">{soles(r.retenido)}</TableCell>
                    <TableCell className="num text-right">{soles(r.por_pagar)}</TableCell>
                    <TableCell className="num text-right">{soles(r.pagado)}</TableCell>
                  </TableRow>
                ))}
                {(resumen.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">Sin comisiones.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-end gap-3">
          <Filtro label="Encargado" valor={fEnc} onChange={setFEnc}
            opciones={encargados.map((e) => [e.id, nombreVendedor(e)])} />
          <Filtro label="Tipo" valor={fTipo} onChange={setFTipo} opciones={Object.entries(ETQ_TIPO)} />
          <Filtro label="Estado" valor={fEstado} onChange={setFEstado} opciones={Object.entries(ETQ_ESTADO)} />
          <div className="space-y-1">
            <Label className="text-xs">Mes</Label>
            <Input type="month" className="w-40" value={fMes} onChange={(e) => setFMes(e.target.value)} />
          </div>
        </div>

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
              <TableHead>Generada</TableHead>
              <TableHead>Encargado</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Venta</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Detalle</TableHead>
              {admin ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((c) => (
              <TableRow key={c.id} className={c.estado === "anulada" ? "opacity-50" : ""}>
                <TableCell>{fecha(c.fecha_generada)}</TableCell>
                <TableCell>{nombreVendedor(c.encargado)}</TableCell>
                <TableCell>{ETQ_TIPO[c.tipo]}</TableCell>
                <TableCell>
                  {c.venta ? `Mz ${c.venta.lote?.manzana?.letra} · Lote ${c.venta.lote?.numero}` : "—"}
                </TableCell>
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
                  {c.fecha_pago ? `Pagada ${fecha(c.fecha_pago)} (${c.forma_pago ?? "—"}). ` : ""}
                  {c.motivo_anulacion ?? c.motivo_estado ?? ""} {c.observacion ?? ""}
                </TableCell>
                {admin ? (
                  <TableCell className="space-x-1 whitespace-nowrap text-right">
                    {c.estado === "pendiente" || c.estado === "por_pagar" ? (
                      <Button size="sm" variant="outline" onClick={() => setPagando(c.id)}>Marcar como pagada</Button>
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
                <TableCell colSpan={8} className="text-center text-muted-foreground">Sin resultados.</TableCell>
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
  const [forma, setForma] = useState<string>("efectivo");
  const [obs, setObs] = useState("");
  async function guardar() {
    const { error } = await supabase.from("comision")
      .update({ estado: "pagada", fecha_pago: f, forma_pago: forma, observacion: obs.trim() || null })
      .eq("id", id);
    if (error) return toast.error("No se pudo registrar", { description: error.message });
    toast.success("Comisión pagada");
    qc.invalidateQueries();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar como pagada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Fecha de pago</Label>
            <Input type="date" max={hoyLima()} value={f} onChange={(e) => setF(e.target.value)} /></div>
          <div className="space-y-1"><Label>Forma de pago</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMAS_PAGO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Observación</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={guardar} disabled={!f}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMotivo({ id, estado, onCerrar }: { id: string; estado: "anulada" | "perdida"; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  async function guardar() {
    const cambios = estado === "anulada"
      ? { estado, anulado: true, motivo_anulacion: motivo.trim() }
      : { estado, motivo_estado: motivo.trim() };
    const { error } = await supabase.from("comision").update(cambios).eq("id", id);
    if (error) return toast.error("No se pudo guardar", { description: error.message });
    toast.success(estado === "anulada" ? "Anulada" : "Marcada como perdida");
    qc.invalidateQueries();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{estado === "anulada" ? "Anular comisión" : "Marcar incentivo como perdido"}</DialogTitle></DialogHeader>
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
    if (error) return toast.error("No se pudo registrar", { description: error.message });
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
