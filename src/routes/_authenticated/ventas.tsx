import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SelectorCliente } from "@/components/SelectorCliente";
import { CampoOrigen, ORIGEN_VACIO, origenAColumnas, origenDeFila, textoOrigen, validarOrigen, type Origen } from "@/lib/leads";
import {
  nombreCliente,
  documentoCliente,
  useLotesConEstado,
  type Cliente,
} from "@/lib/ventas";
import { fecha, hoyLima, soles, cantidad } from "@/lib/format";
import { usePerfil, puedeComercial, puedeElegirVendedor, puedeCobrar } from "@/lib/sesion";
import { nombreVendedor, useVendedores } from "@/lib/vendedores";
import { DialogoPago, DialogoRegularizar } from "@/components/PagoForm";
import { ETIQUETA_CUOTA, useCuotasDeVenta, usePagosDeVenta, llevaOperacion } from "@/lib/cobranza";
import { MostrarMetodo, DialogoEditarMetodo, CamposMetodo } from "@/components/MetodoPago";
import { DialogoEliminar } from "@/components/DialogoEliminar";
import { BotonHistorica } from "@/components/DialogoHistorica";
import { DialogoIniciarDesistimiento, DetalleDesistimiento, useDesistimientoDeVenta, ETIQUETA_DESISTIMIENTO } from "@/components/Desistimiento";

