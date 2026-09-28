import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetalleDesistimiento, ETIQUETA_DESISTIMIENTO } from "@/components/Desistimiento";
import { fecha, hoyLima, soles } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/desistimientos")({
  head: () => ({
    meta: [
      { title: "Desistimientos — Gestión de lotes" },
      { name: "description", content: "Ventas que terminan con devolución parcial y liberación del lote." },
      { property: "og:title", content: "Desistimientos — Gestión de lotes" },
      { property: "og:description", content: "Ventas que terminan con devolución parcial y liberación del lote." },
    ],
  }),
  component: DesistimientosPage,
});

function DesistimientosPage() {
  const [estado, setEstado] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["desistimientos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("desistimiento")
        .select(
          "*, venta:venta_id(lote:lote_id(numero, manzana:manzana_id(letra)), titulares:venta_titular(es_principal, anulado, cliente:cliente_id(nombres, apellidos, numero_documento))), devoluciones:desistimiento_devolucion(monto, anulado)",
        )
        .order("fecha_inicio", { ascending: false });
      if (error) throw error;
      const hoy = hoyLima();
      return (data ?? []).map((d) => {
        const t = d.venta?.titulares?.find((x) => x.es_principal && !x.anulado)?.cliente;
        const devuelto = (d.devoluciones ?? []).filter((x) => !x.anulado).reduce((s, x) => s + Number(x.monto), 0);
        const vigente = d.estado === "aceptado" || d.estado === "devuelto";
        const pendiente = vigente ? Math.max(Number(d.monto_devolver) - devuelto, 0) : 0;
        return {
          ...d,
          lote: `Mz ${d.venta?.lote?.manzana?.letra ?? "?"} · Lote ${d.venta?.lote?.numero ?? "?"}`,
          cliente: t ? `${t.apellidos} ${t.nombres}` : "—",
          documento: t?.numero_documento ?? "",
          devuelto,
          pendiente,
          vencida: d.estado === "aceptado" && !!d.fecha_limite_devolucion && d.fecha_limite_devolucion < hoy && pendiente > 0.005,
        };
      });
    },
  });

  const filtrados = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    return (lista.data ?? []).filter((d) => {
      if (estado !== "todos" && d.estado !== estado) return false;
      if (desde && d.fecha_inicio < desde) return false;
      if (hasta && d.fecha_inicio > hasta) return false;
      if (b && !`${d.cliente} ${d.documento} ${d.lote}`.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [lista.data, estado, desde, hasta, buscar]);

  const vigentes = filtrados.filter((d) => d.estado !== "anulado");
  const tot = {
    devolver: vigentes.reduce((s, d) => s + Number(d.monto_devolver), 0),
    devuelto: vigentes.reduce((s, d) => s + d.devuelto, 0),
    pendiente: vigentes.reduce((s, d) => s + d.pendiente, 0),
    retiene: vigentes.reduce((s, d) => s + Number(d.monto_retiene_empresa), 0),
  };

  return (
    <AppShell titulo="Desistimientos" descripcion="Ventas reales que terminan con devolución parcial y lote liberado">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Estado</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          >
            <option value="todos">Todos</option>
            {Object.entries(ETIQUETA_DESISTIMIENTO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Buscar</Label>
          <Input placeholder="Cliente, documento o lote" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Monto a devolver", tot.devolver],
          ["Devuelto", tot.devuelto],
          ["Pendiente", tot.pendiente],
          ["Retiene la empresa", tot.retiene],
        ].map(([k, v]) => (
          <Card key={k as string}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="num text-xl font-semibold">{soles(v as number)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Inicio</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">A devolver</TableHead>
            <TableHead className="text-right">Devuelto</TableHead>
            <TableHead className="text-right">Pendiente</TableHead>
            <TableHead>Fecha límite</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtrados.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">No hay desistimientos.</TableCell>
            </TableRow>
          ) : null}
          {filtrados.map((d) => (
            <TableRow key={d.id} className={d.estado === "anulado" ? "opacity-50" : ""}>
              <TableCell>{fecha(d.fecha_inicio)}</TableCell>
              <TableCell>{d.lote}</TableCell>
              <TableCell>{d.cliente}</TableCell>
              <TableCell>
                <Badge variant={d.estado === "anulado" ? "destructive" : "secondary"}>{ETIQUETA_DESISTIMIENTO[d.estado]}</Badge>
              </TableCell>
              <TableCell className="num text-right">{soles(d.monto_devolver)}</TableCell>
              <TableCell className="num text-right">{soles(d.devuelto)}</TableCell>
              <TableCell className="num text-right">{soles(d.pendiente)}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  {fecha(d.fecha_limite_devolucion)}
                  {d.vencida ? (
                    <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Vencida</Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => setAbierto(d.id)}>Detalle</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DetalleDesistimiento id={abierto} onCerrar={() => setAbierto(null)} />
    </AppShell>
  );
}
