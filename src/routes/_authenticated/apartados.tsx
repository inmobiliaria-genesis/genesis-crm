import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { SelectorCliente } from "@/components/SelectorCliente";
import { nombreCliente, useLotesConEstado, type Cliente } from "@/lib/ventas";
import { fecha, hoyLima, soles } from "@/lib/format";
import { usePerfil, puedeComercial } from "@/lib/sesion";

export const Route = createFileRoute("/_authenticated/apartados")({
  head: () => ({
    meta: [
      { title: "Apartados — Gestión de lotes" },
      { name: "description", content: "Apartados de lotes y su conversión a venta." },
      { property: "og:title", content: "Apartados — Gestión de lotes" },
      { property: "og:description", content: "Apartados de lotes y su conversión a venta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApartadosPage,
});

function ApartadosPage() {
  const navigate = useNavigate();
  const [alta, setAlta] = useState(false);
  const { data: perfilSesion } = usePerfil();
  const comercial = puedeComercial(perfilSesion);

  const reservas = useQuery({
    queryKey: ["reservas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reserva")
        .select(
          "*, cliente:cliente_id(id, nombres, apellidos, tipo_documento, numero_documento), lote:lote_id(id, numero, manzana:manzana_id(letra))",
        )
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const hoy = hoyLima();

  return (
    <AppShell
      titulo="Apartados"
      descripcion="Reservas de lotes con fecha límite"
      acciones={<Button onClick={() => setAlta(true)}>+ Nuevo apartado</Button>}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="text-right">Anticipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservas.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    Todavía no hay apartados.
                  </TableCell>
                </TableRow>
              ) : null}
              {reservas.data?.map((r) => {
                const vigente = !r.anulado && !r.convertida_a_venta_id && (r.fecha_limite ?? "") >= hoy;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      Mz {r.lote?.manzana?.letra} · Lote {r.lote?.numero}
                    </TableCell>
                    <TableCell>{nombreCliente(r.cliente)}</TableCell>
                    <TableCell>{fecha(r.fecha)}</TableCell>
                    <TableCell>{fecha(r.fecha_limite)}</TableCell>
                    <TableCell className="num text-right">{soles(r.monto_anticipo)}</TableCell>
                    <TableCell>
                      {r.anulado ? (
                        <Badge variant="outline">Anulado</Badge>
                      ) : r.convertida_a_venta_id ? (
                        <Badge variant="secondary">Convertido a venta</Badge>
                      ) : vigente ? (
                        <Badge>Vigente</Badge>
                      ) : (
                        <Badge variant="outline">Vencido</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {vigente ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate({
                              to: "/ventas",
                              search: { nuevoLote: r.lote?.id, nuevoCliente: r.cliente?.id },
                            })
                          }
                        >
                          Convertir a venta
                        </Button>
                      ) : r.convertida_a_venta_id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            navigate({ to: "/ventas", search: { venta: r.convertida_a_venta_id! } })
                          }
                        >
                          Ver venta
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {alta ? <DialogoApartado onCerrar={() => setAlta(false)} /> : null}
    </AppShell>
  );
}

function DialogoApartado({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const lotes = useLotesConEstado();
  const [loteId, setLoteId] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [fechaR, setFechaR] = useState(hoyLima());
  const [anticipo, setAnticipo] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const disponibles = (lotes.data ?? []).filter((l) => l.estado === "disponible");

  async function guardar() {
    if (!loteId || !cliente) {
      toast.error("Elige lote y cliente");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("reserva").insert({
      lote_id: loteId,
      cliente_id: cliente.id,
      fecha: fechaR,
      vigencia_dias: null as unknown as number,
      monto_anticipo: anticipo ? Number(anticipo) : null,
      notas: notas.trim() || null,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo registrar el apartado", { description: error.message });
      return;
    }
    toast.success("Apartado registrado");
    qc.invalidateQueries();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo apartado</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Lote disponible</Label>
            <Select value={loteId} onValueChange={setLoteId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un lote" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.etiqueta} — {soles(l.precio_lista)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SelectorCliente valor={cliente} onCambio={setCliente} />
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fechaR} onChange={(e) => setFechaR(e.target.value)} />
          </div>
          <div>
            <Label>Monto de anticipo (referencial, opcional)</Label>
            <Input value={anticipo} onChange={(e) => setAnticipo(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            La vigencia se toma de la configuración del sistema y define la fecha límite.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
