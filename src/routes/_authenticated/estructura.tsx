import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Ban, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePerfil, puedeEditarEstructura } from "@/lib/sesion";
import { fecha } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estructura")({
  head: () => ({
    meta: [
      { title: "Estructura — Gestión de lotes" },
      { name: "description", content: "Proyectos, etapas y manzanas del habilitado urbano." },
      { property: "og:title", content: "Estructura — Gestión de lotes" },
      { property: "og:description", content: "Proyectos, etapas y manzanas del habilitado urbano." },
    ],
  }),
  component: EstructuraPage,
});

function EstructuraPage() {
  const { data: perfil } = usePerfil();
  const editable = puedeEditarEstructura(perfil);
  const qc = useQueryClient();
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [etapaId, setEtapaId] = useState<string | null>(null);

  const proyectos = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyecto")
        .select("*")
        .order("creado_en", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const etapas = useQuery({
    queryKey: ["etapas", proyectoId],
    enabled: !!proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etapa")
        .select("*")
        .eq("proyecto_id", proyectoId!)
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const manzanas = useQuery({
    queryKey: ["manzanas", etapaId],
    enabled: !!etapaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manzana")
        .select("*")
        .eq("etapa_id", etapaId!)
        .order("letra");
      if (error) throw error;
      return data;
    },
  });

  const anular = useMutation({
    mutationFn: async ({
      tabla,
      id,
      motivo,
    }: {
      tabla: "proyecto" | "etapa" | "manzana";
      id: string;
      motivo: string;
    }) => {
      const { error } = await supabase
        .from(tabla)
        .update({ anulado: true, motivo_anulacion: motivo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro anulado");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error("No se pudo anular", { description: e.message }),
  });

  return (
    <AppShell
      titulo="Estructura"
      descripcion="Proyectos, etapas y manzanas"
      acciones={
        editable ? (
          <NuevoProyecto onListo={() => qc.invalidateQueries({ queryKey: ["proyectos"] })} />
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proyectos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {proyectos.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay proyectos.</p>
            ) : null}
            {proyectos.data?.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProyectoId(p.id);
                  setEtapaId(null);
                }}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  proyectoId === p.id ? "border-primary bg-secondary" : "border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.nombre}</span>
                  {p.anulado ? <Badge variant="destructive">Anulado</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">{p.ubicacion || "Sin ubicación"}</p>
                <p className="text-xs text-muted-foreground">Creado {fecha(p.creado_en)}</p>
                {editable && !p.anulado ? (
                  <span className="mt-2 flex gap-2">
                    <EditarSimple
                      tabla="proyecto"
                      id={p.id}
                      campos={{ nombre: p.nombre, ubicacion: p.ubicacion ?? "", notas: p.notas ?? "" }}
                    />
                    <AnularBoton
                      onAnular={(motivo) => anular.mutate({ tabla: "proyecto", id: p.id, motivo })}
                    />
                  </span>
                ) : null}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Etapas</CardTitle>
            {editable && proyectoId ? (
              <NuevaEtapa
                proyectoId={proyectoId}
                onListo={() => qc.invalidateQueries({ queryKey: ["etapas"] })}
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {!proyectoId ? (
              <p className="text-sm text-muted-foreground">Elige un proyecto.</p>
            ) : etapas.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este proyecto no tiene etapas.</p>
            ) : null}
            {etapas.data?.map((e) => (
              <button
                key={e.id}
                onClick={() => setEtapaId(e.id)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  etapaId === e.id ? "border-primary bg-secondary" : "border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.nombre}</span>
                  {e.anulado ? <Badge variant="destructive">Anulada</Badge> : null}
                </div>
                {editable && !e.anulado ? (
                  <span className="mt-2 flex gap-2">
                    <EditarSimple
                      tabla="etapa"
                      id={e.id}
                      campos={{ nombre: e.nombre, notas: e.notas ?? "" }}
                    />
                    <AnularBoton
                      onAnular={(motivo) => anular.mutate({ tabla: "etapa", id: e.id, motivo })}
                    />
                  </span>
                ) : null}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Manzanas</CardTitle>
            {editable && etapaId ? (
              <NuevaManzana
                etapaId={etapaId}
                onListo={() => qc.invalidateQueries({ queryKey: ["manzanas"] })}
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {!etapaId ? (
              <p className="text-sm text-muted-foreground">Elige una etapa.</p>
            ) : manzanas.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Esta etapa no tiene manzanas.</p>
            ) : null}
            {manzanas.data?.map((m) => (
              <div key={m.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Manzana {m.letra}</span>
                  {m.anulado ? <Badge variant="destructive">Anulada</Badge> : null}
                </div>
                {m.notas ? <p className="text-xs text-muted-foreground">{m.notas}</p> : null}
                {editable && !m.anulado ? (
                  <div className="mt-2 flex gap-2">
                    <EditarSimple
                      tabla="manzana"
                      id={m.id}
                      campos={{ letra: m.letra, notas: m.notas ?? "" }}
                    />
                    <AnularBoton
                      onAnular={(motivo) => anular.mutate({ tabla: "manzana", id: m.id, motivo })}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function NuevoProyecto({ onListo }: { onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [notas, setNotas] = useState("");

  async function guardar() {
    const { error } = await supabase.from("proyecto").insert({ nombre, ubicacion, notas });
    if (error) { toast.error("No se pudo crear", { description: error.message }); return; }
    toast.success("Proyecto creado");
    setAbierto(false);
    setNombre("");
    setUbicacion("");
    setNotas("");
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nuevo proyecto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Ubicación</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={!nombre}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevaEtapa({ proyectoId, onListo }: { proyectoId: string; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");

  async function guardar() {
    const { error } = await supabase.from("etapa").insert({ proyecto_id: proyectoId, nombre });
    if (error) { toast.error("No se pudo crear", { description: error.message }); return; }
    toast.success("Etapa creada");
    setAbierto(false);
    setNombre("");
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva etapa</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={!nombre}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevaManzana({ etapaId, onListo }: { etapaId: string; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [letra, setLetra] = useState("");

  async function guardar() {
    const { error } = await supabase
      .from("manzana")
      .insert({ etapa_id: etapaId, letra: letra.toUpperCase() });
    if (error) { toast.error("No se pudo crear", { description: error.message }); return; }
    toast.success("Manzana creada");
    setAbierto(false);
    setLetra("");
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva manzana</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Letra</Label>
          <Input value={letra} onChange={(e) => setLetra(e.target.value)} maxLength={3} />
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={!letra}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarSimple({
  tabla,
  id,
  campos,
}: {
  tabla: "proyecto" | "etapa" | "manzana";
  id: string;
  campos: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState(campos);

  async function guardar() {
    const { error } = await supabase.from(tabla).update(valores).eq("id", id);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success("Cambios guardados");
    setAbierto(false);
    qc.invalidateQueries();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setValores(campos);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Editar</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {Object.entries(valores).map(([clave, valor]) => (
            <div key={clave} className="space-y-1">
              <Label className="capitalize">{clave}</Label>
              <Input
                value={valor}
                onChange={(e) => setValores((v) => ({ ...v, [clave]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnularBoton({ onAnular }: { onAnular: (motivo: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
          <Ban className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Anular registro</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Motivo de anulación</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!motivo}
            onClick={() => {
              onAnular(motivo);
              setAbierto(false);
              setMotivo("");
            }}
          >
            Anular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