type Busqueda = {
  venta?: string | undefined;
  nuevoLote?: string | undefined;
  nuevoCliente?: string | undefined;
  reserva?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/ventas")({
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    venta: typeof s["venta"] === "string" ? s["venta"] : undefined,
    nuevoLote: typeof s["nuevoLote"] === "string" ? s["nuevoLote"] : undefined,
    nuevoCliente: typeof s["nuevoCliente"] === "string" ? s["nuevoCliente"] : undefined,
    reserva: typeof s["reserva"] === "string" ? s["reserva"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ventas — Gestión de lotes" },
      { name: "description", content: "Ventas de lotes con cronograma de cuotas." },
      { property: "og:title", content: "Ventas — Gestión de lotes" },
      { property: "og:description", content: "Ventas de lotes con cronograma de cuotas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VentasRuta,
});

function VentasRuta() {
  const { data: perfil, isLoading } = usePerfil();
  if (isLoading) return <AppShell titulo="Ventas"><p className="text-sm text-muted-foreground">Cargando…</p></AppShell>;
  if (perfil?.rol === "asesor") return <MisVentas />;
  return <VentasPage />;
}

const ETQ_ESTADO_VENTA: Record<string, string> = {
  pagando: "Pagando", cancelada: "Cancelada", anulada: "Anulada", desistida: "Desistida", en_desistimiento: "En desistimiento",
};

function MisVentas() {
  const q = useQuery({
    queryKey: ["mis-ventas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mis_ventas" as never);
      if (error) throw error;
      return (data ?? []) as unknown as {
        venta_id: string; lote: string; titular: string | null; fecha_venta: string;
        precio_acordado: number; estado: string; cuotas_pagadas: number; cuotas_total: number;
      }[];
    },
  });
  return (
    <AppShell titulo="Mis ventas" descripcion="Ventas donde eres el encargado (solo lectura)">
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Titular principal</TableHead>
              <TableHead>Fecha de venta</TableHead>
              <TableHead className="text-right">Precio acordado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Cuotas pagadas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Todavía no tienes ventas.</TableCell></TableRow>
            ) : null}
            {q.data?.map((v) => (
              <TableRow key={v.venta_id}>
                <TableCell>{v.lote}</TableCell>
                <TableCell>{v.titular ?? "—"}</TableCell>
                <TableCell>{fecha(v.fecha_venta)}</TableCell>
                <TableCell className="num text-right">{soles(v.precio_acordado)}</TableCell>
                <TableCell><Badge variant="outline">{ETQ_ESTADO_VENTA[v.estado] ?? v.estado}</Badge></TableCell>
                <TableCell className="num text-right">{v.cuotas_pagadas} de {v.cuotas_total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}

function VentasPage() {
  const busqueda = Route.useSearch();
  const navigate = useNavigate();
  const [alta, setAlta] = useState(false);
  const [vendedor, setVendedor] = useState("todos");
  const [manzana, setManzana] = useState("todas");
  const [estado, setEstado] = useState("activas");
  const vendedores = useVendedores();
  const { data: perfilSesion } = usePerfil();

  useEffect(() => {
    if (busqueda.nuevoLote) setAlta(true);
  }, [busqueda.nuevoLote]);

  const ventas = useQuery({
    queryKey: ["ventas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venta")
        .select(
          "*, lote:lote_id(numero, manzana:manzana_id(id, letra)), encargado:vendedor!venta_encargado_id_fkey(nombre, apodo, estado), promotor:vendedor!venta_promotor_id_fkey(nombre, apodo, estado), titulares:venta_titular(id, es_principal, anulado, cliente:cliente_id(id, nombres, apellidos, tipo_documento, numero_documento)), desistimientos:desistimiento(estado, anulado)",
        )
        .order("fecha_venta", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtradas = useMemo(() => {
    return (ventas.data ?? []).filter((v) => {
      if (vendedor !== "todos" && v.encargado_id !== vendedor) return false;
      if (manzana !== "todas" && v.lote?.manzana?.id !== manzana) return false;
      if (estado === "activas" && (v.anulado || v.desistida)) return false;
      if (estado === "anuladas" && !v.anulado) return false;
      return true;
    });
  }, [ventas.data, vendedor, manzana, estado]);

  const manzanas = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of ventas.data ?? []) {
      if (v.lote?.manzana) m.set(v.lote.manzana.id, v.lote.manzana.letra);
    }
    return [...m.entries()];
  }, [ventas.data]);

  const ventaAbierta = busqueda.venta ?? null;

  return (
    <AppShell
      titulo="Ventas"
      descripcion="Contratos de venta y su cronograma de cuotas"
      acciones={
        puedeComercial(perfilSesion) ? (
          <Button onClick={() => setAlta(true)}>+ Nueva venta</Button>
        ) : null
      }
    >
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end gap-3">
          <CardTitle className="mr-auto text-base">Listado</CardTitle>
          <Filtro label="Encargado" value={vendedor} onChange={setVendedor} opciones={[["todos", "Todos"], ...(vendedores.data ?? []).filter((x) => x.tipo === "encargado").map((x) => [x.id, nombreVendedor(x)] as [string, string])]} />
          <Filtro label="Manzana" value={manzana} onChange={setManzana} opciones={[["todas", "Todas"], ...manzanas.map(([id, l]) => [id, `Mz ${l}`] as [string, string])]} />
          <Filtro
            label="Estado"
            value={estado}
            onChange={setEstado}
            opciones={[
              ["activas", "Activas"],
              ["anuladas", "Anuladas"],
              ["todas", "Todas"],
            ]}
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Titular principal</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Condición</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No hay ventas registradas con esos filtros.
                  </TableCell>
                </TableRow>
              ) : null}
              {filtradas.map((v) => {
                const principal = v.titulares?.find((t) => t.es_principal && !t.anulado);
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      Mz {v.lote?.manzana?.letra} · Lote {v.lote?.numero}
                    </TableCell>
                    <TableCell>{nombreCliente(principal?.cliente)}</TableCell>
                    <TableCell>{fecha(v.fecha_venta)}</TableCell>
                    <TableCell className="capitalize">
                      {v.condicion}
                      {v.condicion === "financiado" ? ` · ${cantidad(v.plazo_meses, "cuotas")}` : ""}
                    </TableCell>
                    <TableCell className="num text-right">{soles(v.precio_acordado)}</TableCell>
                    <TableCell>
                      {nombreVendedor(v.encargado)}
                      <div className="text-xs text-muted-foreground">
                        {textoOrigen(v)}
                        {v.promotor ? ` · ${nombreVendedor(v.promotor)}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {v.anulado ? <Badge variant="outline">Anulada</Badge> : null}
                      {v.desistida ? <Badge variant="outline">Desistida</Badge> : null}
                      {!v.desistida && v.desistimientos?.some((d) => !d.anulado && d.estado === "en_proceso") ? (
                        <Badge variant="destructive">En desistimiento</Badge>
                      ) : null}{" "}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate({ to: "/ventas", search: { venta: v.id } })}
                      >
                        Ficha
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {alta ? (
        <DialogoVenta
          loteInicial={busqueda.nuevoLote ?? null}
          clienteInicial={busqueda.nuevoCliente ?? null}
          reservaOrigen={busqueda.reserva ?? null}
          onCerrar={() => {
            setAlta(false);
            navigate({ to: "/ventas", search: {} });
          }}
        />
      ) : null}

      <FichaVenta
        ventaId={ventaAbierta}
        onCerrar={() => navigate({ to: "/ventas", search: {} })}
      />
    </AppShell>
  );
}

function Filtro({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: [string, string][];
}) {
  return (
    <div className="w-44">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opciones.map(([v, t]) => (
            <SelectItem key={v} value={v}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DialogoVenta({
  loteInicial,
  clienteInicial,
  reservaOrigen,
  onCerrar,
}: {
  loteInicial: string | null;
  clienteInicial: string | null;
  reservaOrigen: string | null;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const lotes = useLotesConEstado();
  const vendedores = useVendedores();
  const [loteId, setLoteId] = useState(loteInicial ?? "");
  const [principal, setPrincipal] = useState<Cliente | null>(null);
  const [adicionales, setAdicionales] = useState<Cliente[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [encargadoId, setEncargadoId] = useState("");
  const [condicion, setCondicion] = useState("financiado");
  const [fechaVenta, setFechaVenta] = useState(hoyLima());
  const [fechaFirma, setFechaFirma] = useState("");
  const [precio, setPrecio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [inicial, setInicial] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [operacionInicial, setOperacionInicial] = useState("");
  const [plazo, setPlazo] = useState("12");
  const [primeraCuota, setPrimeraCuota] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const activos = (vendedores.data ?? []).filter((x) => x.estado === "activo");
  const encargadosElegibles = activos.filter(
    (x) => x.tipo === "encargado" && (puedeElegirVendedor(perfil) || (!!perfil && x.usuario_id === perfil.user_id)),
  );
  const promotores = activos.filter((x) => x.tipo === "promotor");

  const inicialMinima = useQuery({
    queryKey: ["config-valor", "inicial_minima"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("inicial_minima" as never);
      if (error) throw error;
      return data == null ? null : Number(data);
    },
  });
  useEffect(() => {
    if (inicialMinima.data != null && inicial === "") setInicial(String(inicialMinima.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicialMinima.data]);

  useEffect(() => {
    if (!encargadoId && encargadosElegibles.length === 1 && !puedeElegirVendedor(perfil)) {
      setEncargadoId(encargadosElegibles[0]!.id);
    }
  }, [encargadoId, encargadosElegibles, perfil]);

  function elegirPromotor(id: string | null) {
    const p = promotores.find((x) => x.id === id);
    if (p?.encargado_id && encargadosElegibles.some((e) => e.id === p.encargado_id)) {
      setEncargadoId(p.encargado_id);
    }
  }

  // Solo cuando la venta nace de un apartado específico: su encargado es el vendedor del asesor que lo registró
  const origenApartado = useQuery({
    queryKey: ["reserva-origen", reservaOrigen],
    enabled: !!reservaOrigen,
    queryFn: async (): Promise<{ clienteId: string; encargado: string | null; lead: Origen | null }> => {
      const { data: r, error } = await supabase
        .from("reserva")
        .select("creado_por, cliente_id, lead_id")
        .eq("id", reservaOrigen!)
        .single();
      if (error) throw error;
      let encargado: string | null = null;
      if (r.creado_por) {
        const { data: p } = await supabase.from("perfil").select("rol").eq("user_id", r.creado_por).maybeSingle();
        if (p?.rol === "asesor") {
          const { data: v } = await supabase
            .from("vendedor")
            .select("id")
            .eq("usuario_id", r.creado_por)
            .eq("tipo", "encargado")
            .eq("anulado", false)
            .maybeSingle();
          encargado = v?.id ?? null;
        }
      }
      let lead: Origen | null = null;
      if (r.lead_id) {
        const { data: l } = await supabase.from("lead").select("origen, fuente, promotor_id, referido_por_id").eq("id", r.lead_id).maybeSingle();
        if (l?.origen) lead = origenDeFila(l);
      }
      return { clienteId: r.cliente_id, encargado, lead };
    },
  });
  const encargadoApartado = { data: origenApartado.data?.encargado ?? null };
  const encFijo = encargadoApartado.data ?? null;
  const [motivoEncargado, setMotivoEncargado] = useState("");
  const [origenVenta, setOrigenVenta] = useState<Origen>(ORIGEN_VACIO);
  const leadOrigen = origenApartado.data?.lead ?? null;
  useEffect(() => {
    if (encFijo) setEncargadoId(encFijo);
  }, [encFijo]);

  useEffect(() => {
    if (!clienteInicial) return;
    supabase
      .from("cliente")
      .select("*")
      .eq("id", clienteInicial)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrincipal(data);
      });
  }, [clienteInicial]);

  const disponibles = (lotes.data ?? []).filter(
    (l) => l.estado !== "vendido" && l.area_m2 !== null && l.precio_lista !== null,
  );
  const lote = disponibles.find((l) => l.id === loteId) ?? null;

  useEffect(() => {
    if (lote && !precio) setPrecio(String(lote.precio_lista ?? ""));
  }, [lote, precio]);

  useEffect(() => {
    if (!primeraCuota && fechaVenta) {
      const d = new Date(`${fechaVenta}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 30);
      setPrimeraCuota(d.toISOString().slice(0, 10));
    }
  }, [fechaVenta, primeraCuota]);

  const plazoNum = condicion === "contado" ? 1 : Number(plazo || 0);
  const precioNum = Number(precio || 0);
  const inicialNum = Number(inicial || 0);

  const cronograma = useQuery({
    queryKey: ["simular", precioNum, inicialNum, plazoNum, fechaVenta, primeraCuota, condicion],
    enabled: precioNum > 0 && plazoNum >= 1 && !!fechaVenta && !!primeraCuota,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("simular_cronograma", {
        _precio_acordado: precioNum,
        _inicial: inicialNum,
        _plazo_meses: plazoNum,
        _fecha_venta: fechaVenta,
        _fecha_primera_cuota: primeraCuota,
        _condicion: condicion,
      });
      if (error) throw error;
      return data;
    },
  });

  const total = (cronograma.data ?? []).reduce((t, c) => t + Number(c.monto), 0);

  async function guardar() {
    if (!loteId || !principal || !encargadoId) {
      toast.error("Elige lote, cliente principal y encargado");
      return;
    }
    if (condicion === "financiado" && inicialMinima.data != null && inicialNum < inicialMinima.data) {
      toast.error(`La cuota inicial mínima es ${soles(inicialMinima.data)}.`);
      return;
    }
    const errOrigen = leadOrigen ? null : validarOrigen(origenVenta, true);
    if (errOrigen) {
      toast.error(errOrigen);
      return;
    }
    if (!formaPago) {
      toast.error("Elige la forma de pago de la inicial");
      return;
    }
    if (
      origenApartado.data &&
      principal.id !== origenApartado.data.clienteId &&
      !window.confirm("El titular no coincide con el cliente del apartado. ¿Guardar de todos modos?")
    ) {
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase
      .from("venta")
      .insert({
        reserva_origen_id: reservaOrigen,
        lote_id: loteId,
        fecha_venta: fechaVenta,
        fecha_firma: fechaFirma || null,
        encargado_id: encargadoId,
        motivo_cambio_encargado: encFijo && encargadoId !== encFijo ? motivoEncargado.trim() || null : null,
        ...origenAColumnas(leadOrigen ?? origenVenta),
        condicion,
        precio_acordado: precioNum,
        motivo_diferencia_precio: motivo.trim() || null,
        inicial: condicion === "contado" ? precioNum : inicialNum,
        forma_pago_inicial: formaPago,
        operacion_inicial: llevaOperacion(formaPago) ? operacionInicial.trim() || null : null,
        plazo_meses: plazoNum,
        fecha_primera_cuota: primeraCuota,
        notas: notas.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setGuardando(false);
      toast.error("No se pudo registrar la venta", { description: error?.message });
      return;
    }
    const titulares = [
      { venta_id: data.id, cliente_id: principal.id, es_principal: true },
      ...adicionales.map((c) => ({ venta_id: data.id, cliente_id: c.id, es_principal: false })),
    ];
    const { error: e2 } = await supabase.from("venta_titular").insert(titulares);
    setGuardando(false);
    if (e2) {
      toast.error("La venta se creó pero falló registrar titulares", { description: e2.message });
      return;
    }
    toast.success("Venta registrada");
    qc.invalidateQueries();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva venta</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Lote</Label>
            <Select value={loteId} onValueChange={setLoteId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un lote disponible" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.etiqueta} — {soles(l.precio_lista)} ({l.estado})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <SelectorCliente label="Titular principal" valor={principal} onCambio={setPrincipal} />
            {origenApartado.data && principal && principal.id !== origenApartado.data.clienteId ? (
              <p className="mt-1 text-xs text-destructive">El titular no coincide con el cliente del apartado</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <Label>Titulares adicionales</Label>
            <div className="space-y-1">
              {adicionales.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="flex-1">
                    {nombreCliente(c)} <span className="text-xs text-muted-foreground">({documentoCliente(c)})</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdicionales((a) => a.filter((x) => x.id !== c.id))}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              {agregando ? (
                <SelectorCliente
                  label="Buscar copropietario"
                  valor={null}
                  onCambio={(c) => {
                    if (c) setAdicionales((a) => (a.some((x) => x.id === c.id) ? a : [...a, c]));
                    setAgregando(false);
                  }}
                />
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setAgregando(true)}>
                  + Agregar copropietario
                </Button>
              )}
            </div>
          </div>

          {leadOrigen ? (
            <div className="sm:col-span-2 rounded-md border border-border px-3 py-2 text-sm">
              Origen: {textoOrigen({ origen: leadOrigen.origen, fuente: leadOrigen.fuente })}
              {leadOrigen.promotorId ? ` · ${nombreVendedor(promotores.find((p) => p.id === leadOrigen.promotorId) ?? (vendedores.data ?? []).find((p) => p.id === leadOrigen.promotorId) ?? null)}` : ""}{" "}
              <span className="text-xs text-muted-foreground">(se copia del lead del apartado)</span>
            </div>
          ) : (
            <CampoOrigen
              valor={origenVenta}
              onCambio={setOrigenVenta}
              promotores={promotores.map((p) => ({ id: p.id, nombre: nombreVendedor(p) }))}
              onPromotor={elegirPromotor}
            />
          )}
          <div>
            <Label>Encargado</Label>
            <Select
              value={encargadoId}
              onValueChange={setEncargadoId}
              disabled={!!encFijo && perfil?.rol !== "admin"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elige el encargado" />
              </SelectTrigger>
              <SelectContent>
                {encargadosElegibles.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{nombreVendedor(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {encFijo ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Este lote viene de un apartado registrado por un asesor: el encargado es su vendedor vinculado.
                {perfil?.rol === "admin" ? " Solo puedes cambiarlo indicando un motivo." : ""}
              </p>
            ) : null}
            {encFijo && encargadoId !== encFijo ? (
              <div className="mt-2">
                <Label>Motivo del cambio de encargado</Label>
                <Input value={motivoEncargado} onChange={(e) => setMotivoEncargado(e.target.value)} />
              </div>
            ) : null}
          </div>
          <div>
            <Label>Condición</Label>
            <Select value={condicion} onValueChange={setCondicion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="financiado">Financiado</SelectItem>
                <SelectItem value="contado">Contado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha de venta</Label>
            <Input type="date" value={fechaVenta} onChange={(e) => setFechaVenta(e.target.value)} />
          </div>
          <div>
            <Label>Fecha de firma (opcional)</Label>
            <Input type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)} />
          </div>
          <div>
            <Label>Precio de lista</Label>
            <Input value={lote ? soles(lote.precio_lista) : "—"} readOnly />
          </div>
          <div>
            <Label>Precio acordado</Label>
            <Input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" />
          </div>
          {lote && precioNum !== Number(lote.precio_lista) ? (
            <div className="sm:col-span-2">
              <Label>Motivo de la diferencia de precio</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          ) : null}
          {condicion === "financiado" ? (
            <>
              <div>
                <Label>Inicial</Label>
                <Input value={inicial} onChange={(e) => setInicial(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Plazo (meses)</Label>
                <Input value={plazo} onChange={(e) => setPlazo(e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <Label>Fecha primera cuota</Label>
                <Input type="date" value={primeraCuota} onChange={(e) => setPrimeraCuota(e.target.value)} />
              </div>
            </>
          ) : null}
          <CamposMetodo
            etiqueta="Forma de pago de la inicial"
            metodo={formaPago}
            operacion={operacionInicial}
            onMetodo={setFormaPago}
            onOperacion={setOperacionInicial}
          />
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Cronograma que se generará</p>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(cronograma.data ?? []).map((c) => (
                    <TableRow key={c.numero}>
                      <TableCell className="num">{c.numero === 0 ? "Inicial" : c.numero}</TableCell>
                      <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
                      <TableCell className="num text-right">{soles(c.monto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Suma del cronograma: <span className="num">{soles(total)}</span> · Precio acordado:{" "}
              <span className="num">{soles(precioNum)}</span>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            Confirmar venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FichaVenta({ ventaId, onCerrar }: { ventaId: string | null; onCerrar: () => void }) {
  const venta = useQuery({
    queryKey: ["venta", ventaId],
    enabled: !!ventaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venta")
        .select(
          "*, lote:lote_id(numero, area_m2, manzana:manzana_id(letra)), encargado:vendedor!venta_encargado_id_fkey(nombre, apodo, estado), promotor:vendedor!venta_promotor_id_fkey(nombre, apodo, estado), titulares:venta_titular(id, es_principal, anulado, cliente:cliente_id(nombres, apellidos, tipo_documento, numero_documento)), cuotas:cuota(id, numero, fecha_vencimiento, monto_original, monto_vigente, anulado)",
        )
        .eq("id", ventaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const cobra = puedeCobrar(perfil);
  const regulariza = perfil?.rol === "admin" || perfil?.rol === "cobranza";
  const cronograma = useCuotasDeVenta(ventaId);
  const pagos = usePagosDeVenta(ventaId);
  const [registrando, setRegistrando] = useState(false);
  const [regularizando, setRegularizando] = useState(false);
  const desist = useDesistimientoDeVenta(ventaId);
  const [iniciando, setIniciando] = useState(false);
  const [verDesist, setVerDesist] = useState<string | null>(null);
  const enProceso = desist.data?.estado === "en_proceso";
  const [anulando, setAnulando] = useState<{ id: string; grupo: boolean } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [editMetodo, setEditMetodo] = useState<{ id: string; regularizacion: boolean; metodo: string | null; operacion: string | null } | null>(null);

  const [editInicial, setEditInicial] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const v = venta.data;
  const cuotas = cronograma.data ?? [];
  const total = cuotas.reduce((t, c) => t + Number(c.monto_vigente), 0);
  const saldoTotal = cuotas.reduce((t, c) => t + Math.max(Number(c.saldo), 0), 0);

  type FilaPago = {
    key: string;
    id: string;
    regularizacion: boolean;
    cantidad: number;
    fechaDesde: string;
    fechaHasta: string;
    monto: number;
    metodo: string | null;
    operacion: string | null;
    aplicado: string;
    anulado: boolean;
  };
  const filasPago: FilaPago[] = [];
  const grupos = new Map<string, FilaPago>();
  for (const p of pagos.data ?? []) {
    const rp = p as typeof p & { regularizacion_id?: string | null };
    const apl = (p.aplicaciones ?? []).filter((a) => !a.anulado || p.anulado);
    const textos = apl.map(
      (a) => `${a.cuota?.numero === 0 ? "Inicial" : `Cuota ${a.cuota?.numero}`}: ${soles(a.monto_aplicado)}`,
    );
    const gid = rp.regularizacion_id;
    if (gid) {
      const k = `${gid}-${p.anulado}`;
      const g = grupos.get(k);
      if (g) {
        g.cantidad += 1;
        g.monto += Number(p.monto);
        if (p.fecha < g.fechaDesde) g.fechaDesde = p.fecha;
        if (p.fecha > g.fechaHasta) g.fechaHasta = p.fecha;
        g.aplicado = `${g.cantidad} pagos, ${g.cantidad === 1 ? textos.length : "una cuota c/u"}`;
        continue;
      }
      const fila: FilaPago = {
        key: k,
        id: gid,
        regularizacion: true,
        cantidad: 1,
        fechaDesde: p.fecha,
        fechaHasta: p.fecha,
        monto: Number(p.monto),
        metodo: p.metodo,
        operacion: p.numero_operacion,
        aplicado: apl.length > 3 ? cantidad(apl.length, "cuotas") : textos.join(" · "),
        anulado: p.anulado,
      };
      grupos.set(k, fila);
      filasPago.push(fila);
    } else {
      filasPago.push({
        key: p.id,
        id: p.id,
        regularizacion: false,
        cantidad: 1,
        fechaDesde: p.fecha,
        fechaHasta: p.fecha,
        monto: Number(p.monto),
        metodo: p.metodo,
        operacion: p.numero_operacion,
        aplicado: textos.join(" · "),
        anulado: p.anulado,
      });
    }
  }
  for (const g of grupos.values()) if (g.cantidad > 1) g.aplicado = cantidad(g.cantidad, "cuotas");

  async function anularPago() {
    if (!anulando) return;
    if (!motivo.trim()) {
      toast.error("Indica el motivo de la anulación");
      return;
    }
    const { error } = anulando.grupo
      ? await (supabase.rpc.bind(supabase) as unknown as (
          f: string,
          a: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>)("anular_regularizacion", {
          _regularizacion_id: anulando.id,
          _motivo: motivo.trim(),
        })
      : await supabase
          .from("pago")
          .update({ anulado: true, motivo_anulacion: motivo.trim() })
          .eq("id", anulando.id);
    if (error) {
      toast.error("No se pudo anular", { description: error.message });
      return;
    }
    toast.success("Anulado");
    setAnulando(null);
    setMotivo("");
    qc.invalidateQueries();
  }

  async function guardarMetodo(m: string, op: string | null) {
    if (!editMetodo) return null;
    const q = supabase.from("pago").update({ metodo: m, numero_operacion: op });
    const { error } = editMetodo.regularizacion
      ? await q.eq("regularizacion_id" as "id", editMetodo.id).eq("anulado", false)
      : await q.eq("id", editMetodo.id);
    if (error) return error.message;
    qc.invalidateQueries();
    return null;
  }

  return (
    <Sheet open={!!ventaId} onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {v ? `Venta Mz ${v.lote?.manzana?.letra} · Lote ${v.lote?.numero}` : "Venta"}
          </SheetTitle>
        </SheetHeader>
        {v ? (
          <div className="mt-4 space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <D k="Fecha de venta" v={fecha(v.fecha_venta)} />
              <D k="Fecha de firma" v={fecha(v.fecha_firma)} />
              <D k="Encargado" v={v.encargado ? nombreVendedor(v.encargado) : v.importada ? "— (venta importada)" : "—"} />
              <D k="Origen" v={textoOrigen(v)} />
              <D k="Promotor" v={v.promotor ? nombreVendedor(v.promotor) : "—"} />
              <D k="Condición" v={v.condicion} />
              <D k="Precio de lista al vender" v={soles(v.precio_lista_momento)} />
              <D k="Precio acordado" v={soles(v.precio_acordado)} />
              <D k="Inicial" v={soles(v.inicial)} />
              <div>
                <p className="text-xs text-muted-foreground">Forma de pago inicial</p>
                <MostrarMetodo metodo={v.forma_pago_inicial} operacion={(v as { operacion_inicial?: string | null }).operacion_inicial ?? null} />
                {perfil && puedeComercial(perfil) && !v.anulado ? (
                  <button type="button" className="block text-xs text-primary underline" onClick={() => setEditInicial(true)}>Editar</button>
                ) : null}
              </div>
              <D k="Plazo" v={`${v.plazo_meses} ${v.plazo_meses === 1 ? "cuota" : "cuotas"}`} />
              <D k="Primera cuota" v={fecha(v.fecha_primera_cuota)} />
            </div>
            {perfil?.rol === "admin" ? (
              <div className="flex justify-end">
                <Button size="sm" variant="destructive" onClick={() => setEliminando(true)}>Eliminar venta</Button>
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-xs text-muted-foreground">Venta histórica</p>
                <p>{v.es_historica ? "Sí — no genera comisión ni incentivo" : "No — genera comisión"}</p>
              </div>
              {perfil?.rol === "admin" && ventaId ? (
                <BotonHistorica ventaId={ventaId} esHistorica={v.es_historica} />
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-xs text-muted-foreground">Desistimiento</p>
                <p>
                  {v.desistida ? "Venta desistida" : desist.data ? ETIQUETA_DESISTIMIENTO[desist.data.estado] : "Sin desistimiento"}
                  {enProceso ? <Badge variant="destructive" className="ml-2">En desistimiento</Badge> : null}
                </p>
              </div>
              {desist.data ? (
                <Button size="sm" variant="outline" onClick={() => setVerDesist(desist.data!.id)}>Ver detalle</Button>
              ) : perfil?.rol === "admin" && !v.anulado && !v.desistida ? (
                <Button size="sm" variant="outline" onClick={() => setIniciando(true)}>Iniciar desistimiento</Button>
              ) : null}
            </div>
            {v.motivo_diferencia_precio ? (
              <D k="Motivo de la diferencia de precio" v={v.motivo_diferencia_precio} />
            ) : null}

            <div>
              <p className="mb-2 font-medium">Titulares</p>
              {v.titulares
                ?.filter((t) => !t.anulado)
                .map((t) => (
                  <div key={t.id} className="flex items-center justify-between border-b border-border py-1.5">
                    <span>{nombreCliente(t.cliente)}</span>
                    <span className="text-xs text-muted-foreground">{documentoCliente(t.cliente)}</span>
                    {t.es_principal ? <Badge>Principal</Badge> : null}
                  </div>
                ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">Cronograma</p>
                <div className="flex gap-2">
                  {cobra && !v.anulado && !v.desistida && !enProceso ? (
                    <Button size="sm" onClick={() => setRegistrando(true)}>
                      Registrar pago
                    </Button>
                  ) : null}
                  {regulariza && !v.anulado && !v.desistida && !enProceso && saldoTotal > 0.005 ? (
                    <Button size="sm" variant="outline" onClick={() => setRegularizando(true)}>
                      Marcar como pagada
                    </Button>
                  ) : null}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuotas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="num">{c.numero === 0 ? "Inicial" : c.numero}</TableCell>
                      <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
                      <TableCell className="num text-right">{soles(c.monto_vigente)}</TableCell>
                      <TableCell className="num text-right">{soles(c.monto_pagado)}</TableCell>
                      <TableCell className="num text-right">{soles(Math.max(c.saldo, 0))}</TableCell>
                      <TableCell>
                        <Badge variant={c.estado === "pagada" ? "secondary" : "outline"}>
                          {ETIQUETA_CUOTA[c.estado] ?? c.estado}
                        </Badge>{" "}
                        {c.vencida ? <Badge variant="destructive">Vencida</Badge> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                Total del cronograma: <span className="num">{soles(total)}</span> · Saldo por
                cobrar: <span className="num">{soles(saldoTotal)}</span>
              </p>
            </div>

            <div>
              <p className="mb-2 font-medium">Pagos registrados</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Aplicado a</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasPago.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Todavía no hay pagos.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {filasPago.map((f) => (
                    <TableRow key={f.key} className={f.anulado ? "opacity-50" : ""}>
                      <TableCell>
                        {f.fechaDesde === f.fechaHasta
                          ? fecha(f.fechaDesde)
                          : `${fecha(f.fechaDesde)} – ${fecha(f.fechaHasta)}`}
                        {f.regularizacion ? (
                          <Badge variant="secondary" className="mt-1 block w-fit">
                            Regularización{f.cantidad > 1 ? ` · ${f.cantidad} pagos` : ""}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="num text-right">{soles(f.monto)}</TableCell>
                      <TableCell>
                        <MostrarMetodo metodo={f.metodo} operacion={f.operacion} />
                        {cobra && !f.anulado ? (
                          <button
                            type="button"
                            className="block text-xs text-primary underline"
                            onClick={() => setEditMetodo(f)}
                          >
                            Editar
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">{f.aplicado || "—"}</TableCell>
                      <TableCell className="text-right">
                        {f.anulado ? (
                          <Badge variant="destructive">Anulado</Badge>
                        ) : cobra ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAnulando({ id: f.id, grupo: f.regularizacion })}
                          >
                            Anular
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {v && ventaId ? (
          <>
            <DialogoEditarMetodo
              abierto={editInicial}
              inicial={{ metodo: v.forma_pago_inicial, operacion: (v as { operacion_inicial?: string | null }).operacion_inicial ?? null }}
              onCambio={setEditInicial}
              onGuardar={async (m, op) => {
                const { error } = await supabase
                  .from("venta")
                  .update({ forma_pago_inicial: m, operacion_inicial: op } as never)
                  .eq("id", ventaId);
                if (error) return error.message;
                qc.invalidateQueries();
                return null;
              }}
            />
            <DialogoEliminar
              titulo="Eliminar venta"
              abierto={eliminando}
              onCambio={setEliminando}
              onConfirmar={async (motivo) => {
                const { error } = await supabase.rpc("eliminar_venta" as never, { _venta_id: ventaId, _motivo: motivo } as never);
                if (error) return error.message;
                qc.invalidateQueries();
                onCerrar();
                return null;
              }}
            >
              <div className="text-sm">
                <p>Lote: Mz {v.lote?.manzana?.letra} · Lote {v.lote?.numero}</p>
                <p>Titular principal: {(() => { const t = v.titulares?.find((x) => x.es_principal && !x.anulado)?.cliente; return t ? `${t.apellidos} ${t.nombres}` : "—"; })()}</p>
                <p>Total abonado: {soles((pagos.data ?? []).filter((p) => !p.anulado).reduce((t, p) => t + Number(p.monto), 0))}</p>
                <p>Pagos que se borrarán: {(pagos.data ?? []).length}</p>
              </div>
            </DialogoEliminar>
          </>
        ) : null}
        <DialogoEditarMetodo
          abierto={!!editMetodo}
          inicial={{ metodo: editMetodo?.metodo ?? null, operacion: editMetodo?.operacion ?? null }}
          onCambio={(o) => (!o ? setEditMetodo(null) : null)}
          onGuardar={guardarMetodo}
        />
        {registrando && ventaId ? (
          <DialogoPago ventaId={ventaId} onCerrar={() => setRegistrando(false)} />
        ) : null}
        {ventaId ? (
          <DialogoIniciarDesistimiento ventaId={ventaId} abierto={iniciando} onCambio={setIniciando} />
        ) : null}
        <DetalleDesistimiento id={verDesist} onCerrar={() => setVerDesist(null)} />
        {regularizando && ventaId && v ? (
          <DialogoRegularizar
            ventaId={ventaId}
            fechaVenta={v.fecha_venta}
            onCerrar={() => setRegularizando(false)}
          />
        ) : null}

        <Dialog open={!!anulando} onOpenChange={(o) => (!o ? setAnulando(null) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{anulando?.grupo ? "Anular regularización" : "Anular pago"}</DialogTitle>
            </DialogHeader>
            {anulando?.grupo ? (
              <p className="text-sm text-muted-foreground">
                Se anularán juntos todos los pagos de esta regularización.
              </p>
            ) : null}
            <div>
              <Label>Motivo de la anulación</Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAnulando(null)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={anularPago}>
                Anular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function D({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="capitalize">{v}</p>
    </div>
  );
}
