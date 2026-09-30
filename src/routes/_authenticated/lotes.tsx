import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Upload, Pencil, AlertTriangle, Download, FileDown, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { EnlaceLote } from "@/components/EnlaceLote";
import { etiquetaEstadoLote } from "@/lib/cobranza";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useLotesConEstado } from "@/lib/ventas";
import { usePerfil, puedeEditarEstructura, esAdmin } from "@/lib/sesion";
import { soles, numero, cantidad, fecha, hoyLima } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Lote = Database["public"]["Tables"]["lote"]["Row"];

const CAMPOS_NUMERICOS = [
  ["area_m2", "Área (m²)"],
  ["precio_lista", "Precio de lista (S/)"],
] as const;

function estaPendiente(l: Lote) {
  return CAMPOS_NUMERICOS.some(([campo]) => l[campo] === null || l[campo] === undefined);
}

type LoteConEstado = Lote & { estado: string; saldo_pendiente: number | null };

export const Route = createFileRoute("/_authenticated/lotes")({
  head: () => ({
    meta: [
      { title: "Lotes — Gestión de lotes" },
      { name: "description", content: "Listado, alta e importación de lotes." },
      { property: "og:title", content: "Lotes — Gestión de lotes" },
      { property: "og:description", content: "Listado, alta e importación de lotes." },
    ],
  }),
  component: LotesRuta,
});

function LotesRuta() {
  const { data: perfil, isLoading } = usePerfil();
  if (isLoading) return null;
  if (perfil?.rol === "asesor") return <LotesAsesor />;
  return <LotesPage />;
}

/** Vista del asesor: solo lotes Libres con datos completos, desde la función segura. */
function LotesAsesor() {
  const navigate = useNavigate();
  const lotes = useLotesConEstado(true);
  const [texto, setTexto] = useState("");
  const filas = (lotes.data ?? []).filter((l) => !texto.trim() || l.etiqueta.toLowerCase().includes(texto.trim().toLowerCase()));
  return (
    <AppShell titulo="Lotes" descripcion="Lotes libres disponibles para apartar">
      <div className="mb-3 max-w-xs">
        <Input placeholder="Buscar manzana o lote" value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manzana</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Área (m²)</TableHead>
              <TableHead className="text-right">Precio de lista</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">{lotes.isLoading ? "Cargando…" : "No hay lotes libres."}</TableCell></TableRow>
            ) : null}
            {filas.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.manzana_letra}</TableCell>
                <TableCell>{l.numero}</TableCell>
                <TableCell className="num text-right">{l.area_m2}</TableCell>
                <TableCell className="num text-right">{l.precio_lista == null ? "—" : soles(l.precio_lista)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => navigate({ to: "/apartados", search: { nuevoLote: l.id } })}>Apartar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}

type Orden = { col: ColId; dir: "asc" | "desc" } | null;
type ColId = "manzana" | "lote" | "area" | "lista" | "venta" | "m2" | "fecha" | "estado";
type FilaLote = Lote & {
  estadoVenta: "libre" | "apartado" | "vendido";
  etapaNombre: string;
  manzanaLetra: string;
  ventaId: string | null;
  precioVenta: number | null;
  fechaVenta: string | null;
  precioM2: number | null;
};

const colNat = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const ETIQUETA_ESTADO = { libre: "Libre", apartado: "Apartado", vendido: "Vendido" } as const;

function compararDefecto(a: FilaLote, b: FilaLote) {
  return colNat.compare(a.etapaNombre, b.etapaNombre) || colNat.compare(a.manzanaLetra, b.manzanaLetra) || a.numero - b.numero;
}

function valorCol(l: FilaLote, c: ColId): string | number | null {
  switch (c) {
    case "manzana": return l.manzanaLetra || null;
    case "lote": return l.numero;
    case "area": return l.area_m2 == null ? null : Number(l.area_m2);
    case "lista": return l.precio_lista == null ? null : Number(l.precio_lista);
    case "venta": return l.precioVenta;
    case "m2": return l.precioM2;
    case "fecha": return l.fechaVenta;
    case "estado": return ETIQUETA_ESTADO[l.estadoVenta];
  }
}

