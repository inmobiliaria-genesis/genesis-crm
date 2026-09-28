import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
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

/** Confirmación de borrado definitivo con motivo obligatorio. */
export function DialogoEliminar({
  titulo,
  abierto,
  onCambio,
  children,
  onConfirmar,
}: {
  titulo: string;
  abierto: boolean;
  onCambio: (o: boolean) => void;
  children?: ReactNode;
  onConfirmar: (motivo: string) => Promise<string | null>;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (abierto) setMotivo(""); }, [abierto]);
  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Esta acción no se puede deshacer. Se guarda una copia completa en la bitácora.</DialogDescription>
        </DialogHeader>
        {children}
        <div className="space-y-1">
          <Label>Motivo</Label>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!motivo.trim() || guardando}
            onClick={async () => {
              setGuardando(true);
              const err = await onConfirmar(motivo.trim());
              setGuardando(false);
              if (err) { toast.error("No se pudo eliminar", { description: err }); return; }
              toast.success("Eliminado");
              onCambio(false);
            }}
          >
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
