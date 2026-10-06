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
import { BarraFiltros, Buscador, ColOrden, FiltroMulti, FiltroRango, RANGO_VACIO, coincide, enLista, useOrden } from "@/components/ListaControles";

const TABLAS = ["proyecto", "etapa", "manzana", "lote", "plano", "lote_ubicacion", "perfil", "config", "vendedor", "cliente", "lead", "reserva", "venta", "venta_titular", "cuota", "pago", "pago_aplicacion", "comision", "desistimiento", "desistimiento_devolucion", "gasto", "gasto_categoria", "gasto_subcategoria", "personal", "planilla_linea", "deuda", "deuda_abono"];

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

  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [tablas, setTablas] = useState<string[]>([]);
  const [rango, setRango] = useState(RANGO_VACIO);
  const [buscar, setBuscar] = useState("");
  const desde = rango.min;
  const hasta = rango.max;

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
    queryKey: ["bitacora", usuarios, tablas, desde, hasta],
    enabled: permitido,
    queryFn: async () => {
      let consulta = supabase
        .from("bitacora")
        .select("*")
        .order("fecha_hora", { ascending: false })
        .limit(500);
      if (usuarios.length) consulta = consulta.in("usuario_id", usuarios);
      if (tablas.length) consulta = consulta.in("tabla", tablas);
      if (desde) consulta = consulta.gte("fecha_hora", `${desde}T00:00:00-05:00`);
      if (hasta) consulta = consulta.lte("fecha_hora", `${hasta}T23:59:59-05:00`);
      const { data, error } = await consulta;
      if (error) throw error;
      return data;
    },
  });

  const filtrados = useMemo(
    () =>
      (registros.data ?? []).filter((r) =>
        enLista(r.tabla, tablas) &&
        coincide(buscar, r.tabla, r.accion, r.registro_id, mapaUsuarios.get(r.usuario_id ?? "") ?? "Sistema",
          JSON.stringify(r.valores_antes ?? ""), JSON.stringify(r.valores_despues ?? "")),
      ),
    [registros.data, tablas, buscar, mapaUsuarios],
  );
  const { ordenadas, orden, alternar } = useOrden(filtrados, {
    fecha: (r) => r.fecha_hora,
    usuario: (r) => mapaUsuarios.get(r.usuario_id ?? "") ?? "Sistema",
    tabla: (r) => r.tabla,
    accion: (r) => r.accion,
    registro: (r) => r.registro_id,
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
      <BarraFiltros
        onLimpiar={() => { setUsuarios([]); setTablas([]); setRango(RANGO_VACIO); setBuscar(""); }}
        mostrando={filtrados.length}
        total={registros.data?.length ?? 0}
      >
        <Buscador placeholder="Texto en cualquier campo" valor={buscar} onCambio={setBuscar} />
        <FiltroMulti label="Usuario" opciones={(perfiles.data ?? []).map((p) => ({ valor: p.user_id, etiqueta: p.nombre }))} valor={usuarios} onCambio={setUsuarios} />
        <FiltroMulti label="Módulo" opciones={TABLAS.map((t) => ({ valor: t, etiqueta: t }))} valor={tablas} onCambio={setTablas} />
        <FiltroRango label="Fecha" tipo="date" valor={rango} onCambio={setRango} />
      </BarraFiltros>
      <p className="mb-2 text-xs text-muted-foreground">Se cargan los 500 movimientos más recientes que cumplen los filtros de usuario, módulo y fecha.</p>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <ColOrden clave="fecha" orden={orden} onOrden={alternar}>Fecha y hora</ColOrden>
              <ColOrden clave="usuario" orden={orden} onOrden={alternar}>Usuario</ColOrden>
              <ColOrden clave="tabla" orden={orden} onOrden={alternar}>Tabla</ColOrden>
              <ColOrden clave="accion" orden={orden} onOrden={alternar}>Acción</ColOrden>
              <ColOrden clave="registro" orden={orden} onOrden={alternar}>Registro</ColOrden>
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
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin movimientos con estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              ordenadas.map((r) => (
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
