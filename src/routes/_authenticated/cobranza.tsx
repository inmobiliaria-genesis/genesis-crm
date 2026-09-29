import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { ETIQUETA_CUOTA } from "@/lib/cobranza";
import { nombreCliente, documentoCliente } from "@/lib/ventas";
import { fecha, soles } from "@/lib/format";
import { usePerfil, puedeCobrar } from "@/lib/sesion";

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

function CobranzaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: perfil } = usePerfil();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("todas");
  const [soloVencidas, setSoloVencidas] = useState("no");
  const [pagoVenta, setPagoVenta] = useState<{ ventaId: string; cuotaId: string } | null>(null);

  const cuotas = useQuery({
    queryKey: ["cobranza-cuotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cuota")
        .select(
          "id, numero, fecha_vencimiento, monto_vigente, venta_id, venta:venta_id(id, anulado, lote:lote_id(numero, manzana:manzana_id(letra)), titulares:venta_titular(es_principal, anulado, cliente:cliente_id(nombres, apellidos, tipo_documento, numero_documento))), aplicaciones:pago_aplicacion(monto_aplicado, anulado, pago:pago_id(anulado, recibido_por))",
        )
        .eq("anulado", false)
        .order("fecha_vencimiento")
        .limit(1000);
      if (error) throw error;
      const { data: estados, error: e2 } = await supabase
        .from("cuota_estado")
        .select("cuota_id, monto_pagado, saldo, estado, vencida, exigible");
      if (e2) throw e2;
      const mapa = new Map((estados ?? []).map((e) => [e.cuota_id, e]));
      return (data ?? [])
        .filter((c) => c.venta && !c.venta.anulado && mapa.get(c.id)?.exigible !== false)
        .map((c) => {
          const e = mapa.get(c.id);
          const principal = c.venta?.titulares?.find((t) => t.es_principal && !t.anulado);
          const apls = ((c as unknown as { aplicaciones?: { monto_aplicado: number; anulado: boolean; pago: { anulado: boolean; recibido_por: string } | null }[] }).aplicaciones ?? []);
          const vendedor = apls
            .filter((a) => !a.anulado && a.pago && !a.pago.anulado && a.pago.recibido_por === "vendedor")
            .reduce((t, a) => t + Number(a.monto_aplicado), 0);
          return {
            id: c.id,
            venta_id: c.venta_id,
            numero: c.numero,
            fecha_vencimiento: c.fecha_vencimiento,
            monto_vigente: Number(c.monto_vigente),
            monto_pagado: Number(e?.monto_pagado ?? 0),
            pagado_vendedor: vendedor,
            saldo: Number(e?.saldo ?? c.monto_vigente),
            estado: e?.estado ?? "pendiente",
            vencida: Boolean(e?.vencida),
            lote: `Mz ${c.venta?.lote?.manzana?.letra ?? "?"} · Lote ${c.venta?.lote?.numero ?? "?"}`,
            numeroLote: String(c.venta?.lote?.numero ?? ""),
            cliente: nombreCliente(principal?.cliente),
            documento: documentoCliente(principal?.cliente),
          };
        });
    },
  });

  const filtradas = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return (cuotas.data ?? []).filter((c) => {
      if (estado !== "todas" && c.estado !== estado) return false;
      if (soloVencidas === "si" && !c.vencida) return false;
      if (!b) return true;
      return (
        c.cliente.toLowerCase().includes(b) ||
        c.documento.toLowerCase().includes(b) ||
        c.numeroLote.includes(b) ||
        c.lote.toLowerCase().includes(b)
      );
    });
  }, [cuotas.data, busqueda, estado, soloVencidas]);

  const totalSaldo = filtradas.reduce((t, c) => t + Math.max(c.saldo, 0), 0);
  const totalInmobiliaria = filtradas.reduce((t, c) => t + c.monto_pagado - c.pagado_vendedor, 0);
  const totalVendedor = filtradas.reduce((t, c) => t + c.pagado_vendedor, 0);

  return (
    <AppShell titulo="Cobranza" descripcion="Cuotas, pagos y saldos por cobrar">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end gap-3">
          <CardTitle className="mr-auto text-base">Cuotas</CardTitle>
          <div className="w-64">
            <Label className="text-xs">Buscar</Label>
            <Input
              placeholder="Cliente, documento o número de lote"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Label className="text-xs">Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Vencidas</Label>
            <Select value={soloVencidas} onValueChange={setSoloVencidas}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Todas</SelectItem>
                <SelectItem value="si">Solo vencidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cuota</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuotas.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No hay cuotas con estos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                filtradas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.lote}</TableCell>
                    <TableCell>
                      {c.cliente}
                      <span className="block text-xs text-muted-foreground">{c.documento}</span>
                    </TableCell>
                    <TableCell className="num">{c.numero === 0 ? "Inicial" : c.numero}</TableCell>
                    <TableCell>{fecha(c.fecha_vencimiento)}</TableCell>
                    <TableCell className="num text-right">{soles(c.monto_vigente)}</TableCell>
                    <TableCell className="num text-right">
                      {soles(c.monto_pagado)}
                      {c.pagado_vendedor > 0.005 ? (
                        <span className="block text-xs text-muted-foreground">
                          Recibido por vendedor: {soles(c.pagado_vendedor)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="num text-right">{soles(Math.max(c.saldo, 0))}</TableCell>
                    <TableCell>
                      <Badge variant={c.estado === "pagada" ? "secondary" : "outline"}>
                        {ETIQUETA_CUOTA[c.estado] ?? c.estado}
                      </Badge>{" "}
                      {c.vencida ? <Badge variant="destructive">Vencida</Badge> : null}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          navigate({ to: "/ventas", search: { venta: c.venta_id } })
                        }
                      >
                        Ficha
                      </Button>
                      {puedeCobrar(perfil) && c.saldo > 0.005 ? (
                        <Button
                          size="sm"
                          onClick={() => setPagoVenta({ ventaId: c.venta_id, cuotaId: c.id })}
                        >
                          Registrar pago
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Saldo por cobrar con estos filtros: <span className="num">{soles(totalSaldo)}</span> · Ingresos de la
            inmobiliaria: <span className="num">{soles(totalInmobiliaria)}</span> · Recibido por vendedores:{" "}
            <span className="num">{soles(totalVendedor)}</span>
          </p>
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
