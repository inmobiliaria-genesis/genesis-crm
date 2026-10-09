import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampoSoles } from "@/components/CampoSoles";
import { useCuotasDeVenta, ETIQUETA_CUOTA } from "@/lib/cobranza";
import { fecha, soles } from "@/lib/format";

export type Rpc = (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export const rpcSb = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export type FilaCuota = { fecha: string; monto: string; editado: boolean };
export type FilaVista = { numero: number; fecha_vencimiento: string; monto: number; pagado: number; saldo: number; estado: string; nueva?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function aJson(filas: FilaCuota[]) {
  return filas.map((f) => ({ fecha: f.fecha, monto: Number(f.monto || 0) }));
}

/** Tabla editable de cuotas: monto y fecha por cuota, agregar/quitar y repartir el resto. */
export function EditorCuotas({ filas, onCambio, total, etiquetaTotal }: {
  filas: FilaCuota[]; onCambio: (f: FilaCuota[]) => void; total: number; etiquetaTotal: string;
}) {
  const suma = r2(filas.reduce((t, f) => t + Number(f.monto || 0), 0));
  const dif = r2(suma - total);
  function set(i: number, cambio: Partial<FilaCuota>) {
    onCambio(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  }
  function repartir() {
    const libres = filas.map((f, i) => (f.editado ? -1 : i)).filter((i) => i >= 0);
    if (libres.length === 0) { toast.error("Todas las cuotas fueron editadas a mano"); return; }
    const fijo = filas.reduce((t, f) => t + (f.editado ? Number(f.monto || 0) : 0), 0);
    const resto = r2(total - fijo);
    if (resto <= 0) { toast.error("No queda saldo por repartir"); return; }
    const base = Math.floor((resto / libres.length) * 100) / 100;
    onCambio(filas.map((f, i) => {
      const k = libres.indexOf(i);
      if (k < 0) return f;
      return { ...f, monto: String(k === libres.length - 1 ? r2(resto - base * (libres.length - 1)) : base) };
    }));
  }
  function agregar() {
    const ult = filas[filas.length - 1]?.fecha;
    let f = "";
    if (ult) { const d = new Date(`${ult}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); f = d.toISOString().slice(0, 10); }
    onCambio([...filas, { fecha: f, monto: "", editado: false }]);
  }
  return (
    <div className="space-y-2">
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>#</TableHead><TableHead>Vencimiento</TableHead><TableHead>Monto</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f, i) => (
              <TableRow key={i}>
                <TableCell className="num">{i + 1}</TableCell>
                <TableCell><Input type="date" value={f.fecha} onChange={(e) => set(i, { fecha: e.target.value })} /></TableCell>
                <TableCell className="w-44"><CampoSoles valor={f.monto} onCambio={(v) => set(i, { monto: v, editado: true })} /></TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => onCambio(filas.filter((_, j) => j !== i))}>Quitar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={agregar}>+ Agregar cuota</Button>
        <Button size="sm" variant="outline" onClick={repartir}>Repartir el resto en partes iguales</Button>
      </div>
      <p className={`text-xs ${Math.abs(dif) > 0.005 ? "text-destructive" : "text-muted-foreground"}`}>
        Suma: <span className="num">{soles(suma)}</span> · {etiquetaTotal}: <span className="num">{soles(total)}</span>
        {Math.abs(dif) > 0.005 ? <> · Diferencia: <span className="num">{soles(dif)}</span></> : null}
      </p>
    </div>
  );
}

export function TablaVista({ filas }: { filas: FilaVista[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead><TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Pagado</TableHead><TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((c) => (
            <TableRow key={c.numero} className={c.nueva ? "bg-muted/40" : ""}>
              <TableCell className="num">{c.numero === 0 ? "Inicial" : c.numero}</TableCell>
              <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
              <TableCell className="num text-right">{soles(c.monto)}</TableCell>
              <TableCell className="num text-right">{soles(c.pagado)}</TableCell>
              <TableCell>{ETIQUETA_CUOTA[c.estado] ?? c.estado}{c.nueva ? " · nueva" : ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type Modo = "pausar" | "redistribuir" | "cambiar_dia" | "manual";

export function DialogoReprogramar({ ventaId, onCerrar }: { ventaId: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const rpc = rpcSb();
  const cuotas = useCuotasDeVenta(ventaId);
  const pendientes = (cuotas.data ?? []).filter((c) => c.numero >= 1 && c.saldo > 0.005);
  const saldo = r2(pendientes.reduce((t, c) => t + c.saldo, 0));
  const [modo, setModo] = useState<Modo>("pausar");
  const [meses, setMeses] = useState("1");
  const [n, setN] = useState("");
  const [desde, setDesde] = useState("");
  const [dia, setDia] = useState("");
  const [filas, setFilas] = useState<FilaCuota[]>([]);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (cuotas.data && filas.length === 0) {
      setFilas(pendientes.map((c) => ({ fecha: c.fecha_vencimiento, monto: String(c.saldo), editado: false })));
      setN(String(pendientes.length || 1));
      setDesde(pendientes[0]?.fecha_vencimiento ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuotas.data]);

  const params =
    modo === "pausar" ? { meses: Number(meses) } :
    modo === "redistribuir" ? { cuotas: Number(n), desde } :
    modo === "cambiar_dia" ? { dia: Number(dia) } : { cuotas: aJson(filas) };

  const vista = useQuery({
    queryKey: ["simular-reprogramacion", ventaId, modo, JSON.stringify(params)],
    enabled: pendientes.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await rpc("simular_reprogramacion", { _venta_id: ventaId, _modo: modo, _params: params });
      if (error) throw new Error(error.message);
      return data as FilaVista[];
    },
  });

  async function guardar() {
    if (!motivo.trim()) { toast.error("Indica el motivo"); return; }
    setGuardando(true);
    const { error } = await rpc("reprogramar_cronograma", { _venta_id: ventaId, _modo: modo, _params: params, _motivo: motivo.trim() });
    setGuardando(false);
    if (error) { toast.error("No se pudo reprogramar", { description: error.message }); return; }
    toast.success("Cronograma reprogramado");
    qc.invalidateQueries();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Reprogramar cronograma</DialogTitle></DialogHeader>
        <p className="text-sm">
          Saldo pendiente de cuotas: <span className="num font-semibold">{soles(saldo)}</span> en {pendientes.length} cuota(s).
          Las cuotas pagadas y los pagos registrados no cambian.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Modo</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pausar">Pausar (mover cuotas X meses)</SelectItem>
                <SelectItem value="redistribuir">Redistribuir en N cuotas iguales</SelectItem>
                <SelectItem value="cambiar_dia">Cambiar día de pago</SelectItem>
                <SelectItem value="manual">Edición manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modo === "pausar" ? (
            <div><Label>Meses</Label><Input inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value)} /></div>
          ) : null}
          {modo === "redistribuir" ? (
            <>
              <div><Label>Cantidad de cuotas</Label><Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></div>
              <div><Label>Primera cuota</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            </>
          ) : null}
          {modo === "cambiar_dia" ? (
            <div><Label>Nuevo día del mes (1–31)</Label><Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
          ) : null}
          {modo === "manual" ? (
            <div className="sm:col-span-2">
              <EditorCuotas filas={filas} onCambio={setFilas} total={saldo} etiquetaTotal="Saldo pendiente" />
            </div>
          ) : null}
        </div>
        <p className="text-sm font-medium">Vista previa del cronograma nuevo</p>
        {vista.error ? <p className="text-xs text-destructive">{(vista.error as Error).message}</p> : null}
        <TablaVista filas={vista.data ?? []} />
        <div>
          <Label>Motivo (obligatorio)</Label>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !!vista.error || pendientes.length === 0}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
