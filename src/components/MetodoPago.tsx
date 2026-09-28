import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { METODOS_PAGO, ETIQUETA_METODO, llevaOperacion, etiquetaMetodo } from "@/lib/cobranza";

/** Selector de método (Transferencia, Efectivo, Yape, Plin) y código de operación condicional. */
export function CamposMetodo({
  metodo,
  operacion,
  onMetodo,
  onOperacion,
  etiqueta = "Método de pago",
}: {
  etiqueta?: string;
  metodo: string;
  operacion: string;
  onMetodo: (m: string) => void;
  onOperacion: (o: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>{etiqueta}</Label>
        <Select
          value={metodo}
          onValueChange={(m) => {
            onMetodo(m);
            if (!llevaOperacion(m)) onOperacion("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Elige el método" />
          </SelectTrigger>
          <SelectContent>
            {METODOS_PAGO.map((m) => (
              <SelectItem key={m} value={m}>{ETIQUETA_METODO[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {llevaOperacion(metodo) ? (
        <div className="space-y-1">
          <Label>Código de operación (opcional)</Label>
          <Input maxLength={50} value={operacion} onChange={(e) => onOperacion(e.target.value)} />
        </div>
      ) : null}
    </>
  );
}

/** Texto del método con su código de operación debajo. */
export function MostrarMetodo({ metodo, operacion }: { metodo: string | null; operacion?: string | null }) {
  return (
    <>
      <span className={metodo ? "" : "text-muted-foreground"}>{etiquetaMetodo(metodo)}</span>
      {operacion ? <span className="block text-xs text-muted-foreground">Op. {operacion}</span> : null}
    </>
  );
}

export function DialogoEditarMetodo({
  abierto,
  inicial,
  onCambio,
  onGuardar,
}: {
  abierto: boolean;
  inicial: { metodo: string | null; operacion: string | null };
  onCambio: (o: boolean) => void;
  onGuardar: (metodo: string, operacion: string | null) => Promise<string | null>;
}) {
  const [metodo, setMetodo] = useState("");
  const [operacion, setOperacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (abierto) {
      setMetodo(inicial.metodo ?? "");
      setOperacion(inicial.operacion ?? "");
    }
  }, [abierto, inicial.metodo, inicial.operacion]);

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Método de pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <CamposMetodo metodo={metodo} operacion={operacion} onMetodo={setMetodo} onOperacion={setOperacion} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambio(false)}>Cancelar</Button>
          <Button
            disabled={!metodo || guardando}
            onClick={async () => {
              setGuardando(true);
              const err = await onGuardar(metodo, llevaOperacion(metodo) ? operacion.trim() || null : null);
              setGuardando(false);
              if (err) { toast.error("No se pudo guardar", { description: err }); return; }
              toast.success("Método actualizado");
              onCambio(false);
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
