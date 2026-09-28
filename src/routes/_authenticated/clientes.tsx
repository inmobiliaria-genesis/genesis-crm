import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DialogoCliente } from "@/components/ClienteForm";
import { useClientes, nombreCliente, documentoCliente, type Cliente } from "@/lib/ventas";
import { fecha, soles } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Gestión de lotes" },
      { name: "description", content: "Registro de clientes, sus apartados y sus ventas." },
      { property: "og:title", content: "Clientes — Gestión de lotes" },
      { property: "og:description", content: "Registro de clientes, sus apartados y sus ventas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientesPage,
});

function ClientesPage() {
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Cliente | null>(null);
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const clientes = useClientes(busqueda);

  return (
    <AppShell
      titulo="Clientes"
      descripcion="Búsqueda, alta y ficha de clientes"
      acciones={<Button onClick={() => setNuevo(true)}>+ Nuevo cliente</Button>}
    >
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Listado</CardTitle>
          <Input
            className="max-w-sm"
            placeholder="Buscar por documento o nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Distrito</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No hay clientes que coincidan.
                  </TableCell>
                </TableRow>
              ) : null}
              {clientes.data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{nombreCliente(c)}</TableCell>
                  <TableCell className="num">{documentoCliente(c)}</TableCell>
                  <TableCell className="num">{c.telefono1}</TableCell>
                  <TableCell>{c.distrito ?? "—"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setFicha(c)}>
                      Ficha
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditar(c)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {nuevo ? <DialogoCliente abierto onCerrar={() => setNuevo(false)} /> : null}
      {editar ? (
        <DialogoCliente abierto cliente={editar} onCerrar={() => setEditar(null)} />
      ) : null}
      <FichaCliente cliente={ficha} onCerrar={() => setFicha(null)} />
    </AppShell>
  );
}

function FichaCliente({ cliente, onCerrar }: { cliente: Cliente | null; onCerrar: () => void }) {
  const historial = useQuery({
    queryKey: ["historial-cliente", cliente?.id],
    enabled: !!cliente,
    queryFn: async () => {
      const [reservas, titulares] = await Promise.all([
        supabase
          .from("reserva")
          .select("id, fecha, fecha_limite, anulado, convertida_a_venta_id, lote:lote_id(numero, manzana:manzana_id(letra))")
          .eq("cliente_id", cliente!.id)
          .order("fecha", { ascending: false }),
        supabase
          .from("venta_titular")
          .select(
            "id, es_principal, venta:venta_id(id, fecha_venta, precio_acordado, anulado, lote:lote_id(numero, manzana:manzana_id(letra)))",
          )
          .eq("cliente_id", cliente!.id)
          .eq("anulado", false),
      ]);
      if (reservas.error) throw reservas.error;
      if (titulares.error) throw titulares.error;
      return { reservas: reservas.data, titulares: titulares.data };
    },
  });

  return (
    <Sheet open={!!cliente} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{nombreCliente(cliente)}</SheetTitle>
        </SheetHeader>
        {cliente ? (
          <div className="mt-4 space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Dato k="Documento" v={documentoCliente(cliente)} />
              <Dato k="Teléfono" v={cliente.telefono1} />
              <Dato k="Correo" v={cliente.email ?? "—"} />
              <Dato k="Ocupación" v={cliente.ocupacion ?? "—"} />
              <Dato
                k="Domicilio"
                v={[cliente.distrito, cliente.provincia, cliente.departamento].filter(Boolean).join(", ") || "—"}
              />
              <Dato k="Estado civil" v={cliente.estado_civil ?? "—"} />
            </div>

            <div>
              <p className="mb-2 font-medium">Apartados</p>
              {historial.data?.reservas.length ? (
                historial.data.reservas.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b border-border py-1.5">
                    <span>
                      Mz {r.lote?.manzana?.letra} · Lote {r.lote?.numero}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fecha(r.fecha)} → {fecha(r.fecha_limite)}
                    </span>
                    <Badge variant={r.anulado ? "outline" : r.convertida_a_venta_id ? "secondary" : "default"}>
                      {r.anulado ? "Anulado" : r.convertida_a_venta_id ? "Convertido" : "Registrado"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Sin apartados.</p>
              )}
            </div>

            <div>
              <p className="mb-2 font-medium">Ventas</p>
              <EliminarCliente id={cliente.id} onListo={onCerrar} />
              {historial.data?.titulares.length ? (
                historial.data.titulares.map((t) => (
                  <div key={t.id} className="flex items-center justify-between border-b border-border py-1.5">
                    <span>
                      Mz {t.venta?.lote?.manzana?.letra} · Lote {t.venta?.lote?.numero}
                    </span>
                    <span className="num text-xs text-muted-foreground">
                      {soles(t.venta?.precio_acordado ?? null)}
                    </span>
                    <Link to="/ventas" search={{ venta: t.venta?.id }} className="text-xs underline">
                      Ver venta
                    </Link>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Sin ventas.</p>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{k}</p>
      <p>{v}</p>
    </div>
  );
}
