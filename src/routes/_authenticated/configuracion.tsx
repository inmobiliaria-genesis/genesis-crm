import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { CategoriasGasto } from "@/components/CategoriasGasto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePerfil, esAdmin, puedeVerAdmin } from "@/lib/sesion";
import { fecha, conUnidad, hoyLima } from "@/lib/format";

const NOMBRE_UNIDAD: Record<string, string> = { soles: "S/", porcentaje: "%", lotes: "lotes", cuotas: "cuotas", dias: "días", si_no: "1 = Sí, 0 = No" };

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Gestión de lotes" },
      { name: "description", content: "Valores del sistema y su historial de vigencia." },
      { property: "og:title", content: "Configuración — Gestión de lotes" },
      { property: "og:description", content: "Valores del sistema y su historial de vigencia." },
    ],
  }),
  component: ConfiguracionPage,
});

function ConfiguracionPage() {
  const { data: perfil, isLoading } = usePerfil();
  const qc = useQueryClient();

  const config = useQuery({
    queryKey: ["config"],
    enabled: puedeVerAdmin(perfil),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config")
        .select("*")
        .eq("activo", true)
        .order("clave")
        .order("vigente_desde", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof config.data>>();
    (config.data ?? []).forEach((c) => {
      const lista = mapa.get(c.clave) ?? [];
      lista.push(c);
      mapa.set(c.clave, lista);
    });
    return [...mapa.entries()];
  }, [config.data]);

  if (!isLoading && !puedeVerAdmin(perfil)) {
    return (
      <AppShell titulo="Configuración">
        <p className="text-sm text-muted-foreground">Solo un administrador puede ver esta pantalla.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Configuración"
      descripcion="Cada cambio crea un nuevo valor vigente y conserva el historial"
      acciones={
        <>
          <Button asChild size="sm" variant="outline">
            <Link to="/colores-mapa">Colores del mapa</Link>
          </Button>
          {esAdmin(perfil) ? <NuevoValor onListo={() => qc.invalidateQueries({ queryKey: ["config"] })} /> : null}
        </>
      }
    >
      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay valores configurados.</p>
      ) : null}
      <div className="space-y-4">
        {grupos.map(([clave, filas]) => {
          const vigentes = filas.filter((f) => !f.anulado);
          const actual = vigentes[0];
          return (
            <Card key={clave}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{clave}</CardTitle>
                  <p className="num mt-1 text-2xl font-semibold">
                    {actual ? conUnidad(actual.valor, actual.unidad) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vigente desde {actual ? fecha(actual.vigente_desde) : "—"}
                  </p>
                </div>
                {esAdmin(perfil) ? <NuevoValor
                  claveFija={clave}
                  unidad={actual?.unidad ?? filas[0]?.unidad ?? null}
                  onListo={() => qc.invalidateQueries({ queryKey: ["config"] })}
                /> : null}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vigente desde</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Registrado</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="num">{fecha(f.vigente_desde)}</TableCell>
                        <TableCell className="num text-right">{conUnidad(f.valor, f.unidad)}</TableCell>
                        <TableCell>{fecha(f.creado_en)}</TableCell>
                        <TableCell>
                          {f.anulado ? (
                            <Badge variant="destructive">Anulado</Badge>
                          ) : f.id === actual?.id ? (
                            <Badge variant="secondary">Vigente</Badge>
                          ) : (
                            <Badge variant="outline">Histórico</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-6">
        <CategoriasGasto editable={esAdmin(perfil)} />
      </div>
    </AppShell>
  );
}

function NuevoValor({ claveFija, unidad, onListo }: { claveFija?: string; unidad?: string | null; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(claveFija ?? "");
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState(hoyLima());

  async function guardar() {
    const { error } = await supabase
      .from("config")
      .insert({ clave, valor: Number(valor), vigente_desde: desde, unidad: unidad ?? null });
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success("Valor registrado");
    setAbierto(false);
    setValor("");
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant={claveFija ? "outline" : "default"}>
          <Plus className="mr-1 h-4 w-4" /> {claveFija ? "Nuevo valor" : "Nueva clave"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{claveFija ? `Nuevo valor para ${claveFija}` : "Nueva clave"}</DialogTitle>
          <DialogDescription>
            El valor anterior se mantiene en el historial con su fecha de vigencia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Clave</Label>
            <Input
              value={clave}
              disabled={!!claveFija}
              onChange={(e) => setClave(e.target.value)}
              placeholder="por_ejemplo: comision_asesor"
            />
          </div>
          <div className="space-y-1">
            <Label>Valor</Label>
            <div className="flex items-center gap-2">
              {unidad === "soles" ? <span className="text-sm text-muted-foreground">S/</span> : null}
              <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
              {unidad && unidad !== "soles" ? <span className="whitespace-nowrap text-sm text-muted-foreground">{NOMBRE_UNIDAD[unidad]}</span> : null}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Vigente desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={!clave || valor === ""}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
