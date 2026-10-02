import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectorCliente } from "@/components/SelectorCliente";
import { CampoSoles } from "@/components/CampoSoles";
import { CamposMetodo } from "@/components/MetodoPago";
import { CampoOrigen, origenAColumnas, origenDeFila, validarOrigen, type Origen } from "@/lib/leads";
import { nombreCliente, documentoCliente, useLotesConEstado, type Cliente, type Venta } from "@/lib/ventas";
import { nombreVendedor, useVendedores } from "@/lib/vendedores";
import { llevaOperacion, ETIQUETA_CUOTA } from "@/lib/cobranza";
import { fecha, soles } from "@/lib/format";

type Rpc = (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export function DialogoEditarVenta({
  venta,
  bloqueadoDesistimiento,
  onCerrar,
}: {
  venta: Venta;
  bloqueadoDesistimiento: boolean;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const vendedores = useVendedores();
  const lotes = useLotesConEstado();
  const hist = venta.es_historica || venta.importada;

  const [principal, setPrincipal] = useState<Cliente | null>(null);
  const [adicionales, setAdicionales] = useState<Cliente[]>([]);
  const [titOriginal, setTitOriginal] = useState<string[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [origen, setOrigen] = useState<Origen>(origenDeFila(venta));
  const [fechaFirma, setFechaFirma] = useState(venta.fecha_firma ?? "");
  const [formaPago, setFormaPago] = useState(venta.forma_pago_inicial ?? "");
  const [operacion, setOperacion] = useState(venta.operacion_inicial ?? "");
  const [notas, setNotas] = useState(venta.notas ?? "");
  const [fechaVenta, setFechaVenta] = useState(venta.fecha_venta);
  const [encargadoId, setEncargadoId] = useState(venta.encargado_id ?? "");
  const [precio, setPrecio] = useState(String(venta.precio_acordado));
  const [inicial, setInicial] = useState(String(venta.inicial));
  const [plazo, setPlazo] = useState(String(venta.plazo_meses));
  const [condicion, setCondicion] = useState(venta.condicion);
  const [primeraCuota, setPrimeraCuota] = useState(venta.fecha_primera_cuota ?? "");
  const [motivoPrecio, setMotivoPrecio] = useState(venta.motivo_diferencia_precio ?? "");
  const [loteId, setLoteId] = useState(venta.lote_id);
  const [precioLista, setPrecioLista] = useState(String(venta.precio_lista_momento ?? ""));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    supabase
      .from("venta_titular")
      .select("es_principal, creado_en, cliente:cliente_id(*)")
      .eq("venta_id", venta.id)
      .eq("anulado", false)
      .order("creado_en")
      .then(({ data }) => {
        const filas = (data ?? []) as unknown as { es_principal: boolean; cliente: Cliente }[];
        const p = filas.find((f) => f.es_principal)?.cliente ?? null;
        const a = filas.filter((f) => !f.es_principal).map((f) => f.cliente);
        setPrincipal(p);
        setAdicionales(a);
        setTitOriginal([...(p ? [p.id] : []), ...a.map((c) => c.id)]);
      });
  }, [venta.id]);

  const inicialMinima = useQuery({
    queryKey: ["config-valor", "inicial_minima"],
    queryFn: async () => {
      const { data, error } = await rpc("inicial_minima", {});
      if (error) throw error;
      return data == null ? null : Number(data);
    },
  });

  const lista = (vendedores.data ?? []).filter((x) => hist || x.estado === "activo" || x.id === venta.encargado_id || x.id === venta.promotor_id);
  const encargados = lista.filter((x) => x.tipo === "encargado");
  const promotores = lista.filter((x) => x.tipo === "promotor");
  const lotesLibres = (lotes.data ?? []).filter(
    (l) => l.id === venta.lote_id || (l.estado === "disponible" && l.area_m2 !== null && l.precio_lista !== null),
  );

  const precioNum = Number(precio || 0);
  const plazoNum = condicion === "contado" ? 1 : Number(plazo || 0);
  const inicialNum = condicion === "contado" ? precioNum : Number(inicial || 0);
  const cambiaCrono =
    precioNum !== Number(venta.precio_acordado) ||
    inicialNum !== Number(venta.inicial) ||
    plazoNum !== venta.plazo_meses ||
    condicion !== venta.condicion ||
    primeraCuota !== (venta.fecha_primera_cuota ?? "");
  const cambiaLote = loteId !== venta.lote_id;
  const cambiaRecalc = fechaVenta !== venta.fecha_venta || encargadoId !== (venta.encargado_id ?? "");

  const comision = useQuery({
    queryKey: ["comision-venta-estado", venta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("comision")
        .select("estado")
        .eq("venta_id", venta.id)
        .eq("tipo", "comision")
        .neq("estado", "anulada")
        .maybeSingle();
      return data?.estado ?? null;
    },
  });
  const comisionPagada = ["pagada", "cobrada_vendedor", "pagada_antes_crm"].includes(comision.data ?? "");

  const vista = useQuery({
    queryKey: ["simular-edicion", venta.id, precioNum, inicialNum, plazoNum, fechaVenta, primeraCuota, condicion],
    enabled: cambiaCrono && precioNum > 0 && plazoNum >= 1 && !!primeraCuota && !bloqueadoDesistimiento,
    queryFn: async () => {
      const { data, error } = await rpc("simular_edicion_venta", {
        _venta_id: venta.id, _precio_acordado: precioNum, _inicial: inicialNum, _plazo_meses: plazoNum,
        _fecha_venta: fechaVenta, _fecha_primera_cuota: primeraCuota, _condicion: condicion,
      });
      if (error) throw error;
      return data as { numero: number; fecha_vencimiento: string; monto: number; pagado: number; saldo: number; estado: string }[];
    },
  });

  const pagosTotal = useQuery({
    queryKey: ["pagos-total-venta", venta.id],
    queryFn: async () => {
      const { data } = await supabase.from("pago").select("monto").eq("venta_id", venta.id).eq("anulado", false);
      return (data ?? []).reduce((t, p) => t + Number(p.monto), 0);
    },
  });
  const excede = cambiaCrono && (pagosTotal.data ?? 0) > precioNum + 0.005;
  const inicialBaja =
    condicion === "financiado" && inicialMinima.data != null && inicialNum < inicialMinima.data && inicialNum !== Number(venta.inicial);

  async function guardar() {
    if (!motivo.trim()) { toast.error("Indica el motivo de la edición"); return; }
    if (!principal) { toast.error("Elige el titular principal"); return; }
    const errO = validarOrigen(origen, true);
    if (errO) { toast.error(errO); return; }
    if (bloqueadoDesistimiento && (cambiaCrono || cambiaLote)) {
      toast.error("No se puede modificar mientras la venta tenga un desistimiento"); return;
    }
    if (excede) { toast.error(`Los pagos registrados (${soles(pagosTotal.data)}) superan el nuevo precio acordado`); return; }
    if (inicialBaja && !hist) { toast.error(`La cuota inicial mínima es ${soles(inicialMinima.data)}.`); return; }
    const titulares = [principal.id, ...adicionales.map((c) => c.id)];
    setGuardando(true);
    const { data, error } = await rpc("editar_venta", {
      _venta_id: venta.id,
      _cambios: {
        ...origenAColumnas(origen), origen: origen.origen,
        fecha_firma: fechaFirma || null,
        forma_pago_inicial: formaPago || venta.forma_pago_inicial,
        operacion_inicial: llevaOperacion(formaPago) ? operacion.trim() || null : null,
        notas: notas.trim() || null,
        fecha_venta: fechaVenta,
        encargado_id: encargadoId || null,
        precio_acordado: precioNum, inicial: inicialNum, plazo_meses: plazoNum, condicion,
        fecha_primera_cuota: primeraCuota || null,
        motivo_diferencia_precio: motivoPrecio.trim() || null,
        lote_id: loteId,
        precio_lista_momento: precioLista === "" ? null : Number(precioLista),
      },
      _titulares: titulares.join() === titOriginal.join() ? null : titulares,
      _motivo: motivo.trim(),
    });
    setGuardando(false);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    const avisos = ((data as { avisos?: string[] } | null)?.avisos ?? []);
    avisos.forEach((a) => toast.warning(a));
    toast.success("Venta actualizada");
    qc.invalidateQueries();
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onCerrar() : null)}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Editar venta</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm font-medium">Datos generales</p>
          <div className="sm:col-span-2">
            <SelectorCliente label="Titular principal" valor={principal} onCambio={setPrincipal} />
          </div>
          <div className="sm:col-span-2">
            <Label>Titulares adicionales</Label>
            <div className="space-y-1">
              {adicionales.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="flex-1">{nombreCliente(c)} <span className="text-xs text-muted-foreground">({documentoCliente(c)})</span></span>
                  <Button size="sm" variant="ghost" onClick={() => setAdicionales((a) => a.filter((x) => x.id !== c.id))}>Quitar</Button>
                </div>
              ))}
              {agregando ? (
                <SelectorCliente label="Buscar copropietario" valor={null} onCambio={(c) => {
                  if (c && c.id !== principal?.id) setAdicionales((a) => (a.some((x) => x.id === c.id) ? a : [...a, c]));
                  setAgregando(false);
                }} />
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setAgregando(true)}>+ Agregar copropietario</Button>
              )}
            </div>
          </div>
          <CampoOrigen
            valor={origen}
            onCambio={setOrigen}
            promotores={promotores.map((p) => ({ id: p.id, nombre: nombreVendedor(p) }))}
            sinDato={venta.importada}
          />
          <div>
            <Label>Fecha de firma</Label>
            <Input type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)} />
          </div>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <CamposMetodo metodo={formaPago} operacion={operacion} onMetodo={setFormaPago} onOperacion={setOperacion} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <p className="sm:col-span-2 mt-2 text-sm font-medium">Comisiones e incentivos</p>
          <div>
            <Label>Fecha de venta</Label>
            <Input type="date" value={fechaVenta} onChange={(e) => setFechaVenta(e.target.value)} />
          </div>
          <div>
            <Label>Encargado</Label>
            <Select value={encargadoId} onValueChange={setEncargadoId}>
              <SelectTrigger><SelectValue placeholder="Elige el encargado" /></SelectTrigger>
              <SelectContent>
                {encargados.map((e) => <SelectItem key={e.id} value={e.id}>{nombreVendedor(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {cambiaRecalc && comisionPagada ? (
            <p className="sm:col-span-2 text-xs text-destructive">La comisión de esta venta ya fue pagada; el cambio no la modifica</p>
          ) : null}

          <p className="sm:col-span-2 mt-2 text-sm font-medium">Cronograma y lote</p>
          {bloqueadoDesistimiento ? (
            <p className="sm:col-span-2 text-xs text-destructive">No se puede modificar mientras la venta tenga un desistimiento</p>
          ) : null}
          <div className="sm:col-span-2">
            <Label>Lote</Label>
            <Select value={loteId} onValueChange={setLoteId} disabled={bloqueadoDesistimiento}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lotesLibres.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.etiqueta}{l.id === venta.lote_id ? " (actual)" : ` — ${soles(l.precio_lista)}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Precio de lista de la venta</Label>
            <CampoSoles valor={precioLista} onCambio={setPrecioLista} />
          </div>
          <div>
            <Label>Precio acordado</Label>
            <CampoSoles valor={precio} onCambio={setPrecio} />
          </div>
          <div className="sm:col-span-2">
            <Label>Motivo de la diferencia de precio</Label>
            <Input value={motivoPrecio} onChange={(e) => setMotivoPrecio(e.target.value)} />
          </div>
          <div>
            <Label>Condición</Label>
            <Select value={condicion} onValueChange={setCondicion} disabled={bloqueadoDesistimiento}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="financiado">Financiado</SelectItem>
                <SelectItem value="contado">Contado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {condicion === "financiado" ? (
            <>
              <div>
                <Label>Inicial</Label>
                <CampoSoles valor={inicial} onCambio={setInicial} />
                {inicialBaja ? (
                  <p className="mt-1 text-xs text-destructive">
                    {hist ? `La inicial es menor a ${soles(inicialMinima.data)}` : `La cuota inicial mínima es ${soles(inicialMinima.data)}.`}
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Plazo (meses)</Label>
                <Input value={plazo} onChange={(e) => setPlazo(e.target.value)} inputMode="numeric" disabled={bloqueadoDesistimiento} />
              </div>
            </>
          ) : null}
          <div>
            <Label>Fecha primera cuota</Label>
            <Input type="date" value={primeraCuota} onChange={(e) => setPrimeraCuota(e.target.value)} disabled={bloqueadoDesistimiento} />
          </div>

          {cambiaCrono && !bloqueadoDesistimiento ? (
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium">Vista previa del cronograma nuevo con los pagos aplicados</p>
              {excede ? (
                <p className="mb-2 text-xs text-destructive">Los pagos registrados ({soles(pagosTotal.data)}) superan el nuevo precio acordado</p>
              ) : null}
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead><TableHead>Vencimiento</TableHead>
                      <TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Pagado</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(vista.data ?? []).map((c) => (
                      <TableRow key={c.numero}>
                        <TableCell className="num">{c.numero === 0 ? "Inicial" : c.numero}</TableCell>
                        <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
                        <TableCell className="num text-right">{soles(c.monto)}</TableCell>
                        <TableCell className="num text-right">{soles(c.pagado)}</TableCell>
                        <TableCell>{ETIQUETA_CUOTA[c.estado] ?? c.estado}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Los pagos registrados no se modifican: solo se vuelven a aplicar en orden.</p>
            </div>
          ) : null}

          <div className="sm:col-span-2 mt-2">
            <Label>Motivo de la edición (obligatorio)</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || excede}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
