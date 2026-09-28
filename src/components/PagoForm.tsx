import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { fecha, hoyLima, soles, cantidad } from "@/lib/format";
import { METODOS_PAGO, ETIQUETA_METODO, useCuotasDeVenta } from "@/lib/cobranza";
import { CamposMetodo } from "@/components/MetodoPago";

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export function DialogoPago({
  ventaId,
  cuotaInicial,
  onCerrar,
}: {
  ventaId: string;
  cuotaInicial?: string | null;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const cuotas = useCuotasDeVenta(ventaId);
  const [fechaPago, setFechaPago] = useState(hoyLima());
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<string>("");
  const [operacion, setOperacion] = useState("");
  const [notas, setNotas] = useState("");
  const [manual, setManual] = useState(false);
  const [aplicaciones, setAplicaciones] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const pendientes = useMemo(
    () => (cuotas.data ?? []).filter((c) => c.saldo > 0.005),
    [cuotas.data],
  );

  const montoNum = Number(monto || 0);

  // Sugerencia automática: cubre primero la cuota más antigua sin pagar.
  useEffect(() => {
    if (manual) return;
    let restante = redondear(montoNum);
    const orden = cuotaInicial
      ? [...pendientes].sort((a, b) =>
          a.id === cuotaInicial ? -1 : b.id === cuotaInicial ? 1 : a.numero - b.numero,
        )
      : pendientes;
    const nuevo: Record<string, string> = {};
    for (const c of orden) {
      if (restante <= 0.005) break;
      const aplicar = redondear(Math.min(restante, c.saldo));
      nuevo[c.id] = String(aplicar);
      restante = redondear(restante - aplicar);
    }
    setAplicaciones(nuevo);
  }, [montoNum, pendientes, manual, cuotaInicial]);

  const totalAplicado = redondear(
    Object.values(aplicaciones).reduce((t, v) => t + Number(v || 0), 0),
  );
  const sinAsignar = redondear(montoNum - totalAplicado);

  async function guardar() {
    if (montoNum <= 0) {
      toast.error("Indica un monto mayor a cero");
      return;
    }
    if (!metodo) {
      toast.error("Elige el método de pago");
      return;
    }
    const detalle = Object.entries(aplicaciones)
      .map(([cuota_id, v]) => ({ cuota_id, monto_aplicado: Number(v || 0) }))
      .filter((d) => d.monto_aplicado > 0);
    if (detalle.length === 0) {
      toast.error("Elige a qué cuota se aplica el pago");
      return;
    }
    if (totalAplicado > montoNum + 0.005) {
      toast.error("Lo aplicado supera el monto del pago");
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase
      .from("pago")
      .insert({
        venta_id: ventaId,
        fecha: fechaPago,
        monto: montoNum,
        metodo,
        numero_operacion: operacion.trim() || null,
        notas: notas.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setGuardando(false);
      toast.error("No se pudo registrar el pago", { description: error?.message });
      return;
    }
    const { error: e2 } = await supabase
      .from("pago_aplicacion")
      .insert(detalle.map((d) => ({ ...d, pago_id: data.id })));
    setGuardando(false);
    if (e2) {
      await supabase
        .from("pago")
        .update({ anulado: true, motivo_anulacion: "Aplicación a cuotas rechazada" })
        .eq("id", data.id);
      toast.error("No se pudo aplicar el pago a las cuotas", { description: e2.message });
      qc.invalidateQueries();
      return;
    }
    toast.success("Pago registrado");
    qc.invalidateQueries();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              inputMode="decimal"
              value={monto}
              onChange={(e) => {
                setManual(false);
                setMonto(e.target.value);
              }}
            />
          </div>
          <CamposMetodo metodo={metodo} operacion={operacion} onMetodo={setMetodo} onOperacion={setOperacion} />
          <div className="sm:col-span-2">
            <Label>Notas (opcional)</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Aplicar a cuotas</p>
              {manual ? (
                <Button size="sm" variant="ghost" onClick={() => setManual(false)}>
                  Volver a la sugerencia
                </Button>
              ) : null}
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Aplicar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        Esta venta no tiene cuotas pendientes.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {pendientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="num">
                        {c.numero === 0 ? "Inicial" : c.numero}{" "}
                        {c.vencida ? <Badge variant="destructive">Vencida</Badge> : null}
                      </TableCell>
                      <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
                      <TableCell className="num text-right">{soles(c.saldo)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto w-28 text-right"
                          inputMode="decimal"
                          value={aplicaciones[c.id] ?? ""}
                          onChange={(e) => {
                            setManual(true);
                            setAplicaciones((a) => ({ ...a, [c.id]: e.target.value }));
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Aplicado: <span className="num">{soles(totalAplicado)}</span> · Sin asignar:{" "}
              <span className="num">{soles(sinAsignar)}</span>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            Guardar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoRegularizar({
  ventaId,
  fechaVenta,
  onCerrar,
}: {
  ventaId: string;
  fechaVenta: string;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const cuotas = useCuotasDeVenta(ventaId);
  const hoy = hoyLima();
  const [modo, setModo] = useState<"unico" | "por_cuota">("unico");
  const [fechaPago, setFechaPago] = useState(hoy);
  const [metodo, setMetodo] = useState<string>("no_registrado");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const pendientes = (cuotas.data ?? []).filter((c) => c.saldo > 0.005);
  const total = redondear(pendientes.reduce((t, c) => t + c.saldo, 0));
  const vista =
    modo === "unico"
      ? [{ fecha: fechaPago, monto: total, detalle: cantidad(pendientes.length, "cuotas") }]
      : pendientes.map((c) => ({
          fecha: c.fecha_vencimiento > hoy ? hoy : c.fecha_vencimiento,
          monto: c.saldo,
          detalle: c.numero === 0 ? "Inicial" : `Cuota ${c.numero}`,
        }));

  async function confirmar() {
    setGuardando(true);
    const { error } = await (supabase.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("regularizar_venta", {
      _venta_id: ventaId,
      _modo: modo,
      _fecha: modo === "unico" ? fechaPago : null,
      _metodo: metodo === "no_registrado" ? null : metodo,
      _notas: notas.trim() || null,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo marcar como pagada", { description: error.message });
      return;
    }
    toast.success("Venta marcada como pagada");
    qc.invalidateQueries();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marcar como pagada</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Saldo pendiente: <span className="num font-semibold">{soles(total)}</span> · Se cubrirán{" "}
          {cantidad(pendientes.length, "cuotas")}
          {pendientes.some((c) => c.numero === 0) ? " (incluida la inicial)" : ""}.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Modo</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as "unico" | "por_cuota")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unico">Un solo pago de regularización</SelectItem>
                <SelectItem value="por_cuota">Cada cuota en su vencimiento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modo === "unico" ? (
            <div>
              <Label>Fecha del pago</Label>
              <Input
                type="date"
                min={fechaVenta}
                max={hoy}
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
              />
            </div>
          ) : null}
          <div>
            <Label>Forma de pago</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_registrado">No registrada</SelectItem>
                {METODOS_PAGO.map((m) => (
                  <SelectItem key={m} value={m}>
                    {ETIQUETA_METODO[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Observación (opcional)</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <p className="text-sm font-medium">Pagos que se crearán ({vista.length})</p>
        <div className="max-h-56 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cubre</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vista.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{fecha(p.fecha)}</TableCell>
                  <TableCell>{p.detalle}</TableCell>
                  <TableCell className="num text-right">{soles(p.monto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={guardando || pendientes.length === 0}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
