import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  async function guardar() {
    setGuardando(true);
    const { error } = await supabase.rpc("cambiar_historica", {
      _venta_id: ventaId,
      _es_historica: !esHistorica,
      _motivo: motivo.trim(),
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo cambiar", { description: error.message });
      return;
    }
    toast.success(esHistorica ? "La venta ya no es histórica" : "La venta volvió a ser histórica");
    setAbierto(false);
    setMotivo("");
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
                ? "Si la venta tiene encargado y fecha de firma, se generará su comisión y contará para el incentivo."
                : "Su comisión se anulará con este mismo motivo. Si ya fue pagada, el cambio se rechaza."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!motivo.trim() || guardando}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