function LotesPage() {
  const { data: perfil } = usePerfil();
  const editable = puedeEditarEstructura(perfil);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [proyectoId, setProyectoId] = useState<string>("");
  const [etapaId, setEtapaId] = useState<string>("");
  const [manzanaId, setManzanaId] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroDatos, setFiltroDatos] = useState<string>("todos");
  const [verM2, setVerM2] = useState(true);
  const [orden, setOrden] = useState<Orden>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const proyectos = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proyecto").select("*").order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const etapas = useQuery({
    queryKey: ["etapas", proyectoId],
    enabled: !!proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("etapa").select("*").eq("proyecto_id", proyectoId).order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const manzanas = useQuery({
    queryKey: ["manzanas-ambito", proyectoId, etapaId],
    queryFn: async () => {
      let consulta = supabase
        .from("manzana")
        .select("id, letra, etapa_id, tipo, etapa!inner(proyecto_id, nombre)")
        .eq("tipo", "residencial");
      if (etapaId) consulta = consulta.eq("etapa_id", etapaId);
      else if (proyectoId) consulta = consulta.eq("etapa.proyecto_id", proyectoId);
      const { data, error } = await consulta.order("letra");
      if (error) throw error;
      return [...data].sort((a, b) => colNat.compare(a.etapa?.nombre ?? "", b.etapa?.nombre ?? "") || colNat.compare(a.letra, b.letra));
    },
  });

  const idsManzana = useMemo(() => (manzanas.data ?? []).map((m) => m.id), [manzanas.data]);
  const mapaManzana = useMemo(
    () => new Map((manzanas.data ?? []).map((m) => [m.id, { letra: m.letra, etapa: m.etapa?.nombre ?? "" }])),
    [manzanas.data],
  );

  const lotes = useQuery({
    queryKey: ["lotes", manzanaId, idsManzana.join(",")],
    enabled: manzanas.isSuccess,
    queryFn: async () => {
      let consulta = supabase.from("lote").select("*").eq("anulado", false).order("numero");
      if (manzanaId) consulta = consulta.eq("manzana_id", manzanaId);
      else consulta = consulta.in("manzana_id", idsManzana.length > 0 ? idsManzana : ["00000000-0000-0000-0000-000000000000"]);
      const { data, error } = await consulta.limit(5000);
      if (error) throw error;
      return data;
    },
  });

  const estados = useQuery({
    queryKey: ["lote-estados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lote_estado").select("lote_id, estado");
      if (error) throw error;
      return data;
    },
  });

  const ventas = useQuery({
    queryKey: ["lotes-ventas-vigentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venta")
        .select("id, lote_id, precio_acordado, fecha_venta")
        .eq("anulado", false)
        .eq("desistida", false)
        .limit(5000);
      if (error) throw error;
      return data;
    },
  });

  const filas = useMemo<FilaLote[]>(() => {
    const est = new Map((estados.data ?? []).map((e) => [e.lote_id, e.estado]));
    const ven = new Map((ventas.data ?? []).map((v) => [v.lote_id, v]));
    return (lotes.data ?? []).map((l) => {
      const v = ven.get(l.id);
      const e = est.get(l.id);
      const estadoVenta: FilaLote["estadoVenta"] = v ? "vendido" : e === "apartado" ? "apartado" : "libre";
      const area = l.area_m2 == null ? null : Number(l.area_m2);
      const base = v ? Number(v.precio_acordado) : l.precio_lista == null ? null : Number(l.precio_lista);
      const mz = mapaManzana.get(l.manzana_id);
      return {
        ...l,
        estadoVenta,
        etapaNombre: mz?.etapa ?? "",
        manzanaLetra: mz?.letra ?? "",
        ventaId: v?.id ?? null,
        precioVenta: v ? Number(v.precio_acordado) : null,
        fechaVenta: v?.fecha_venta ?? null,
        precioM2: area && base != null ? base / area : null,
      };
    });
  }, [lotes.data, estados.data, ventas.data, mapaManzana]);

  const filtrados = useMemo(() => {
    let lista = filas;
    if (filtroEstado !== "todos") lista = lista.filter((l) => l.estadoVenta === filtroEstado);
    if (filtroDatos === "pendiente") lista = lista.filter(estaPendiente);
    if (filtroDatos === "completo") lista = lista.filter((l) => !estaPendiente(l));
    if (busqueda.trim()) {
      const b = busqueda.trim().toLowerCase();
      lista = lista.filter((l) => String(l.numero).includes(b) || l.manzanaLetra.toLowerCase().includes(b));
    }
    const ordenada = [...lista];
    if (!orden) ordenada.sort(compararDefecto);
    else {
      ordenada.sort((a, b) => {
        const va = valorCol(a, orden.col);
        const vb = valorCol(b, orden.col);
        if (va == null && vb == null) return compararDefecto(a, b);
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = typeof va === "number" && typeof vb === "number" ? va - vb : colNat.compare(String(va), String(vb));
        return (orden.dir === "asc" ? c : -c) || compararDefecto(a, b);
      });
    }
    return ordenada;
  }, [filas, filtroEstado, filtroDatos, busqueda, orden]);

  const resumen = useMemo(() => {
    const r = { libre: 0, apartado: 0, vendido: 0, area: 0, valorLista: 0, valorVendido: 0 };
    for (const l of filtrados) {
      r[l.estadoVenta]++;
      r.area += Number(l.area_m2 ?? 0);
      if (l.estadoVenta === "libre") r.valorLista += Number(l.precio_lista ?? 0);
      if (l.precioVenta != null) r.valorVendido += l.precioVenta;
    }
    return r;
  }, [filtrados]);

  const pendientes = filas.filter(estaPendiente).length;
  const libresVisibles = filtrados.filter((l) => l.estadoVenta === "libre");
  const seleccionados = libresVisibles.filter((l) => seleccion.has(l.id));

  function refrescar() {
    qc.invalidateQueries({ queryKey: ["lotes"] });
    qc.invalidateQueries({ queryKey: ["lote-estados"] });
  }

  function limpiarSeleccion(nivel: "proyecto" | "etapa") {
    if (nivel === "proyecto") { setEtapaId(""); setManzanaId(""); } else setManzanaId("");
  }

  function clicOrden(col: ColId) {
    setOrden((o) => (!o || o.col !== col ? { col, dir: "asc" } : o.dir === "asc" ? { col, dir: "desc" } : null));
  }

  function Encabezado({ col, children, derecha }: { col: ColId; children: React.ReactNode; derecha?: boolean }) {
    const activo = orden?.col === col;
    const Icono = !activo ? ArrowUpDown : orden!.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={derecha ? "text-right" : undefined}>
        <button type="button" onClick={() => clicOrden(col)} className={`inline-flex items-center gap-1 ${activo ? "text-foreground" : ""}`}>
          {children}
          <Icono className={`h-3 w-3 ${activo ? "" : "opacity-40"}`} />
        </button>
      </TableHead>
    );
  }

  function exportar() {
    const datos = filtrados.map((l) => ({
      Etapa: l.etapaNombre,
      Manzana: l.manzanaLetra,
      Lote: l.numero,
      "Área m²": l.area_m2 == null ? null : Number(l.area_m2),
      "Precio de lista": l.precio_lista == null ? null : Number(l.precio_lista),
      "Precio de venta": l.precioVenta,
      "Precio por m²": l.precioM2 == null ? null : Math.round(l.precioM2 * 100) / 100,
      "Fecha de venta": l.fechaVenta ? fecha(l.fechaVenta) : null,
      "Estado de venta": ETIQUETA_ESTADO[l.estadoVenta],
      Datos: estaPendiente(l) ? "Pendiente" : "Completo",
    }));
    const hoja = XLSX.utils.json_to_sheet(datos);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Lotes");
    XLSX.writeFile(libro, `lotes_${hoyLima()}.xlsx`);
  }

  const columnas = verM2 ? 10 : 9;

  return (
    <AppShell
      titulo="Lotes"
      descripcion={`${cantidad(filtrados.length, "lotes")} · ${pendientes} con datos pendientes`}
      acciones={
        <>
          {editable ? <AgregarLotes manzanas={manzanas.data ?? []} onListo={refrescar} /> : null}
          {editable && esAdmin(perfil) ? <ImportarExcel onListo={refrescar} /> : null}
          <Button variant="outline" onClick={exportar} disabled={filtrados.length === 0}>
            <FileDown className="mr-1 h-4 w-4" /> Exportar Excel
          </Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1">
          <Label>Proyecto</Label>
          <Select value={proyectoId || "todos"} onValueChange={(v) => { setProyectoId(v === "todos" ? "" : v); limpiarSeleccion("proyecto"); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {proyectos.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Etapa</Label>
          <Select value={etapaId || "todas"} onValueChange={(v) => { setEtapaId(v === "todas" ? "" : v); limpiarSeleccion("etapa"); }} disabled={!proyectoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos</SelectItem>
              {etapas.data?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Manzana</Label>
          <Select value={manzanaId || "todas"} onValueChange={(v) => setManzanaId(v === "todas" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos</SelectItem>
              {manzanas.data?.map((m) => <SelectItem key={m.id} value={m.id}>Mz. {m.letra}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Estado de venta</Label>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="libre">Libre</SelectItem>
              <SelectItem value="apartado">Apartado</SelectItem>
              <SelectItem value="vendido">Vendido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Datos</Label>
          <Select value={filtroDatos} onValueChange={setFiltroDatos}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="completo">Completo</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Buscar</Label>
          <Input placeholder="N° de lote o manzana" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Libres", String(resumen.libre)],
          ["Apartados", String(resumen.apartado)],
          ["Vendidos", String(resumen.vendido)],
          ["Área total", `${numero(resumen.area)} m²`],
          ["Valor de lista (libres)", soles(resumen.valorLista)],
          ["Valor vendido", soles(resumen.valorVendido)],
        ].map(([t, v]) => (
          <div key={t} className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t}</p>
            <p className="num text-lg font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={verM2} onCheckedChange={setVerM2} /> Mostrar precio por m²
        </label>
        {editable && seleccionados.length > 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
            <span>{cantidad(seleccionados.length, "lotes")} seleccionados</span>
            <AsignarPrecio ids={seleccionados.map((l) => l.id)} onListo={() => { setSeleccion(new Set()); refrescar(); }} />
            <Button size="sm" variant="ghost" onClick={() => setSeleccion(new Set())}>Quitar selección</Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                {editable ? (
                  <Checkbox
                    checked={libresVisibles.length > 0 && seleccionados.length === libresVisibles.length}
                    disabled={libresVisibles.length === 0}
                    onCheckedChange={(v) => setSeleccion(v ? new Set(libresVisibles.map((l) => l.id)) : new Set())}
                  />
                ) : null}
              </TableHead>
              <Encabezado col="manzana">Manzana</Encabezado>
              <Encabezado col="lote">Lote</Encabezado>
              <Encabezado col="area" derecha>Área m²</Encabezado>
              <Encabezado col="lista" derecha>Precio de lista</Encabezado>
              <Encabezado col="venta" derecha>Precio de venta</Encabezado>
              {verM2 ? <Encabezado col="m2" derecha>Precio por m²</Encabezado> : null}
              <Encabezado col="fecha">Fecha de venta</Encabezado>
              <Encabezado col="estado">Estado de venta</Encabezado>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes.isLoading ? (
              <TableRow><TableCell colSpan={columnas} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={columnas} className="text-center text-muted-foreground">No hay lotes con estos filtros.</TableCell></TableRow>
            ) : (
              filtrados.map((l) => (
                <TableRow
                  key={l.id}
                  className={l.ventaId ? "cursor-pointer" : undefined}
                  onClick={() => { if (l.ventaId) void navigate({ to: "/ventas", search: { venta: l.ventaId } }); }}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {editable ? (
                      <Checkbox
                        disabled={l.estadoVenta !== "libre"}
                        checked={seleccion.has(l.id)}
                        onCheckedChange={(v) =>
                          setSeleccion((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })
                        }
                      />
                    ) : null}
                  </TableCell>
                  <TableCell>Mz. {l.manzanaLetra || "—"}</TableCell>
                  <TableCell className="num font-medium">
                    {l.numero}
                    {estaPendiente(l) ? (
                      <AlertTriangle className="ml-1 inline h-3 w-3 text-accent-foreground" aria-label="Datos pendientes" />
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-right">{numero(l.area_m2)}</TableCell>
                  <TableCell className="num text-right">{soles(l.precio_lista)}</TableCell>
                  <TableCell className="num text-right">{l.precioVenta == null ? "–" : soles(l.precioVenta)}</TableCell>
                  {verM2 ? (
                    <TableCell className="num text-right">
                      {l.precioM2 == null ? "–" : l.precioM2.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  ) : null}
                  <TableCell className="num">{l.fechaVenta ? fecha(l.fechaVenta) : "–"}</TableCell>
                  <TableCell>
                    <Badge variant={l.estadoVenta === "libre" ? "outline" : "secondary"}>{ETIQUETA_ESTADO[l.estadoVenta]}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {editable ? <EditarLote lote={l} onListo={refrescar} /> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}

function AsignarPrecio({ ids, onListo }: { ids: string[]; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const valor = Number(monto);
  const valido = monto.trim() !== "" && Number.isFinite(valor) && valor > 0;

  async function aplicar() {
    setGuardando(true);
    const { error } = await supabase.from("lote").update({ precio_lista: valor }).in("id", ids);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`Precio de lista asignado a ${cantidad(ids.length, "lotes")}`);
    setAbierto(false); setConfirmar(false); setMonto("");
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) setConfirmar(false); }}>
      <DialogTrigger asChild><Button size="sm">Asignar precio de lista</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar precio de lista</DialogTitle>
          <DialogDescription>Se aplicará el mismo precio a {cantidad(ids.length, "lotes")} libres seleccionados.</DialogDescription>
        </DialogHeader>
        {!confirmar ? (
          <div className="space-y-1">
            <Label>Precio de lista (S/)</Label>
            <Input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
        ) : (
          <p className="text-sm">¿Confirmas cambiar el precio de lista a <strong>{soles(valor)}</strong> en <strong>{cantidad(ids.length, "lotes")}</strong>?</p>
        )}
        <DialogFooter>
          {!confirmar ? (
            <Button disabled={!valido} onClick={() => setConfirmar(true)}>Continuar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirmar(false)}>Volver</Button>
              <Button disabled={guardando} onClick={aplicar}>{guardando ? "Guardando…" : `Modificar ${cantidad(ids.length, "lotes")}`}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ManzanaOpcion = { id: string; letra: string; tipo?: string };

function AgregarLotes({
  manzanas,
  onListo,
}: {
  manzanas: ManzanaOpcion[];
  onListo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"grupo" | "individual">("grupo");
  const [manzanaId, setManzanaId] = useState("");
  const [desde, setDesde] = useState("1");
  const [hasta, setHasta] = useState("10");
  const [numero, setNumero] = useState("1");
  const [area, setArea] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const filas = [];
    if (modo === "grupo") {
      const d = Number(desde);
      const h = Number(hasta);
      if (!manzanaId || !Number.isInteger(d) || !Number.isInteger(h) || h < d) {
        toast.error("Revisa la manzana y el rango de numeración");
        return;
      }
      for (let n = d; n <= h; n++) {
        filas.push({
          manzana_id: manzanaId,
          numero: n,
          area_m2: area ? Number(area) : null,
          precio_lista: precio ? Number(precio) : null,
        });
      }
    } else {
      const n = Number(numero);
      if (!manzanaId || !Number.isInteger(n) || n <= 0) {
        toast.error("Revisa la manzana y el número de lote");
        return;
      }
      filas.push({
        manzana_id: manzanaId,
        numero: n,
        area_m2: area ? Number(area) : null,
        precio_lista: precio ? Number(precio) : null,
      });
    }
    setGuardando(true);
    const { error } = await supabase.from("lote").insert(filas);
    setGuardando(false);
    if (error) { toast.error("No se pudieron crear los lotes", { description: error.message }); return; }
    toast.success(`${cantidad(filas.length, "lotes")} creados`);
    setAbierto(false);
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Agregar Lotes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar lotes</DialogTitle>
          <DialogDescription>
            Crea un lote individual o varios lotes correlativos por grupo. Los datos que dejes
            vacíos quedarán como pendientes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={modo === "grupo" ? "default" : "outline"}
              onClick={() => setModo("grupo")}
            >
              Por grupo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={modo === "individual" ? "default" : "outline"}
              onClick={() => setModo("individual")}
            >
              Individual
            </Button>
          </div>
          <div className="space-y-1">
            <Label>Manzana</Label>
            <Select value={manzanaId} onValueChange={setManzanaId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una manzana" />
              </SelectTrigger>
              <SelectContent>
                {manzanas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    Mz. {m.letra}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {modo === "grupo" ? (
              <>
                <div className="space-y-1">
                  <Label>Desde el N°</Label>
                  <Input type="number" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Hasta el N°</Label>
                  <Input type="number" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="space-y-1 col-span-2">
                <Label>Número de lote</Label>
                <Input type="number" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Área m² (opcional)</Label>
              <Input type="number" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Precio S/ (opcional)</Label>
              <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando}>
            {modo === "grupo" ? "Crear lotes" : "Crear lote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarLote({ lote, onListo }: { lote: Lote; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState(lote.notas ?? "");

  function abrir() {
    const iniciales: Record<string, string> = {};
    CAMPOS_NUMERICOS.forEach(([campo]) => {
      const v = lote[campo];
      iniciales[campo] = v === null || v === undefined ? "" : String(v);
    });
    setValores(iniciales);
    setNotas(lote.notas ?? "");
  }

  async function guardar() {
    const cambios: Record<string, number | null | string> = { notas };
    CAMPOS_NUMERICOS.forEach(([campo]) => {
      const v = valores[campo];
      cambios[campo] = v === "" || v === undefined ? null : Number(v);
    });
    const { error } = await supabase.from("lote").update(cambios as never).eq("id", lote.id);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success("Lote actualizado");
    setAbierto(false);
    onListo();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) abrir();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lote N° {lote.numero}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {CAMPOS_NUMERICOS.map(([campo, etiqueta]) => (
            <div key={campo} className="space-y-1">
              <Label>{etiqueta}</Label>
              <Input
                type="number"
                step="0.01"
                value={valores[campo] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              />
            </div>
          ))}
          <div className="col-span-2 space-y-1">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <div className="col-span-2">
            <EnlaceLote loteId={lote.id} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS_PLANTILLA = [
  "etapa",
  "manzana",
  "numero",
  "area_m2",
  "precio_lista",
  "notas",
];

type FilaPrevia = {
  indice: number;
  etapa: string;
  manzana: string;
  numero: string;
  manzana_id: string | null;
  error: string | null;
  payload: Record<string, string> | null;
};

function descargarPlantilla() {
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "lotes");
  XLSX.writeFile(libro, "plantilla-lotes.xlsx");
}

function ImportarExcel({ onListo }: { onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<FilaPrevia[]>([]);
  const [procesando, setProcesando] = useState(false);

  const catalogo = useQuery({
    queryKey: ["manzanas-catalogo-importacion"],
    enabled: abierto,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manzana")
        .select("id, letra, tipo, etapa!inner(nombre)");
      if (error) throw error;
      return data as unknown as {
        id: string;
        letra: string;
        tipo: string;
        etapa: { nombre: string };
      }[];
    },
  });

  async function leerArchivo(archivo: File) {
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]!]!;
    const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
    const lista = catalogo.data ?? [];

    const previas: FilaPrevia[] = datos.map((f, i) => {
      const obtener = (...claves: string[]) => {
        for (const clave of claves) {
          const entrada = Object.entries(f).find(
            ([k]) => k.trim().toLowerCase() === clave.toLowerCase(),
          );
          if (entrada && String(entrada[1] ?? "").trim() !== "") return String(entrada[1]).trim();
        }
        return "";
      };

      const etapa = obtener("etapa");
      const manzana = obtener("manzana", "mz");
      const numero = obtener("numero", "lote");

      const base: FilaPrevia = {
        indice: i + 2,
        etapa,
        manzana,
        numero,
        manzana_id: null,
        error: null,
        payload: null,
      };

      if (!numero) return { ...base, error: "Falta el número de lote" };
      if (!etapa) return { ...base, error: "Falta la etapa" };
      if (!manzana) return { ...base, error: "Falta la manzana" };

      const coincidencias = lista.filter(
        (m) =>
          m.letra.trim().toLowerCase() === manzana.toLowerCase() &&
          (m.etapa?.nombre ?? "").trim().toLowerCase() === etapa.toLowerCase(),
      );
      if (coincidencias.length === 0) {
        return { ...base, error: `No existe la manzana ${manzana} en la etapa ${etapa}` };
      }
      if (coincidencias.length > 1) {
        return { ...base, error: "Etapa y manzana ambiguas: hay más de una coincidencia" };
      }
      const destino = coincidencias[0]!;
      if (destino.tipo !== "residencial") {
        return { ...base, error: "La manzana es de tipo mercado y no recibe lotes" };
      }

      return {
        ...base,
        manzana_id: destino.id,
        payload: {
          manzana_id: destino.id,
          numero,
          area_m2: obtener("area_m2", "area"),
          precio_lista: obtener("precio_lista", "precio"),
          notas: obtener("notas"),
        },
      };
    });

    setFilas(previas);
    const validas = previas.filter((f) => !f.error).length;
    toast.success(`${previas.length} fila(s) leídas · ${validas} válida(s)`);
  }

  const validas = filas.filter((f) => f.payload);
  const conError = filas.filter((f) => f.error);

  async function importar() {
    if (validas.length === 0) { toast.error("No hay filas válidas para importar"); return; }
    setProcesando(true);
    const { data, error } = await supabase.rpc("importar_lotes", {
      p_filas: validas.map((f) => f.payload),
    });
    setProcesando(false);
    if (error) { toast.error("No se pudo importar", { description: error.message }); return; }
    const resultado = data as { creados?: number; omitidos?: number } | null;
    toast.success(
      `Importación lista: ${resultado?.creados ?? 0} creados, ${resultado?.omitidos ?? 0} omitidos`,
    );
    setAbierto(false);
    setFilas([]);
    onListo();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setFilas([]);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-1 h-4 w-4" /> Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar lotes desde Excel</DialogTitle>
          <DialogDescription>
            Columnas: etapa, manzana, numero, area_m2, precio_lista, notas. Un archivo puede mezclar
            varias etapas y manzanas. Los lotes ya existentes se omiten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={descargarPlantilla}>
            <Download className="mr-1 h-4 w-4" /> Descargar plantilla
          </Button>
          <div className="space-y-1">
            <Label>Archivo (.xlsx o .csv)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!catalogo.isSuccess}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) leerArchivo(archivo);
              }}
            />
          </div>
          {filas.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {validas.length} fila(s) se importarán · {conError.length} con error (se omiten)
              </p>
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fila</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Manzana</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f) => (
                      <TableRow key={f.indice}>
                        <TableCell>{f.indice}</TableCell>
                        <TableCell>{f.etapa || "—"}</TableCell>
                        <TableCell>{f.manzana || "—"}</TableCell>
                        <TableCell>{f.numero || "—"}</TableCell>
                        <TableCell>
                          {f.error ? (
                            <Badge variant="destructive">{f.error}</Badge>
                          ) : (
                            <Badge variant="secondary">Lista</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={importar} disabled={procesando || validas.length === 0}>
            Importar {validas.length > 0 ? `${validas.length} fila(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
