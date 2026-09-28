import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fecha, hoyLima, porcentaje, soles } from "@/lib/format";
import { usePerfil, esAdmin } from "@/lib/sesion";
import { llevaOperacion } from "@/lib/cobranza";
import { CamposMetodo, MostrarMetodo, DialogoEditarMetodo } from "@/components/MetodoPago";

export type Desistimiento = Database["public"]["Tables"]["desistimiento"]["Row"] & { monto_descontar?: number | null };

export const ETIQUETA_DESISTIMIENTO: Record<string, string> = {
  en_proceso: "En proceso",
  aceptado: "Aceptado",
  devuelto: "Devuelto",
  revertido: "Revertido",
  anulado: "Anulado",
};

/** Desistimiento vigente (no anulado) de una venta. */
export function useDesistimientoDeVenta(ventaId: string | null) {
  return useQuery({
    queryKey: ["desistimiento-venta", ventaId],
    enabled: !!ventaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desistimiento")
        .select("*")
        .eq("venta_id", ventaId!)
        .eq("anulado", false)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border py-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className={`num ${fuerte ? "font-semibold" : ""}`}>{v}</span>
    </div>
  );
}

type Calculo = {
  total_abonado: number;
  monto_descontar: number;
  porcentaje_devolucion: number;
  base_calculo: number;
  monto_devolver: number;
  monto_retiene_empresa: number;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  f: string,
  a: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function Resumen({ c }: { c: Calculo }) {
  return (
    <div className="text-sm">
      <p className="mb-2 rounded-md bg-muted p-2 text-xs">
        Se devuelve el {porcentaje(c.porcentaje_devolucion)} de lo abonado, descontando la cuota inicial.
      </p>
      <Fila k="Total abonado" v={soles(c.total_abonado)} />
      <Fila k="Monto a descontar" v={soles(c.monto_descontar)} />
      <Fila k="Base de cálculo" v={soles(c.base_calculo)} />
      <Fila k="Porcentaje de devolución" v={porcentaje(c.porcentaje_devolucion)} />
      <Fila k="Monto a devolver" v={soles(c.monto_devolver)} fuerte />
      <Fila k="Retiene la empresa" v={soles(c.monto_retiene_empresa)} />
      <p className="mt-2 text-xs text-muted-foreground">
        ({soles(c.total_abonado)} − {soles(c.monto_descontar)}) × {porcentaje(c.porcentaje_devolucion)} ={" "}
        {soles(c.monto_devolver)}
      </p>
    </div>
  );
}

export function DialogoIniciarDesistimiento({
  ventaId,
  abierto,
  onCambio,
}: {
  ventaId: string;
  abierto: boolean;
  onCambio: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const admin = esAdmin(perfil);
  const [fechaInicio, setFechaInicio] = useState(hoyLima());
  const [desc, setDesc] = useState<string>("");
  const [motivoCambio, setMotivoCambio] = useState("");
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);

  const venta = useQuery({
    queryKey: ["venta-inicial", ventaId],
    enabled: abierto,
    queryFn: async () => {
      const { data, error } = await supabase.from("venta").select("inicial").eq("id", ventaId).single();
      if (error) throw error;
      return Number(data.inicial);
    },
  });
  const inicial = venta.data;

  useEffect(() => {
    if (abierto) {
      setFechaInicio(hoyLima());
      setDesc("");
      setMotivoCambio("");
      setObs("");
    }
  }, [abierto]);
  useEffect(() => {
    if (abierto && inicial != null && desc === "") setDesc(String(inicial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, inicial]);

  const descNum = desc === "" ? NaN : Number(desc);
  const descValido = Number.isFinite(descNum) && descNum >= 0;
  const cambiado = inicial != null && descValido && Math.abs(descNum - inicial) > 0.005;

  const sim = useQuery({
    queryKey: ["simular-desistimiento", ventaId, fechaInicio, descValido ? descNum : null],
    enabled: abierto && descValido && !!fechaInicio,
    retry: false,
    queryFn: async () => {
      const { data, error } = await rpc("simular_desistimiento", {
        _venta_id: ventaId,
        _fecha: fechaInicio,
        _monto_descontar: descNum,
      });
      if (error) throw new Error(error.message);
      const fila = (data as Calculo[] | null)?.[0];
      if (!fila) throw new Error("No se obtuvo el cálculo.");
      return fila;
    },
  });

  async function confirmar() {
    setGuardando(true);
    const { error } = await supabase.from("desistimiento").insert({
      venta_id: ventaId,
      fecha_inicio: fechaInicio,
      observacion: obs.trim() || null,
      monto_descontar: descNum,
      motivo_cambio: cambiado ? motivoCambio.trim() : null,
    } as Database["public"]["Tables"]["desistimiento"]["Insert"]);
    setGuardando(false);
    if (error) { toast.error("No se pudo iniciar", { description: error.message }); return; }
    toast.success("Desistimiento iniciado");
    onCambio(false);
    qc.invalidateQueries();
  }

  const c = sim.data;
  const errorCalc = venta.error?.message ?? sim.error?.message ?? null;
  const listo = !!fechaInicio && descValido && !!c && (!cambiado || !!motivoCambio.trim());
  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar desistimiento</DialogTitle>
          <DialogDescription>
            Mientras esté en proceso la venta sale de Cobranza y no se pueden registrar pagos.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Fecha de inicio</Label>
            <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Monto a descontar (S/)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={desc}
              disabled={!admin}
              onChange={(e) => setDesc(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Por defecto, la cuota inicial{inicial != null ? ` (${soles(inicial)})` : ""}.
            </p>
          </div>
        </div>
        {cambiado ? (
          <div className="space-y-1">
            <Label>Motivo del cambio</Label>
            <Textarea rows={2} value={motivoCambio} onChange={(e) => setMotivoCambio(e.target.value)} />
          </div>
        ) : null}
        {errorCalc ? (
          <p className="text-sm text-destructive">No se pudo calcular: {errorCalc}</p>
        ) : !descValido && desc !== "" ? (
          <p className="text-sm text-destructive">El monto a descontar debe ser S/ 0 o más.</p>
        ) : c ? (
          <Resumen c={c} />
        ) : (
          <p className="text-sm text-muted-foreground">Calculando…</p>
        )}
        <div className="space-y-1">
          <Label>Observación</Label>
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={guardando || !listo}>Iniciar desistimiento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DetalleDesistimiento({ id, onCerrar }: { id: string | null; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const admin = esAdmin(perfil);

  const det = useQuery({
    queryKey: ["desistimiento", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desistimiento")
        .select(
          "*, venta:venta_id(id, lote:lote_id(numero, manzana:manzana_id(letra)), titulares:venta_titular(es_principal, anulado, cliente:cliente_id(nombres, apellidos))), devoluciones:desistimiento_devolucion(*)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const d = det.data;
  const [editando, setEditando] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  const [anulaDev, setAnulaDev] = useState<string | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [editDev, setEditDev] = useState<{ id: string; forma_pago: string | null; numero_operacion: string | null } | null>(null);

  const devoluciones = (d?.devoluciones ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const devuelto = devoluciones.filter((x) => !x.anulado).reduce((t, x) => t + Number(x.monto), 0);
  const pendiente = Math.max(Number(d?.monto_devolver ?? 0) - devuelto, 0);
  const vencida = !!d?.fecha_limite_devolucion && d.fecha_limite_devolucion < hoyLima() && pendiente > 0.005 && d.estado === "aceptado";
  const titular = d?.venta?.titulares?.find((t) => t.es_principal && !t.anulado)?.cliente;

  return (
    <Sheet open={!!id} onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {d ? `Desistimiento Mz ${d.venta?.lote?.manzana?.letra} · Lote ${d.venta?.lote?.numero}` : "Desistimiento"}
          </SheetTitle>
        </SheetHeader>
        {d ? (
          <div className="mt-4 space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={d.estado === "anulado" ? "destructive" : "secondary"}>{ETIQUETA_DESISTIMIENTO[d.estado]}</Badge>
              <span className="text-muted-foreground">
                {titular ? `${titular.apellidos} ${titular.nombres}` : ""} · inicio {fecha(d.fecha_inicio)}
              </span>
            </div>
            {d.anulado ? <p className="text-muted-foreground">Motivo de anulación: {d.motivo_anulacion}</p> : null}

            <div>
              <p className="mb-1 font-medium">Cálculo</p>
              <Resumen c={d as unknown as Calculo} />
              {d.observacion ? <p className="mt-2 text-muted-foreground">{d.observacion}</p> : null}
            </div>

            <div>
              <p className="mb-1 font-medium">Pasos del proceso</p>
              <Fila k="Carta prenotarial" v={d.carta_prenotarial ? fecha(d.fecha_carta_prenotarial) : "Pendiente"} />
              <Fila k="Solicitud de liberación" v={d.solicitud_liberacion ? fecha(d.fecha_solicitud_liberacion) : "Pendiente"} />
              <Fila k="Aceptación de disolución" v={d.aceptacion_disolucion ? fecha(d.fecha_aceptacion_disolucion) : "Pendiente"} />
              <Fila k="Fecha límite de devolución" v={fecha(d.fecha_limite_devolucion)} />
            </div>

            {admin && d.estado === "en_proceso" ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
                <Button size="sm" onClick={() => setAceptando(true)}>Marcar aceptación de disolución</Button>
                <Button size="sm" variant="ghost" onClick={() => setRevirtiendo(true)}>Revertir desistimiento</Button>
              </div>
            ) : null}
            {admin && (d.estado === "aceptado" || d.estado === "devuelto") ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const { data, error } = await rpc("motivo_no_revertir", { _id: d.id });
                    if (error) { toast.error("No se pudo verificar", { description: error.message }); return; }
                    if (data) { toast.error("No se puede revertir", { description: String(data) }); return; }
                    setRevirtiendo(true);
                  }}
                >
                  Revertir desistimiento
                </Button>
              </div>
            ) : null}
            {d.estado === "revertido" ? (
              <p className="text-muted-foreground">Motivo de reversión: {(d as { motivo_reversion?: string | null }).motivo_reversion ?? "—"}</p>
            ) : null}

            {d.aceptacion_disolucion ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">Devoluciones al cliente</p>
                  {pendiente <= 0.005 ? (
                    <Badge variant="secondary">Devolución completa</Badge>
                  ) : admin && d.estado === "aceptado" ? (
                    <Button size="sm" onClick={() => setDevolviendo(true)}>Registrar devolución</Button>
                  ) : null}
                </div>
                <Fila k="Devuelto" v={soles(devuelto)} />
                <Fila k="Pendiente" v={soles(pendiente)} fuerte />
                {vencida ? (
                  <p className="mt-2 flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Pasó la fecha límite y queda saldo por devolver.
                  </p>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devoluciones.map((x) => (
                      <TableRow key={x.id} className={x.anulado ? "opacity-50" : ""}>
                        <TableCell>{fecha(x.fecha)}</TableCell>
                        <TableCell className="num text-right">{soles(x.monto)}</TableCell>
                        <TableCell>
                          <MostrarMetodo metodo={x.forma_pago} operacion={x.numero_operacion} />
                          {admin && !x.anulado ? (
                            <button type="button" className="block text-xs text-primary underline" onClick={() => setEditDev(x)}>
                              Editar
                            </button>
                          ) : null}
                          {x.observacion ? <div className="text-xs text-muted-foreground">{x.observacion}</div> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {x.anulado ? (
                            <Badge variant="destructive" title={x.motivo_anulacion ?? ""}>Anulada</Badge>
                          ) : admin ? (
                            <Button size="sm" variant="ghost" onClick={() => setAnulaDev(x.id)}>Anular</Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : null}

        {d ? (
          <>
            <DialogoEditar d={d} devuelto={devuelto} abierto={editando} onCambio={setEditando} />
            <DialogoMotivo
              titulo="Revertir desistimiento"
              descripcion="La venta, sus cuotas, el lote y las comisiones vuelven a su estado anterior al desistimiento."
              abierto={revirtiendo}
              onCambio={setRevirtiendo}
              onConfirmar={async (motivo) => {
                const { error } = await rpc("revertir_desistimiento", { _id: d.id, _motivo: motivo });
                if (error) return error.message;
                qc.invalidateQueries();
                return null;
              }}
            />
            <DialogoEditarMetodo
              abierto={!!editDev}
              inicial={{ metodo: editDev?.forma_pago ?? null, operacion: editDev?.numero_operacion ?? null }}
              onCambio={(o) => (!o ? setEditDev(null) : null)}
              onGuardar={async (m, op) => {
                const { error } = await supabase
                  .from("desistimiento_devolucion")
                  .update({ forma_pago: m, numero_operacion: op })
                  .eq("id", editDev!.id);
                if (error) return error.message;
                qc.invalidateQueries();
                return null;
              }}
            />
            <DialogoAceptar id={d.id} abierto={aceptando} onCambio={setAceptando} />
            <DialogoMotivo
              titulo="Anular desistimiento"
              descripcion="La venta vuelve exactamente a su situación anterior y reaparece en Cobranza."
              abierto={anulando}
              onCambio={setAnulando}
              onConfirmar={async (motivo) => {
                const { error } = await supabase.from("desistimiento").update({ anulado: true, motivo_anulacion: motivo }).eq("id", d.id);
                if (error) return error.message;
                qc.invalidateQueries();
                return null;
              }}
            />
            <DialogoMotivo
              titulo="Anular devolución"
              abierto={!!anulaDev}
              onCambio={(o) => (!o ? setAnulaDev(null) : null)}
              onConfirmar={async (motivo) => {
                const { error } = await supabase
                  .from("desistimiento_devolucion")
                  .update({ anulado: true, motivo_anulacion: motivo })
                  .eq("id", anulaDev!);
                if (error) return error.message;
                qc.invalidateQueries();
                return null;
              }}
            />
            <DialogoDevolucion id={d.id} pendiente={pendiente} abierto={devolviendo} onCambio={setDevolviendo} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DialogoMotivo({
  titulo,
  descripcion,
  abierto,
  onCambio,
  onConfirmar,
}: {
  titulo: string;
  descripcion?: string;
  abierto: boolean;
  onCambio: (o: boolean) => void;
  onConfirmar: (motivo: string) => Promise<string | null>;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-1">
          <Label>Motivo</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button
            disabled={!motivo.trim() || guardando}
            onClick={async () => {
              setGuardando(true);
              const err = await onConfirmar(motivo.trim());
              setGuardando(false);
              if (err) { toast.error("No se pudo completar", { description: err }); return; }
              toast.success("Listo");
              setMotivo("");
              onCambio(false);
            }}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEditar({ d, devuelto, abierto, onCambio }: { d: Desistimiento; devuelto: number; abierto: boolean; onCambio: (o: boolean) => void }) {
  const qc = useQueryClient();
  const bloqueado = d.aceptacion_disolucion;
  const inicialF = () => ({
    descontar: String(d.monto_descontar ?? ""),
    observacion: d.observacion ?? "",
    carta: d.carta_prenotarial,
    fechaCarta: d.fecha_carta_prenotarial ?? "",
    solicitud: d.solicitud_liberacion,
    fechaSolicitud: d.fecha_solicitud_liberacion ?? "",
    limite: d.fecha_limite_devolucion ?? "",
    motivo: "",
  });
  const [f, setF] = useState(inicialF);
  useEffect(() => {
    if (abierto) setF(inicialF());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, d]);

  const descNum = Number(f.descontar || 0);
  const nuevoDevolver = Math.max(Math.round((Number(d.total_abonado) - descNum) * Number(d.porcentaje_devolucion)) / 100, 0);
  const errorDesc =
    f.descontar === "" || descNum < 0
      ? "Indica un monto a descontar válido."
      : nuevoDevolver < devuelto - 0.005
        ? `El nuevo monto a devolver sería menor que lo ya devuelto (${soles(devuelto)}).`
        : null;

  async function guardar() {
    if (errorDesc) { toast.error(errorDesc); return; }
    const cambios: Database["public"]["Tables"]["desistimiento"]["Update"] = {
      observacion: f.observacion.trim() || null,
      fecha_limite_devolucion: f.limite || null,
      motivo_cambio: f.motivo.trim(),
      monto_descontar: descNum,
    };
    if (!bloqueado) {
      cambios.carta_prenotarial = f.carta;
      cambios.fecha_carta_prenotarial = f.carta ? f.fechaCarta || null : null;
      cambios.solicitud_liberacion = f.solicitud;
      cambios.fecha_solicitud_liberacion = f.solicitud ? f.fechaSolicitud || null : null;
    }
    const { error } = await supabase.from("desistimiento").update(cambios).eq("id", d.id);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success("Cambios guardados");
    onCambio(false);
    qc.invalidateQueries();
  }

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar desistimiento</DialogTitle>
          <DialogDescription>Los montos se recalculan en la base al guardar. Cada cambio queda en la bitácora.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label>Monto a descontar (S/)</Label>
            <Input type="number" step="0.01" value={f.descontar} onChange={(e) => setF({ ...f, descontar: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              Nuevo monto a devolver: <span className="num">{soles(nuevoDevolver)}</span>
            </p>
            {errorDesc ? <p className="text-xs text-destructive">{errorDesc}</p> : null}
          </div>
          {!bloqueado ? (
            <>
              <div className="grid grid-cols-2 items-end gap-3">
                <label className="flex items-center gap-2 pb-2">
                  <Checkbox checked={f.carta} onCheckedChange={(v) => setF({ ...f, carta: v === true })} /> Carta prenotarial
                </label>
                <Input type="date" disabled={!f.carta} value={f.fechaCarta} onChange={(e) => setF({ ...f, fechaCarta: e.target.value })} />
                <label className="flex items-center gap-2 pb-2">
                  <Checkbox checked={f.solicitud} onCheckedChange={(v) => setF({ ...f, solicitud: v === true })} /> Solicitud de liberación
                </label>
                <Input type="date" disabled={!f.solicitud} value={f.fechaSolicitud} onChange={(e) => setF({ ...f, fechaSolicitud: e.target.value })} />
              </div>
            </>
          ) : null}
          <div className="space-y-1">
            <Label>Fecha límite de devolución</Label>
            <Input type="date" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Observación</Label>
            <Textarea rows={2} value={f.observacion} onChange={(e) => setF({ ...f, observacion: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Motivo del cambio</Label>
            <Textarea rows={2} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={!f.motivo.trim()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAceptar({ id, abierto, onCambio }: { id: string; abierto: boolean; onCambio: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(hoyLima());
  const [ok, setOk] = useState(false);
  async function confirmar() {
    const { error } = await supabase
      .from("desistimiento")
      .update({ aceptacion_disolucion: true, fecha_aceptacion_disolucion: f })
      .eq("id", id);
    if (error) { toast.error("No se pudo aceptar", { description: error.message }); return; }
    toast.success("Disolución aceptada: la venta quedó desistida y el lote libre");
    setOk(false);
    onCambio(false);
    qc.invalidateQueries();
  }
  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceptación de disolución</DialogTitle>
          <DialogDescription>
            La venta pasará a desistida, el lote quedará Libre y las cuotas pendientes dejarán de ser exigibles.
            Solo un administrador podrá revertirlo mientras no haya devoluciones ni otra venta o apartado en el lote.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Fecha de aceptación</Label>
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ok} onCheckedChange={(v) => setOk(v === true)} />
          Confirmo que la disolución fue aceptada
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!ok || !f}>Confirmar aceptación</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoDevolucion({
  id,
  pendiente,
  abierto,
  onCambio,
}: {
  id: string;
  pendiente: number;
  abierto: boolean;
  onCambio: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fecha: hoyLima(), monto: "", forma: "", operacion: "", obs: "" });
  useEffect(() => {
    if (abierto) setF({ fecha: hoyLima(), monto: pendiente ? String(pendiente) : "", forma: "", operacion: "", obs: "" });
  }, [abierto, pendiente]);
  const montoNum = Number(f.monto || 0);
  const errorMonto =
    pendiente <= 0.005
      ? "No queda saldo por devolver en este desistimiento."
      : montoNum > pendiente + 0.005
        ? `El monto supera el saldo por devolver (${soles(pendiente)})`
        : null;
  async function guardar() {
    if (errorMonto) { toast.error(errorMonto); return; }
    if (!f.forma) { toast.error("Elige el método de pago"); return; }
    const { error } = await supabase.from("desistimiento_devolucion").insert({
      desistimiento_id: id,
      fecha: f.fecha,
      monto: montoNum,
      forma_pago: f.forma,
      numero_operacion: llevaOperacion(f.forma) ? f.operacion.trim() || null : null,
      observacion: f.obs.trim() || null,
    });
    if (error) { toast.error("No se pudo registrar", { description: error.message }); return; }
    toast.success("Devolución registrada");
    onCambio(false);
    qc.invalidateQueries();
  }
  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar devolución</DialogTitle>
          <DialogDescription>Saldo por devolver: {soles(pendiente)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Monto (S/)</Label>
            <Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
          </div>
          <CamposMetodo
            metodo={f.forma}
            operacion={f.operacion}
            onMetodo={(m) => setF((x) => ({ ...x, forma: m }))}
            onOperacion={(o) => setF((x) => ({ ...x, operacion: o }))}
          />
        </div>
        {errorMonto && f.monto ? <p className="text-sm text-destructive">{errorMonto}</p> : null}
        <div className="space-y-1">
          <Label>Observación</Label>
          <Textarea rows={2} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={!f.monto || montoNum <= 0 || !!errorMonto || !f.forma}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
