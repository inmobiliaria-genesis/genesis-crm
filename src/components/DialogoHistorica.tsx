import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Cambia es_historica de una venta con motivo obligatorio (solo admin; validado en la base). */
export function BotonHistorica({ ventaId, esHistorica }: { ventaId: string; esHistorica: boolean }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [monto, setMonto] = useState("");
  const [estado, setEstado] = useState("");
  const faltanDatos = esHistorica && (!(Number(monto) > 0) || !estado);

  async function guardar() {
    setGuardando(true);
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("cambiar_historica", {
      _venta_id: ventaId,
      _es_historica: !esHistorica,
      _motivo: motivo.trim(),
      _monto: esHistorica ? Number(monto) : null,
      _estado: esHistorica ? estado : null,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo cambiar", { description: error.message });
      return;
    }
    toast.success(esHistorica ? "La venta ya no es histórica" : "La venta volvió a ser histórica");
    setAbierto(false);
    setMotivo("");
    setMonto("");
    setEstado("");
    qc.invalidateQueries();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        {esHistorica ? "Quitar marca histórica" : "Marcar como histórica"}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{esHistorica ? "Quitar marca histórica" : "Volver a histórica"}</DialogTitle>
            <DialogDescription>
              {esHistorica
                ? "Indica la comisión revisada de esta venta. Si queda Pendiente, es una deuda de la empresa con el vendedor."
                : "Su comisión se anulará con este mismo motivo. Si ya fue pagada, el cambio se rechaza."}
            </DialogDescription>
          </DialogHeader>
          {esHistorica ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Monto de la comisión (S/)</Label>
                <Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={estado} onValueChange={setEstado}>
                  <SelectTrigger><SelectValue placeholder="Elegir" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pagada_antes_crm">Pagada antes del CRM</SelectItem>
                    <SelectItem value="pendiente">Pendiente (deuda de la empresa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!motivo.trim() || guardando || faltanDatos}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
