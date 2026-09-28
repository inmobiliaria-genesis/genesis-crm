import { useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogoCliente } from "@/components/ClienteForm";
import { useClientes, nombreCliente, documentoCliente, type Cliente } from "@/lib/ventas";
import { cn } from "@/lib/utils";

export function SelectorCliente({
  label = "Cliente",
  valor,
  onCambio,
  inicialNuevo,
}: {
  inicialNuevo?: React.ComponentProps<typeof DialogoCliente>["inicial"];
  label?: string;
  valor: Cliente | null;
  onCambio: (c: Cliente | null) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const clientes = useClientes(busqueda);

  if (valor) {
    return (
      <div>
        <Label>{label}</Label>
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="flex-1">
            {nombreCliente(valor)}{" "}
            <span className="text-xs text-muted-foreground">({documentoCliente(valor)})</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => onCambio(null)}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por documento o nombre"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={() => setNuevo(true)}>
          Nuevo
        </Button>
      </div>
      <div className={cn("mt-2 max-h-40 overflow-y-auto rounded-md border border-border", !clientes.data?.length && "hidden")}>
        {clientes.data?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onCambio(c)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/40"
          >
            <span>{nombreCliente(c)}</span>
            <span className="text-xs text-muted-foreground">{documentoCliente(c)}</span>
          </button>
        ))}
      </div>
      {nuevo ? (
        <DialogoCliente
          abierto
          onCerrar={() => setNuevo(false)}
          onGuardado={(c) => onCambio(c)}
          inicial={inicialNuevo}
        />
      ) : null}
    </div>
  );
}
