import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { usePerfil } from "@/lib/sesion";
import { fechaHora } from "@/lib/format";

const TABLAS = ["proyecto", "etapa", "manzana", "lote", "perfil", "config", "vendedor", "venta", "pago"];

export const Route = createFileRoute("/_authenticated/bitacora")({
  head: () => ({
    meta: [
      { title: "Bitácora — Gestión de lotes" },
      { name: "description", content: "Historial de cambios por usuario, tabla y fecha." },
      { property: "og:title", content: "Bitácora — Gestión de lotes" },
      { property: "og:description", content: "Historial de cambios por usuario, tabla y fecha." },
    ],
  }),
  component: BitacoraPage,
});

function BitacoraPage() {
  const { data: perfil, isLoading } = usePerfil();
  const permitido = perfil?.rol === "admin" || perfil?.rol === "socio";

  const [usuarioId, setUsuarioId] = useState("");
  const [tabla, setTabla] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const perfiles = useQuery({
    queryKey: ["perfiles-bitacora"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("user_id, nombre").order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const mapaUsuarios = useMemo(
    () => new Map((perfiles.data ?? []).map((p) => [p.user_id, p.nombre])),
    [perfiles.data],
  );

  const registros = useQuery({
    queryKey: ["bitacora", usuarioId, tabla, desde, hasta],
    enabled: permitido,
    queryFn: async () => {
      let consulta = supabase
        .from("bitacora")
        .select("*")
        .order("fecha_hora", { ascending: false })
        .limit(500);
      if (usuarioId) consulta = consulta.eq("usuario_id", usuarioId);
      if (tabla) consulta = consulta.eq("tabla", tabla);
      if (desde) consulta = consulta.gte("fecha_hora", `${desde}T00:00:00-05:00`);
      if (hasta) consulta = consulta.lte("fecha_hora", `${hasta}T23:59:59-05:00`);
      const { data, error } = await consulta;
      if (error) throw error;
      return data;
    },
  });

  if (!isLoading && !permitido) {
    return (
      <AppShell titulo="Bitácora">
        <p className="text-sm text-muted-foreground">
          Solo administradores y socios pueden ver la bitácora.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Bitácora" descripcion="Historial de cambios del sistema">
      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5">
        <div className="space-y-1">
          <Label>Usuario</Label>
          <Select
            value={usuarioId || "todos"}
            onValueChange={(v) => setUsuarioId(v === "todos" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {perfiles.data?.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Tabla</Label>
          <Select value={tabla || "todas"} onValueChange={(v) => setTabla(v === "todas" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {TABLAS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            onClick={() => {
              setUsuarioId("");
              setTabla("");
              setDesde("");
              setHasta("");
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Tabla</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead>Cambios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : registros.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin movimientos con estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              registros.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="num whitespace-nowrap">{fechaHora(r.fecha_hora)}</TableCell>
                  <TableCell>{mapaUsuarios.get(r.usuario_id ?? "") ?? "Sistema"}</TableCell>
                  <TableCell>{r.tabla}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.accion}</Badge>
                  </TableCell>
                  <TableCell className="num text-xs">{r.registro_id}</TableCell>
                  <TableCell className="max-w-md">
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Ver detalle
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto rounded bg-muted p-2 text-[11px]">
                        {JSON.stringify(
                          { antes: r.valores_antes, despues: r.valores_despues },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
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
