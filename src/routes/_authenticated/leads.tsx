import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fecha, fechaHora, hoyLima } from "@/lib/format";
import { usePerfil, esAsesor, esAdmin } from "@/lib/sesion";
import { useVendedores, nombreVendedor } from "@/lib/vendedores";
import {
  CampoOrigen,
  ETAPAS_LEAD,
  ETIQUETA_ETAPA,
  ETIQUETA_FUENTE,
  FUENTES,
  ORIGEN_VACIO,
  nombreClientePorId,
  origenAColumnas,
  origenDeFila,
  textoOrigen,
  validarOrigen,
  type Origen,
} from "@/lib/leads";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["lead"]["Row"];
type LeadFila = Lead & { vendedor: { nombre: string; apodo: string | null; estado: string } | null };

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Gestión de lotes" },
      { name: "description", content: "Interesados antes de comprar: seguimiento, etapas y origen." },
      { property: "og:title", content: "Leads — Gestión de lotes" },
      { property: "og:description", content: "Interesados antes de comprar: seguimiento, etapas y origen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
});

function diasDesde(f: string) {
  const a = new Date(`${f}T12:00:00Z`).getTime();
  const b = new Date(`${hoyLima()}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function grupoAccion(l: Lead, hoy: string) {
  if (!l.proxima_fecha) return 3;
  if (l.proxima_fecha < hoy) return 0;
  if (l.proxima_fecha === hoy) return 1;
  return 2;
}

function LeadsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: perfil } = usePerfil();
  const asesor = esAsesor(perfil);
  const vendedores = useVendedores();
  const encargados = (vendedores.data ?? []).filter((v) => v.tipo === "encargado");
  const [fEtapa, setFEtapa] = useState("todas");
  const [fOrigen, setFOrigen] = useState("todos");
  const [fVendedor, setFVendedor] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [ofrecerApartado, setOfrecerApartado] = useState<LeadFila | null>(null);

  const leads = useQuery({
    queryKey: ["leads"],
    queryFn: async (): Promise<LeadFila[]> => {
      const { data, error } = await supabase
        .from("lead")
        .select("*, vendedor:vendedor!lead_vendedor_id_fkey(nombre, apodo, estado)")
        .eq("anulado", false)
        .order("creado_en", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as LeadFila[];
    },
  });

  const hoy = hoyLima();
  const filas = useMemo(() => {
    return (leads.data ?? [])
      .filter((l) => fEtapa === "todas" || l.etapa === fEtapa)
      .filter((l) => fOrigen === "todos" || (fOrigen === "ninguno" ? !l.origen : fOrigen === "promotor" ? l.origen === "promotor" : l.fuente === fOrigen))
      .filter((l) => fVendedor === "todos" || l.vendedor_id === fVendedor)
      .filter((l) => !desde || l.fecha_contacto >= desde)
      .filter((l) => !hasta || l.fecha_contacto <= hasta)
      .sort((a, b) => {
        const ga = grupoAccion(a, hoy);
        const gb = grupoAccion(b, hoy);
        if (ga !== gb) return ga - gb;
        if (a.proxima_fecha && b.proxima_fecha && a.proxima_fecha !== b.proxima_fecha)
          return a.proxima_fecha.localeCompare(b.proxima_fecha);
        return b.fecha_contacto.localeCompare(a.fecha_contacto);
      });
  }, [leads.data, fEtapa, fOrigen, fVendedor, desde, hasta, hoy]);

  async function actualizar(id: string, cambios: Partial<Lead>) {
    const { error } = await supabase.from("lead").update(cambios).eq("id", id);
    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
      return false;
    }
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead", id] });
    return true;
  }

  async function cambiarEtapa(l: LeadFila, etapa: string) {
    if (await actualizar(l.id, { etapa })) {
      toast.success(`Etapa: ${ETIQUETA_ETAPA[etapa]}`);
      if (etapa === "separo" && !l.reserva_id) setOfrecerApartado(l);
    }
  }

  return (
    <AppShell
      titulo={asesor ? "Mis leads" : "Leads"}
      descripcion="Interesados antes de comprar"
      acciones={<Button onClick={() => setNuevo(true)}>+ Nuevo lead</Button>}
    >
      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label>Etapa</Label>
            <Select value={fEtapa} onValueChange={setFEtapa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {ETAPAS_LEAD.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_ETAPA[e]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Origen</Label>
            <Select value={fOrigen} onValueChange={setFOrigen}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ninguno">Sin indicar</SelectItem>
                <SelectItem value="promotor">Promotor</SelectItem>
                {FUENTES.map((o) => <SelectItem key={o} value={o}>Marketing · {ETIQUETA_FUENTE[o]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vendedor asignado</Label>
            <Select value={fVendedor} onValueChange={setFVendedor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {encargados.map((v) => <SelectItem key={v.id} value={v.id}>{nombreVendedor(v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Primer contacto desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Próxima acción</TableHead>
                <TableHead className="text-right">Días</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((l) => {
                const g = grupoAccion(l, hoy);
                return (
                  <TableRow key={l.id} className={cn(g === 0 && "bg-destructive/10")}>
                    <TableCell>
                      <button className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setDetalle(l.id)}>
                        {l.nombre}
                      </button>
                      {l.venta_id ? <Badge className="ml-2">Vendido</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{l.telefono}</TableCell>
                    <TableCell>{textoOrigen(l)}</TableCell>
                    <TableCell>{nombreVendedor(l.vendedor)}</TableCell>
                    <TableCell className="min-w-40">
                      <Select value={l.etapa} onValueChange={(e) => cambiarEtapa(l, e)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ETAPAS_LEAD.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_ETAPA[e]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-72">
                      <ProximaAccion lead={l} vencida={g === 0} onGuardar={(c) => actualizar(l.id, c)} />
                    </TableCell>
                    <TableCell className="text-right">{diasDesde(l.fecha_contacto)}</TableCell>
                  </TableRow>
                );
              })}
              {!filas.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {leads.isLoading ? "Cargando…" : "No hay leads con estos filtros"}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {nuevo ? <DialogoLead onCerrar={() => setNuevo(false)} onSepara={(l) => setOfrecerApartado(l)} /> : null}
      {detalle ? (
        <DetalleLead
          id={detalle}
          onCerrar={() => setDetalle(null)}
          onSepara={(l) => setOfrecerApartado(l)}
        />
      ) : null}
      <Dialog open={!!ofrecerApartado} onOpenChange={(v) => (!v ? setOfrecerApartado(null) : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ofrecerApartado?.nombre} separó</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Registrar el apartado ahora? Se abrirá el formulario con nombre, teléfono, origen, referido y promotor ya llenos; faltará el DNI y los demás datos del cliente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfrecerApartado(null)}>Más tarde</Button>
            <Button
              onClick={() => {
                const id = ofrecerApartado!.id;
                setOfrecerApartado(null);
                navigate({ to: "/apartados", search: { lead: id } });
              }}
            >
              Registrar apartado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ProximaAccion({
  lead,
  vencida,
  onGuardar,
}: {
  lead: Lead;
  vencida: boolean;
  onGuardar: (c: Partial<Lead>) => Promise<boolean>;
}) {
  const [f, setF] = useState(lead.proxima_fecha ?? "");
  const [t, setT] = useState(lead.proxima_accion ?? "");
  useEffect(() => {
    setF(lead.proxima_fecha ?? "");
    setT(lead.proxima_accion ?? "");
  }, [lead.proxima_fecha, lead.proxima_accion]);
  return (
    <div className="flex gap-2">
      <Input
        type="date"
        className={cn("h-8 w-36", vencida && "border-destructive text-destructive")}
        value={f}
        onChange={(e) => setF(e.target.value)}
        onBlur={() => f !== (lead.proxima_fecha ?? "") && onGuardar({ proxima_fecha: f || null })}
      />
      <Input
        className="h-8"
        placeholder="Qué hacer"
        maxLength={120}
        value={t}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => t.trim() !== (lead.proxima_accion ?? "") && onGuardar({ proxima_accion: t.trim() || null })}
      />
    </div>
  );
}

function DialogoLead({
  lead,
  onCerrar,
  onSepara,
}: {
  lead?: Lead;
  onCerrar: () => void;
  onSepara: (l: LeadFila) => void;
}) {
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const asesor = esAsesor(perfil);
  const vendedores = useVendedores();
  const activos = (vendedores.data ?? []).filter((v) => v.estado === "activo");
  const encargados = activos.filter((v) => v.tipo === "encargado");
  const promotores = (vendedores.data ?? []).filter((v) => v.tipo === "promotor");
  const miVendedor = (vendedores.data ?? []).find((v) => perfil && v.usuario_id === perfil.user_id);

  const [nombre, setNombre] = useState(lead?.nombre ?? "");
  const [telefono, setTelefono] = useState(lead?.telefono ?? "+51 ");
  const [aviso, setAviso] = useState<string | null>(null);
  const [vendedorId, setVendedorId] = useState(lead?.vendedor_id ?? "");
  const [origen, setOrigen] = useState<Origen>(lead ? origenDeFila(lead) : ORIGEN_VACIO);
  const [fechaC, setFechaC] = useState(lead?.fecha_contacto ?? hoyLima());
  const [etapa, setEtapa] = useState(lead?.etapa ?? "nuevo");
  const [proxF, setProxF] = useState(lead?.proxima_fecha ?? "");
  const [proxT, setProxT] = useState(lead?.proxima_accion ?? "");
  const [notas, setNotas] = useState(lead?.notas ?? "");
  const [motivo, setMotivo] = useState(lead?.motivo_no_interesado ?? "");
  const [mas, setMas] = useState(!!lead);
  const [guardando, setGuardando] = useState(false);

  async function revisarTelefono() {
    const { data } = await supabase.rpc("lead_por_telefono" as never, { _telefono: telefono, _excluir: lead?.id ?? null } as never);
    const fila = (Array.isArray(data) ? data[0] : null) as { nombre: string } | null;
    setAviso(fila ? `Ya existe un lead con este teléfono (${fila.nombre})` : null);
  }

  async function guardar() {
    if (!nombre.trim() || telefono.replace(/\D/g, "").length < 6) {
      toast.error("Nombre y teléfono son obligatorios");
      return;
    }
    if (!asesor && !vendedorId) {
      toast.error("Elige el vendedor asignado");
      return;
    }
    const errOrigen = validarOrigen(origen, false);
    if (errOrigen) {
      toast.error(errOrigen);
      return;
    }
    setGuardando(true);
    const payload = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      vendedor_id: asesor ? (lead?.vendedor_id ?? miVendedor?.id ?? "") : vendedorId,
      ...origenAColumnas(origen),
      fecha_contacto: fechaC || hoyLima(),
      etapa,
      proxima_fecha: proxF || null,
      proxima_accion: proxT.trim() || null,
      notas: notas.trim() || null,
      motivo_no_interesado: etapa === "no_interesado" ? motivo.trim() || null : null,
    };
    const res = lead
      ? await supabase.from("lead").update(payload).eq("id", lead.id).select("*").single()
      : await supabase.from("lead").insert(payload).select("*").single();
    setGuardando(false);
    if (res.error) {
      toast.error("No se pudo guardar", { description: res.error.message });
      return;
    }
    toast.success(lead ? "Lead actualizado" : "Lead registrado");
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead"] });
    onCerrar();
    if (etapa === "separo" && lead?.etapa !== "separo" && !res.data.reserva_id) {
      onSepara({ ...res.data, vendedor: null });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Nuevo lead"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre</Label>
            <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} onBlur={revisarTelefono} inputMode="tel" />
            {aviso ? <p className="mt-1 text-xs text-destructive">{aviso}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <Label>Vendedor asignado</Label>
            {asesor ? (
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                {miVendedor ? nombreVendedor(miVendedor) : "Tu vendedor vinculado"}
              </div>
            ) : (
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger><SelectValue placeholder="Elige el encargado" /></SelectTrigger>
                <SelectContent>
                  {encargados.map((v) => <SelectItem key={v.id} value={v.id}>{nombreVendedor(v)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={etapa} onValueChange={setEtapa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS_LEAD.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_ETAPA[e]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Próxima acción (fecha)</Label>
            <Input type="date" value={proxF} onChange={(e) => setProxF(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Input
              placeholder="Ej.: llamar para confirmar visita"
              maxLength={120}
              value={proxT}
              onChange={(e) => setProxT(e.target.value)}
            />
          </div>
          {etapa === "no_interesado" ? (
            <div className="sm:col-span-2">
              <Label>Motivo (opcional)</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          ) : null}
        </div>
        <Collapsible open={mas} onOpenChange={setMas}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <ChevronDown className={cn("h-4 w-4 transition-transform", mas && "rotate-180")} /> Más datos
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-2">
            <CampoOrigen
              valor={origen}
              onCambio={setOrigen}
              opcional
              promotores={promotores.filter((p) => p.estado === "activo" || p.id === lead?.promotor_id).map((p) => ({ id: p.id, nombre: nombreVendedor(p) }))}
            />
            <div>
              <Label>Primer contacto</Label>
              <Input type="date" value={fechaC} onChange={(e) => setFechaC(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </CollapsibleContent>
        </Collapsible>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalleLead({
  id,
  onCerrar,
  onSepara,
}: {
  id: string;
  onCerrar: () => void;
  onSepara: (l: LeadFila) => void;
}) {
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const admin = esAdmin(perfil);
  const [editar, setEditar] = useState(false);
  const [eliminar, setEliminar] = useState(false);
  const [motivo, setMotivo] = useState("");

  const lead = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead")
        .select(
          "*, vendedor:vendedor!lead_vendedor_id_fkey(nombre, apodo, estado), promotor:vendedor!lead_promotor_id_fkey(nombre, apodo, estado)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      const [cliente, reserva, venta, referido] = await Promise.all([
        data.cliente_id ? supabase.from("cliente").select("id, nombres, apellidos").eq("id", data.cliente_id).maybeSingle() : null,
        data.reserva_id ? supabase.from("reserva").select("id, fecha, estado_aprobacion").eq("id", data.reserva_id).maybeSingle() : null,
        data.venta_id ? supabase.from("venta").select("id, fecha_venta").eq("id", data.venta_id).maybeSingle() : null,
        nombreClientePorId(data.referido_por_id),
      ]);
      return {
        ...data,
        clienteV: cliente?.data ?? null,
        reservaV: reserva?.data ?? null,
        ventaV: venta?.data ?? null,
        referidoNombre: referido,
      };
    },
  });

  const historial = useQuery({
    queryKey: ["lead", id, "historial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_etapa_historial")
        .select("*")
        .eq("lead_id", id)
        .order("fecha_hora", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const usuarios = useQuery({
    queryKey: ["lead", id, "usuarios", historial.data?.length],
    enabled: !!historial.data?.length,
    queryFn: async () => {
      const ids = [...new Set((historial.data ?? []).map((h) => h.usuario_id).filter(Boolean))] as string[];
      const { data } = await supabase.from("perfil").select("user_id, nombre").in("user_id", ids);
      return new Map((data ?? []).map((p) => [p.user_id, p.nombre]));
    },
  });
  const nombrePerfil = (uid: string | null) => (uid && usuarios.data?.get(uid)) || "Usuario";

  async function confirmarEliminar() {
    if (!motivo.trim()) {
      toast.error("Indica el motivo");
      return;
    }
    const { error } = await supabase.from("lead").update({ anulado: true, motivo_anulacion: motivo.trim() }).eq("id", id);
    if (error) {
      toast.error("No se pudo eliminar", { description: error.message });
      return;
    }
    toast.success("Lead eliminado");
    qc.invalidateQueries({ queryKey: ["leads"] });
    onCerrar();
  }

  const l = lead.data;
  return (
    <Sheet open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {l?.nombre ?? "Lead"} {l?.venta_id ? <Badge className="ml-2">Vendido</Badge> : null}
          </SheetTitle>
        </SheetHeader>
        {l ? (
          <div className="mt-4 space-y-5 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Dato k="Teléfono" v={l.telefono} />
              <Dato k="Etapa" v={ETIQUETA_ETAPA[l.etapa] ?? l.etapa} />
              <Dato k="Origen" v={textoOrigen(l)} />
              {l.fuente === "referido" ? <Dato k="Referido por" v={l.referidoNombre ?? "—"} /> : null}
              <Dato k="Vendedor asignado" v={nombreVendedor(l.vendedor)} />
              <Dato k="Promotor" v={l.promotor ? nombreVendedor(l.promotor) : "—"} />
              <Dato k="Primer contacto" v={fecha(l.fecha_contacto)} />
              <Dato k="Próxima acción" v={l.proxima_fecha ? `${fecha(l.proxima_fecha)} ${l.proxima_accion ?? ""}` : l.proxima_accion ?? "—"} />
              {l.etapa === "no_interesado" ? <Dato k="Motivo" v={l.motivo_no_interesado ?? "—"} /> : null}
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Notas</dt>
                <dd className="whitespace-pre-wrap">{l.notas ?? "—"}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 font-medium">Vínculos</h3>
              <ul className="space-y-1">
                <li>
                  Cliente:{" "}
                  {l.clienteV ? (
                    <Link to="/clientes" className="underline">{`${l.clienteV.nombres} ${l.clienteV.apellidos}`}</Link>
                  ) : "—"}
                </li>
                <li>
                  Apartado:{" "}
                  {l.reservaV ? (
                    <Link to="/apartados" className="underline">
                      {fecha(l.reservaV.fecha)} ({l.reservaV.estado_aprobacion})
                    </Link>
                  ) : "—"}
                </li>
                <li>
                  Venta:{" "}
                  {l.ventaV ? (
                    <Link to="/ventas" search={{ venta: l.ventaV.id }} className="underline">
                      {fecha(l.ventaV.fecha_venta)}
                    </Link>
                  ) : "—"}
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-medium">Historial de etapas</h3>
              <ul className="space-y-1">
                {(historial.data ?? []).map((h) => (
                  <li key={h.id} className="flex justify-between gap-2 border-b border-border pb-1">
                    <span>
                      {h.etapa_anterior ? `${ETIQUETA_ETAPA[h.etapa_anterior]} → ` : ""}
                      {ETIQUETA_ETAPA[h.etapa_nueva]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fechaHora(h.fecha_hora)} · {nombrePerfil(h.usuario_id)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditar(true)}>Editar</Button>
              {l.etapa === "separo" && !l.reserva_id ? (
                <Button variant="outline" onClick={() => onSepara({ ...l, vendedor: l.vendedor })}>
                  Registrar apartado
                </Button>
              ) : null}
              {admin ? (
                <Button variant="destructive" onClick={() => setEliminar(true)}>Eliminar</Button>
              ) : null}
            </div>
            {eliminar ? (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                <Label>Motivo de eliminación</Label>
                <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEliminar(false)}>Cancelar</Button>
                  <Button variant="destructive" size="sm" onClick={confirmarEliminar}>Confirmar</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
        )}
        {editar && l ? <DialogoLead lead={l} onCerrar={() => setEditar(false)} onSepara={onSepara} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
