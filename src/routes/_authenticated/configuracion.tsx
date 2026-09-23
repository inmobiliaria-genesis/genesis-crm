import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
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
import { usePerfil, esAdmin } from "@/lib/sesion";
import { fecha, numero, hoyLima } from "@/lib/format";

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
    enabled: esAdmin(perfil),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config")
        .select("*")
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

  if (!isLoading && !esAdmin(perfil)) {
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
          <NuevoValor onListo={() => qc.invalidateQueries({ queryKey: ["config"] })} />
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
                    {actual ? numero(actual.valor, 4) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vigente desde {actual ? fecha(actual.vigente_desde) : "—"}
                  </p>
                </div>
                <NuevoValor
                  claveFija={clave}
                  onListo={() => qc.invalidateQueries({ queryKey: ["config"] })}
                />
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
                        <TableCell className="num text-right">{numero(f.valor, 4)}</TableCell>
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
    </AppShell>
  );
}

function NuevoValor({ claveFija, onListo }: { claveFija?: string; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(claveFija ?? "");
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState(hoyLima());

  async function guardar() {
    const { error } = await supabase
      .from("config")
      .insert({ clave, valor: Number(valor), vigente_desde: desde });
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
            <Input type="number" step="0.0001" value={valor} onChange={(e) => setValor(e.target.value)} />
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
