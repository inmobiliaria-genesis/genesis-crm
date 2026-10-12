import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { DialogoPago } from "@/components/PagoForm";
import { fecha, soles } from "@/lib/format";
import { usePerfil, puedeCobrar } from "@/lib/sesion";
import { nombreVendedor, useVendedores } from "@/lib/vendedores";
import { Buscador, ColOrden, FiltroMulti, FiltroRango, RANGO_VACIO, type Orden } from "@/components/ListaControles";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cobranza")({
  head: () => ({
    meta: [
      { title: "Cobranza — Gestión de lotes" },
      {
        name: "description",
        content: "Seguimiento de cuotas, pagos y saldos de las ventas de lotes.",
      },
      { property: "og:title", content: "Cobranza — Gestión de lotes" },
      {
        property: "og:description",
        content: "Seguimiento de cuotas, pagos y saldos de las ventas de lotes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CobranzaPage,
});

const TAM = 50;

const ESTADO_FILTRO: { valor: string; etiqueta: string; estados: string[] | null }[] = [
  { valor: "pv_v", etiqueta: "Por vencer y vencidas", estados: ["por_vencer", "vencida"] },
  { valor: "por_vencer", etiqueta: "Por vencer", estados: ["por_vencer"] },
  { valor: "vencida", etiqueta: "Vencida", estados: ["vencida"] },
  { valor: "morosa", etiqueta: "Morosa", estados: ["morosa"] },
  { valor: "pendiente", etiqueta: "Pendiente", estados: ["pendiente"] },
  { valor: "pagada", etiqueta: "Pagada", estados: ["pagada"] },
  { valor: "todas", etiqueta: "Todas", estados: null },
];

const ESTILO_ESTADO: Record<string, { etiqueta: string; clase: string }> = {
  pagada: { etiqueta: "Pagada", clase: "border-transparent bg-secondary text-secondary-foreground" },
  morosa: { etiqueta: "Morosa", clase: "border-transparent bg-destructive text-destructive-foreground" },
  vencida: { etiqueta: "Vencida", clase: "border-destructive text-destructive" },
  por_vencer: { etiqueta: "Por vencer", clase: "border-primary text-primary" },
  pendiente: { etiqueta: "Pendiente", clase: "text-muted-foreground" },
};

type FilaCuota = {
  id: string;
  venta_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto_vigente: number;
  monto_pagado: number;
  saldo: number;
  pagado_vendedor: number;
  lote_numero: number;
  manzana: string;
  cliente: string;
  documento: string | null;
  estado: string;
};
type Respuesta = {
  total: number;
  filas: FilaCuota[];
  totales: { saldo: number; inmobiliaria: number; vendedor: number };
  resumen: { por_vencer: number; vencida: number; morosa: number; clientes_atraso: number };
};

function CobranzaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: perfil } = usePerfil();
  const [busqueda, setBusqueda] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("pv_v");
  const [encargados, setEncargados] = useState<string[]>([]);
  const [manzanas, setManzanas] = useState<string[]>([]);
  const [rango, setRango] = useState(RANGO_VACIO);
  const [recibido, setRecibido] = useState<string[]>([]);
  const [orden, setOrden] = useState<Orden>(null);
  const [pagina, setPagina] = useState(1);
  const vendedores = useVendedores();
  const [pagoVenta, setPagoVenta] = useState<{ ventaId: string; cuotaId: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscar(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda]);
  useEffect(() => setPagina(1), [buscar, filtroEstado, encargados, manzanas, rango, recibido, orden]);

  const letrasQ = useQuery({
    queryKey: ["cobranza-manzanas"],
    queryFn: async () => {
      const { data } = await supabase.from("manzana").select("letra").eq("anulado", false).eq("tipo", "residencial");
      return [...new Set((data ?? []).map((m) => m.letra))].sort((a, b) => a.localeCompare(b, "es"));
    },
  });

  const estadosSel = ESTADO_FILTRO.find((e) => e.valor === filtroEstado)?.estados ?? null;
  const cuotas = useQuery({
    queryKey: ["cobranza-cuotas", buscar, filtroEstado, encargados, manzanas, rango, recibido, orden, pagina],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Respuesta> => {
      const rpc = supabase.rpc.bind(supabase);
      const { data, error } = await rpc("cobranza_cuotas" as never, {
        _estados: estadosSel,
        _busqueda: buscar || null,
        _encargados: encargados.length ? encargados : null,
        _manzanas: manzanas.length ? manzanas : null,
        _desde: rango.min || null,
        _hasta: rango.max || null,
        _recibido: recibido.length ? recibido : null,
        _orden: orden?.clave ?? null,
        _dir: orden?.dir ?? "asc",
        _pagina: pagina,
        _tamano: TAM,
      } as never);
      if (error) throw error;
      return data as unknown as Respuesta;
    },
  });

  function alternar(clave: string) {
    setOrden((o) => (!o || o.clave !== clave ? { clave, dir: "asc" } : o.dir === "asc" ? { clave, dir: "desc" } : null));
  }
  function limpiar() {
    setBusqueda(""); setBuscar(""); setFiltroEstado("pv_v"); setEncargados([]); setManzanas([]);
    setRango(RANGO_VACIO); setRecibido([]); setOrden(null); setPagina(1);
  }

  const total = Number(cuotas.data?.total ?? 0);
  const paginas = Math.max(1, Math.ceil(total / TAM));
  const filas = cuotas.data?.filas ?? [];
  const res = cuotas.data?.resumen;
  const tot = cuotas.data?.totales;
  const desde = total === 0 ? 0 : (pagina - 1) * TAM + 1;
  const hasta = Math.min(pagina * TAM, total);
  const nf = (n: number) => n.toLocaleString("en-US");

  const tarjetas = [
    { valor: "por_vencer", titulo: "Total por vencer (15 días)", monto: soles(res?.por_vencer ?? 0) },
    { valor: "vencida", titulo: "Total vencido (90 días)", monto: soles(res?.vencida ?? 0) },
    { valor: "morosa", titulo: "Total moroso (más de 90 días)", monto: soles(res?.morosa ?? 0) },
    { valor: "pv_v_clientes", titulo: "Clientes con cuotas vencidas o morosas", monto: nf(Number(res?.clientes_atraso ?? 0)) },
  ];

  return (
    <AppShell titulo="Cobranza" descripcion="Cuotas, pagos y saldos por cobrar">
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => {
          const destino = t.valor === "pv_v_clientes" ? "vencida" : t.valor;
          return (
            <button
              key={t.valor}
              type="button"
              onClick={() => setFiltroEstado(t.valor === "pv_v_clientes" ? "todas" : destino)}
              className={cn(
                "rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted",
                filtroEstado === t.valor && "ring-2 ring-primary",
              )}
            >
              <p className="text-xs text-muted-foreground">{t.titulo}</p>
              <p className="num mt-1 text-lg font-semibold">{t.monto}</p>
            </button>
          );
        })}
      </div>
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Cuotas</CardTitle>
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Buscador placeholder="Cliente o DNI" valor={busqueda} onCambio={setBusqueda} />
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADO_FILTRO.map((e) => <SelectItem key={e.valor} value={e.valor}>{e.etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <FiltroMulti label="Encargado" opciones={(vendedores.data ?? []).filter((x) => x.tipo === "encargado").map((x) => ({ valor: x.id, etiqueta: nombreVendedor(x) }))} valor={encargados} onCambio={setEncargados} />
              <FiltroMulti label="Manzana" opciones={(letrasQ.data ?? []).map((l) => ({ valor: l, etiqueta: `Mz ${l}` }))} valor={manzanas} onCambio={setManzanas} />
              <FiltroRango label="Fecha de vencimiento" tipo="date" valor={rango} onCambio={setRango} />
              <FiltroMulti label="Recibido por" opciones={[{ valor: "vendedor", etiqueta: "Vendedor" }, { valor: "inmobiliaria", etiqueta: "Inmobiliaria" }]} valor={recibido} onCambio={setRecibido} />
              <div className="flex items-end">
                <Button variant="outline" onClick={limpiar}>Limpiar filtros</Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Mostrando <span className="num">{nf(desde)}–{nf(hasta)}</span> de <span className="num">{nf(total)}</span>
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <ColOrden clave="lote" orden={orden} onOrden={alternar}>Lote</ColOrden>
                <ColOrden clave="cliente" orden={orden} onOrden={alternar}>Cliente</ColOrden>
                <ColOrden clave="cuota" orden={orden} onOrden={alternar}>Cuota</ColOrden>
                <ColOrden clave="vencimiento" orden={orden} onOrden={alternar}>Vencimiento</ColOrden>
                <ColOrden clave="monto" orden={orden} onOrden={alternar} className="text-right">Monto</ColOrden>
                <ColOrden clave="pagado" orden={orden} onOrden={alternar} className="text-right">Pagado</ColOrden>
                <ColOrden clave="saldo" orden={orden} onOrden={alternar} className="text-right">Saldo</ColOrden>
                <ColOrden clave="estado" orden={orden} onOrden={alternar}>Estado</ColOrden>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuotas.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">Cargando…</TableCell>
                </TableRow>
              ) : cuotas.isError ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-destructive">No se pudieron cargar las cuotas.</TableCell>
                </TableRow>
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">No hay cuotas con estos filtros.</TableCell>
                </TableRow>
              ) : (
                filas.map((c) => {
                  const est = ESTILO_ESTADO[c.estado] ?? { etiqueta: c.estado, clase: "" };
                  const saldo = Number(c.saldo);
                  const pagado = Number(c.monto_pagado);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>Mz {c.manzana} · Lote {c.lote_numero}</TableCell>
                      <TableCell>
                        {c.cliente || "—"}
                        <span className="block text-xs text-muted-foreground">{c.documento ?? ""}</span>
                      </TableCell>
                      <TableCell className="num">{c.numero === 0 ? "Inicial" : c.numero}</TableCell>
                      <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
                      <TableCell className="num text-right">{soles(c.monto_vigente)}</TableCell>
                      <TableCell className="num text-right">
                        {soles(pagado)}
                        {Number(c.pagado_vendedor) > 0.005 ? (
                          <span className="block text-xs text-muted-foreground">Recibido por vendedor: {soles(c.pagado_vendedor)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="num text-right">{soles(Math.max(saldo, 0))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={est.clase}>{est.etiqueta}</Badge>
                        {saldo > 0.005 && pagado > 0.005 ? (
                          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">parcial</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/ventas", search: { venta: c.venta_id } })}>
                          Ficha
                        </Button>
                        {puedeCobrar(perfil) && saldo > 0.005 ? (
                          <Button size="sm" onClick={() => setPagoVenta({ ventaId: c.venta_id, cuotaId: c.id })}>
                            Registrar pago
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Saldo por cobrar con estos filtros: <span className="num">{soles(tot?.saldo ?? 0)}</span> · Ingresos de la
              inmobiliaria: <span className="num">{soles(tot?.inmobiliaria ?? 0)}</span> · Recibido por vendedores:{" "}
              <span className="num">{soles(tot?.vendedor ?? 0)}</span>
            </p>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" aria-label="Primera página" disabled={pagina <= 1} onClick={() => setPagina(1)}><ChevronsLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="px-2 text-sm">Página <span className="num">{nf(pagina)}</span> de <span className="num">{nf(paginas)}</span></span>
              <Button size="icon" variant="outline" aria-label="Página siguiente" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Última página" disabled={pagina >= paginas} onClick={() => setPagina(paginas)}><ChevronsRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pagoVenta ? (
        <DialogoPago
          ventaId={pagoVenta.ventaId}
          cuotaInicial={pagoVenta.cuotaId}
          onCerrar={() => {
            setPagoVenta(null);
            qc.invalidateQueries({ queryKey: ["cobranza-cuotas"] });
            toast.dismiss();
          }}
        />
      ) : null}
    </AppShell>
  );
}
