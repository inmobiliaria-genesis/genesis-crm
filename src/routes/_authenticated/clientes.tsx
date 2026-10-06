import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DialogoEliminar } from "@/components/DialogoEliminar";
import { EstadoAprobacion } from "@/components/EstadoAprobacion";
import { usePerfil, esAdmin, esAsesor } from "@/lib/sesion";
import { useMemo, useState } from "react";
import { BarraFiltros, Buscador, ColOrden, FiltroMulti, coincide, enLista, useOrden } from "@/components/ListaControles";
import { ETIQUETA_FUENTE, ETIQUETA_ORIGEN } from "@/lib/leads";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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
import { nombreCliente, documentoCliente, ETIQUETA_APROBACION, type Cliente } from "@/lib/ventas";
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
  const [aprob, setAprob] = useState<string[]>([]);
  const [origenes, setOrigenes] = useState<string[]>([]);
  const [fuentes, setFuentes] = useState<string[]>([]);
  const [conVenta, setConVenta] = useState<string[]>([]);
  const clientes = useQuery({
    queryKey: ["clientes-lista"],
    queryFn: async () => {
      const [c, t] = await Promise.all([
        supabase.from("cliente").select("*").eq("anulado", false).order("apellidos"),
        supabase.from("venta_titular").select("cliente_id, venta:venta_id(anulado)").eq("anulado", false),
      ]);
      if (c.error) throw c.error;
      const conV = new Set((t.data ?? []).filter((x) => x.venta && !x.venta.anulado).map((x) => x.cliente_id));
      return (c.data ?? []).map((x) => ({ ...x, tieneVenta: conV.has(x.id) }));
    },
  });
  const filtrados = useMemo(
    () =>
      (clientes.data ?? []).filter(
        (c) =>
          enLista(c.estado_aprobacion, aprob) &&
          enLista(c.origen, origenes) &&
          enLista(c.fuente, fuentes) &&
          enLista(c.tieneVenta ? "si" : "no", conVenta) &&
          coincide(busqueda, `${c.nombres} ${c.apellidos}`, `${c.apellidos} ${c.nombres}`, c.numero_documento),
      ),
    [clientes.data, aprob, origenes, fuentes, conVenta, busqueda],
  );
  const { ordenadas, orden, alternar } = useOrden(filtrados, {
    nombre: (c) => nombreCliente(c),
    documento: (c) => c.numero_documento,
    telefono: (c) => c.telefono1,
    distrito: (c) => c.distrito,
    aprobacion: (c) => c.estado_aprobacion,
    registro: (c) => c.creado_en,
  });
  const { data: perfil } = usePerfil();
  const asesor = esAsesor(perfil);

  return (
    <AppShell
      titulo={asesor ? "Mis clientes" : "Clientes"}
      descripcion={asesor ? "Clientes que registraste y su estado de aprobación" : "Búsqueda, alta y ficha de clientes"}
      acciones={<Button onClick={() => setNuevo(true)}>+ Nuevo cliente</Button>}
    >
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Listado</CardTitle>
          <BarraFiltros
            onLimpiar={() => { setBusqueda(""); setAprob([]); setOrigenes([]); setFuentes([]); setConVenta([]); }}
            mostrando={filtrados.length}
            total={clientes.data?.length ?? 0}
          >
            <Buscador placeholder="Nombre o DNI" valor={busqueda} onCambio={setBusqueda} />
            <FiltroMulti label="Aprobación" opciones={Object.entries(ETIQUETA_APROBACION).map(([k, v]) => ({ valor: k, etiqueta: v }))} valor={aprob} onCambio={setAprob} />
            <FiltroMulti label="Origen" opciones={Object.entries(ETIQUETA_ORIGEN).map(([k, v]) => ({ valor: k, etiqueta: v }))} valor={origenes} onCambio={setOrigenes} />
            <FiltroMulti label="Fuente" opciones={Object.entries(ETIQUETA_FUENTE).map(([k, v]) => ({ valor: k, etiqueta: v }))} valor={fuentes} onCambio={setFuentes} />
            <FiltroMulti label="¿Tiene venta?" opciones={[{ valor: "si", etiqueta: "Sí" }, { valor: "no", etiqueta: "No" }]} valor={conVenta} onCambio={setConVenta} />
          </BarraFiltros>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <ColOrden clave="nombre" orden={orden} onOrden={alternar}>Cliente</ColOrden>
                <ColOrden clave="documento" orden={orden} onOrden={alternar}>Documento</ColOrden>
                <ColOrden clave="telefono" orden={orden} onOrden={alternar}>Teléfono</ColOrden>
                <ColOrden clave="distrito" orden={orden} onOrden={alternar}>Distrito</ColOrden>
                <ColOrden clave="aprobacion" orden={orden} onOrden={alternar}>Aprobación</ColOrden>
                <ColOrden clave="registro" orden={orden} onOrden={alternar}>Registro</ColOrden>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No hay clientes que coincidan.
                  </TableCell>
                </TableRow>
              ) : null}
              {ordenadas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{nombreCliente(c)}</TableCell>
                  <TableCell className="num">{documentoCliente(c)}</TableCell>
                  <TableCell className="num">{c.telefono1}</TableCell>
                  <TableCell>{c.distrito ?? "—"}</TableCell>
                  <TableCell>
                    <EstadoAprobacion estado={c.estado_aprobacion} motivo={c.motivo_rechazo} />
                  </TableCell>
                  <TableCell>{fecha(c.creado_en)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setFicha(c)}>
                      Ficha
                    </Button>
                    {!asesor || c.estado_aprobacion === "pendiente" ? (
                      <Button size="sm" variant="outline" onClick={() => setEditar(c)}>
                        Editar
                      </Button>
                    ) : null}
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

function EliminarCliente({ id, onListo }: { id: string; onListo: () => void }) {
  const { data: perfil } = usePerfil();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  if (!esAdmin(perfil)) return null;
  return (
    <>
      <Button size="sm" variant="destructive" className="mb-2" onClick={() => setAbierto(true)}>Eliminar cliente</Button>
      <DialogoEliminar
        titulo="Eliminar cliente"
        abierto={abierto}
        onCambio={setAbierto}
        onConfirmar={async (motivo) => {
          const { error } = await supabase.rpc("eliminar_cliente" as never, { _cliente_id: id, _motivo: motivo } as never);
          if (error) return error.message;
          qc.invalidateQueries();
          onListo();
          return null;
        }}
      />
    </>
  );
}

