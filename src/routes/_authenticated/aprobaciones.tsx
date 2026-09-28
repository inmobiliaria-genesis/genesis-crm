import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePerfil, esAdmin, esGestion } from "@/lib/sesion";
import { fecha, soles } from "@/lib/format";
import { nombreCliente, documentoCliente } from "@/lib/ventas";

export const Route = createFileRoute("/_authenticated/aprobaciones")({
  head: () => ({
    meta: [
      { title: "Aprobaciones — Gestión de lotes" },
      { name: "description", content: "Clientes y apartados registrados por asesores pendientes de aprobación." },
      { property: "og:title", content: "Aprobaciones — Gestión de lotes" },
      { property: "og:description", content: "Clientes y apartados pendientes de aprobación." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AprobacionesPage,
});

type Rechazo = { tipo: "cliente" | "reserva"; id: string } | null;

function AprobacionesPage() {
  const { data: perfil, isLoading } = usePerfil();
  const admin = esAdmin(perfil);
  const qc = useQueryClient();
  const [rechazo, setRechazo] = useState<Rechazo>(null);

  const nombres = useQuery({
    queryKey: ["perfiles-nombres"],
    enabled: esGestion(perfil),
    queryFn: async () => {
      const { data } = await supabase.from("perfil").select("user_id, nombre");
      return new Map((data ?? []).map((p) => [p.user_id, p.nombre]));
    },
  });

  const clientes = useQuery({
    queryKey: ["aprob-clientes"],
    enabled: esGestion(perfil),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cliente")
        .select("*")
        .eq("estado_aprobacion", "pendiente")
        .eq("anulado", false)
        .order("creado_en");
      if (error) throw error;
      return data;
    },
  });

  const reservas = useQuery({
    queryKey: ["aprob-reservas"],
    enabled: esGestion(perfil),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reserva")
        .select("*, cliente:cliente_id(nombres, apellidos, estado_aprobacion), lote:lote_id(numero, manzana:manzana_id(letra))")
        .eq("estado_aprobacion", "pendiente")
        .eq("anulado", false)
        .order("creado_en");
      if (error) throw error;
      return data;
    },
  });

  function refrescar() {
    for (const k of ["aprob-clientes", "aprob-reservas", "aprobaciones-contador", "reservas", "clientes", "lotes-con-estado"])
      qc.invalidateQueries({ queryKey: [k] });
  }

  async function aprobar(tipo: "cliente" | "reserva", id: string) {
    const rpc = supabase.rpc.bind(supabase);
    const { error } = await rpc((tipo === "cliente" ? "aprobar_cliente" : "aprobar_reserva") as never, { _id: id } as never);
    if (error) {
      toast.error("No se pudo aprobar", { description: error.message });
      return;
    }
    toast.success(tipo === "cliente" ? "Cliente aprobado" : "Apartado aprobado");
    refrescar();
  }

  if (!isLoading && !esGestion(perfil)) {
    return (
      <AppShell titulo="Aprobaciones">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </AppShell>
    );
  }

  const autor = (id: string | null) => (id ? nombres.data?.get(id) ?? "—" : "—");

  return (
    <AppShell
      titulo="Aprobaciones"
      descripcion={admin ? "Aprueba o rechaza lo registrado por asesores" : "Solo el administrador puede aprobar o rechazar"}
    >
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Clientes nuevos</h2>
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.data?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No hay clientes pendientes.</TableCell></TableRow>
              ) : null}
              {clientes.data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{nombreCliente(c)}</TableCell>
                  <TableCell>{documentoCliente(c)}</TableCell>
                  <TableCell>{c.telefono1}</TableCell>
                  <TableCell>{autor(c.creado_por)}</TableCell>
                  <TableCell>{fecha(c.creado_en)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    {admin ? (
                      <>
                        <Button size="sm" onClick={() => aprobar("cliente", c.id)}>Aprobar</Button>
                        <Button size="sm" variant="outline" onClick={() => setRechazo({ tipo: "cliente", id: c.id })}>Rechazar</Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-sm font-semibold">Apartados</h2>
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Anticipo</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservas.data?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No hay apartados pendientes.</TableCell></TableRow>
              ) : null}
              {reservas.data?.map((r) => {
                const clientePendiente = r.cliente?.estado_aprobacion === "pendiente";
                return (
                  <TableRow key={r.id}>
                    <TableCell>Mz {r.lote?.manzana?.letra} · Lote {r.lote?.numero}</TableCell>
                    <TableCell>
                      {nombreCliente(r.cliente)}
                      {clientePendiente ? <p className="text-xs text-muted-foreground">Cliente aún pendiente de aprobación</p> : null}
                    </TableCell>
                    <TableCell className="num text-right">{r.monto_anticipo == null ? "—" : soles(r.monto_anticipo)}</TableCell>
                    <TableCell>{autor(r.creado_por)}</TableCell>
                    <TableCell>{fecha(r.creado_en)}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {admin ? (
                        <>
                          <Button size="sm" disabled={clientePendiente} onClick={() => aprobar("reserva", r.id)}>Aprobar</Button>
                          <Button size="sm" variant="outline" onClick={() => setRechazo({ tipo: "reserva", id: r.id })}>Rechazar</Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {rechazo ? <DialogoRechazo rechazo={rechazo} onCerrar={() => setRechazo(null)} onListo={refrescar} /> : null}
    </AppShell>
  );
}

function DialogoRechazo({ rechazo, onCerrar, onListo }: { rechazo: NonNullable<Rechazo>; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function confirmar() {
    setGuardando(true);
    const rpc = supabase.rpc.bind(supabase);
    const { error } = await rpc(
      (rechazo.tipo === "cliente" ? "rechazar_cliente" : "rechazar_reserva") as never,
      { _id: rechazo.id, _motivo: motivo.trim() } as never,
    );
    setGuardando(false);
    if (error) {
      toast.error("No se pudo rechazar", { description: error.message });
      return;
    }
    toast.success("Solicitud rechazada");
    onListo();
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar {rechazo.tipo === "cliente" ? "cliente" : "apartado"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Motivo (obligatorio, lo verá el asesor)</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {rechazo.tipo === "cliente" ? (
            <p className="text-xs text-muted-foreground">Sus apartados pendientes también se rechazarán.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button variant="destructive" disabled={guardando || !motivo.trim()} onClick={confirmar}>Rechazar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
