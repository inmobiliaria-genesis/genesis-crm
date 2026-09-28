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
import { usePerfil, esGestion, esAsesor } from "@/lib/sesion";
import { EstadoAprobacion } from "@/components/EstadoAprobacion";
import { TIPOS_DOCUMENTO } from "@/lib/ventas";

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
  validateSearch: (s: Record<string, unknown>): { nuevoLote?: string } => ({
    nuevoLote: typeof s["nuevoLote"] === "string" ? s["nuevoLote"] : undefined,
  }),
  component: ApartadosPage,
});

function ApartadosPage() {
  const navigate = useNavigate();
  const busqueda = Route.useSearch();
  const [alta, setAlta] = useState(!!busqueda.nuevoLote);
  const [editar, setEditar] = useState<{ id: string; monto_anticipo: number | null; notas: string | null } | null>(null);
  const { data: perfilSesion } = usePerfil();
  const asesor = esAsesor(perfilSesion);
  const gestion = esGestion(perfilSesion);
  const puedeRegistrar = gestion || asesor;

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
      titulo={asesor ? "Mis apartados" : "Apartados"}
      descripcion={asesor ? "Apartados que registraste y su estado de aprobación" : "Reservas de lotes con fecha límite"}
      acciones={
        puedeRegistrar ? <Button onClick={() => setAlta(true)}>+ Nuevo apartado</Button> : null
      }
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
                <TableHead>Aprobación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservas.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    Todavía no hay apartados.
                  </TableCell>
                </TableRow>
              ) : null}
              {reservas.data?.map((r) => {
                const aprobado = r.estado_aprobacion === "aprobado";
                const vigente = aprobado && !r.anulado && !r.convertida_a_venta_id && (r.fecha_limite ?? "") >= hoy;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      Mz {r.lote?.manzana?.letra} · Lote {r.lote?.numero}
                    </TableCell>
                    <TableCell>{r.cliente ? nombreCliente(r.cliente) : "Cliente existente"}</TableCell>
                    <TableCell>{fecha(r.fecha)}</TableCell>
                    <TableCell>{fecha(r.fecha_limite)}</TableCell>
                    <TableCell className="num text-right">{soles(r.monto_anticipo)}</TableCell>
                    <TableCell>
                      <EstadoAprobacion estado={r.estado_aprobacion} motivo={r.motivo_rechazo} />
                    </TableCell>
                    <TableCell>
                      {!aprobado ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : r.anulado ? (
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
                      {asesor && r.estado_aprobacion === "pendiente" && !r.anulado ? (
                        <Button size="sm" variant="outline" onClick={() => setEditar(r)}>
                          Editar
                        </Button>
                      ) : vigente && gestion ? (
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

      {alta ? (
        <DialogoApartado
          asesor={asesor}
          loteInicial={busqueda.nuevoLote ?? ""}
          onCerrar={() => setAlta(false)}
        />
      ) : null}
      {editar ? <DialogoEditarApartado reserva={editar} onCerrar={() => setEditar(null)} /> : null}
    </AppShell>
  );
}

function DialogoApartado({
  onCerrar,
  asesor,
  loteInicial,
}: {
  onCerrar: () => void;
  asesor: boolean;
  loteInicial: string;
}) {
  const qc = useQueryClient();
  const lotes = useLotesConEstado();
  const [loteId, setLoteId] = useState(loteInicial);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteExistente, setClienteExistente] = useState<{ id: string; doc: string } | null>(null);
  const [modoDoc, setModoDoc] = useState(false);
  const [tipoDoc, setTipoDoc] = useState<string>("DNI");
  const [numDoc, setNumDoc] = useState("");

  const pendienteOtro = useQuery({
    queryKey: ["solicitud-pendiente", loteId],
    enabled: !!loteId,
    queryFn: async () => {
      const { data } = await supabase.rpc("hay_solicitud_pendiente" as never, { _lote_id: loteId } as never);
      return data === true;
    },
  });

  async function buscarPorDocumento() {
    const { data, error } = await supabase.rpc("buscar_cliente_documento" as never, {
      _tipo: tipoDoc,
      _numero: numDoc.trim(),
    } as never);
    const fila = (Array.isArray(data) ? data[0] : null) as
      | { cliente_id: string; estado_aprobacion: string; es_mio: boolean }
      | null;
    if (error || !fila) {
      toast.error("No hay un cliente con ese documento");
      return;
    }
    if (fila.estado_aprobacion !== "aprobado" && !fila.es_mio) {
      toast.error("Ese cliente aún no está aprobado");
      return;
    }
    setClienteExistente({ id: fila.cliente_id, doc: `${tipoDoc} ${numDoc.trim()}` });
  }
  const [fechaR, setFechaR] = useState(hoyLima());
  const [anticipo, setAnticipo] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const disponibles = (lotes.data ?? []).filter(
    (l) => l.estado === "disponible" && l.area_m2 !== null && l.precio_lista !== null,
  );
  const clienteId = cliente?.id ?? clienteExistente?.id ?? null;

  async function guardar() {
    if (!loteId || !clienteId) {
      toast.error("Elige lote y cliente");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("reserva").insert({
      lote_id: loteId,
      cliente_id: clienteId,
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
    toast.success(asesor ? "Apartado enviado para aprobación" : "Apartado registrado");
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
            {pendienteOtro.data ? (
              <p className="mt-1 text-xs text-destructive">
                Ya hay otra solicitud de apartado pendiente para este lote
              </p>
            ) : null}
          </div>
          {clienteExistente ? (
            <div>
              <Label>Cliente</Label>
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex-1">Cliente existente ({clienteExistente.doc})</span>
                <Button size="sm" variant="ghost" onClick={() => setClienteExistente(null)}>
                  Cambiar
                </Button>
              </div>
            </div>
          ) : asesor && modoDoc ? (
            <div className="space-y-1">
              <Label>Documento de un cliente ya registrado</Label>
              <div className="flex gap-2">
                <Select value={tipoDoc} onValueChange={setTipoDoc}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DOCUMENTO.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={numDoc} onChange={(e) => setNumDoc(e.target.value)} />
                <Button type="button" variant="outline" onClick={buscarPorDocumento}>
                  Usar
                </Button>
              </div>
              <button type="button" className="text-xs underline" onClick={() => setModoDoc(false)}>
                Volver a mis clientes
              </button>
            </div>
          ) : (
            <>
              <SelectorCliente valor={cliente} onCambio={setCliente} />
              {asesor && !cliente ? (
                <button type="button" className="text-xs underline" onClick={() => setModoDoc(true)}>
                  El cliente ya existe (registrado por otra persona): ingresar su documento
                </button>
              ) : null}
            </>
          )}
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
            {asesor ? " Tu apartado quedará pendiente de aprobación y el lote seguirá Libre hasta que se apruebe." : ""}
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

function DialogoEditarApartado({
  reserva,
  onCerrar,
}: {
  reserva: { id: string; monto_anticipo: number | null; notas: string | null };
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [anticipo, setAnticipo] = useState(reserva.monto_anticipo == null ? "" : String(reserva.monto_anticipo));
  const [notas, setNotas] = useState(reserva.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    const { error } = await supabase
      .from("reserva")
      .update({ monto_anticipo: anticipo ? Number(anticipo) : null, notas: notas.trim() || null })
      .eq("id", reserva.id);
    setGuardando(false);
    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
      return;
    }
    toast.success("Apartado actualizado");
    qc.invalidateQueries({ queryKey: ["reservas"] });
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar apartado pendiente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Monto de anticipo (referencial, opcional)</Label>
            <Input value={anticipo} onChange={(e) => setAnticipo(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
