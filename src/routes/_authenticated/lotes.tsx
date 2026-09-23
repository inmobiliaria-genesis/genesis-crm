import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Upload, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { usePerfil, puedeEditarEstructura, esAdmin } from "@/lib/sesion";
import { soles, numero } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Lote = Database["public"]["Tables"]["lote"]["Row"];

const CAMPOS_NUMERICOS = [
  ["area_m2", "Área (m²)"],
  ["precio_lista", "Precio de lista (S/)"],
  ["frente_m", "Frente (m)"],
  ["fondo_m", "Fondo (m)"],
  ["lado_derecho_m", "Lado derecho (m)"],
  ["lado_izquierdo_m", "Lado izquierdo (m)"],
] as const;

function estaPendiente(l: Lote) {
  return CAMPOS_NUMERICOS.some(([campo]) => l[campo] === null || l[campo] === undefined);
}

export const Route = createFileRoute("/_authenticated/lotes")({
  head: () => ({
    meta: [
      { title: "Lotes — Gestión de lotes" },
      { name: "description", content: "Listado, alta por rango e importación de lotes." },
      { property: "og:title", content: "Lotes — Gestión de lotes" },
      { property: "og:description", content: "Listado, alta por rango e importación de lotes." },
    ],
  }),
  component: LotesPage,
});

function LotesPage() {
  const { data: perfil } = usePerfil();
  const editable = puedeEditarEstructura(perfil);
  const qc = useQueryClient();

  const [proyectoId, setProyectoId] = useState<string>("");
  const [etapaId, setEtapaId] = useState<string>("");
  const [manzanaId, setManzanaId] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const proyectos = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proyecto").select("*").order("nombre");
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
        .eq("proyecto_id", proyectoId)
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const manzanas = useQuery({
    queryKey: ["manzanas-ambito", proyectoId, etapaId],
    queryFn: async () => {
      let consulta = supabase
        .from("manzana")
        .select("id, letra, etapa_id, tipo, etapa!inner(proyecto_id)")
        .eq("tipo", "residencial");
      if (etapaId) consulta = consulta.eq("etapa_id", etapaId);
      else if (proyectoId) consulta = consulta.eq("etapa.proyecto_id", proyectoId);
      const { data, error } = await consulta.order("letra");
      if (error) throw error;
      return data;
    },
  });

  const idsManzana = useMemo(() => (manzanas.data ?? []).map((m) => m.id), [manzanas.data]);
  const mapaManzana = useMemo(
    () => new Map((manzanas.data ?? []).map((m) => [m.id, m.letra])),
    [manzanas.data],
  );

  const lotes = useQuery({
    queryKey: ["lotes", manzanaId, idsManzana.join(",")],
    enabled: manzanas.isSuccess,
    queryFn: async () => {
      let consulta = supabase.from("lote").select("*").order("numero");
      if (manzanaId) consulta = consulta.eq("manzana_id", manzanaId);
      else consulta = consulta.in("manzana_id", idsManzana.length > 0 ? idsManzana : ["-"]);
      const { data, error } = await consulta.limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const filtrados = useMemo(() => {
    let lista = lotes.data ?? [];
    if (soloPendientes) lista = lista.filter(estaPendiente);
    if (busqueda.trim()) {
      const b = busqueda.trim().toLowerCase();
      lista = lista.filter(
        (l) =>
          String(l.numero).includes(b) ||
          (mapaManzana.get(l.manzana_id) ?? "").toLowerCase().includes(b),
      );
    }
    return lista;
  }, [lotes.data, soloPendientes, busqueda, mapaManzana]);

  const pendientes = (lotes.data ?? []).filter(estaPendiente).length;

  function limpiarSeleccion(nivel: "proyecto" | "etapa") {
    if (nivel === "proyecto") {
      setEtapaId("");
      setManzanaId("");
    } else {
      setManzanaId("");
    }
  }

  return (
    <AppShell
      titulo="Lotes"
      descripcion={`${filtrados.length} lote(s) · ${pendientes} con datos pendientes`}
      acciones={
        editable ? (
          <>
            <AltaPorRango
              manzanas={manzanas.data ?? []}
              onListo={() => qc.invalidateQueries({ queryKey: ["lotes"] })}
            />
            {esAdmin(perfil) ? (
              <ImportarExcel
                manzanas={manzanas.data ?? []}
                onListo={() => qc.invalidateQueries({ queryKey: ["lotes"] })}
              />
            ) : null}
          </>
        ) : null
      }
    >
      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5">
        <div className="space-y-1">
          <Label>Proyecto</Label>
          <Select
            value={proyectoId || "todos"}
            onValueChange={(v) => {
              setProyectoId(v === "todos" ? "" : v);
              limpiarSeleccion("proyecto");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {proyectos.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Etapa</Label>
          <Select
            value={etapaId || "todas"}
            onValueChange={(v) => {
              setEtapaId(v === "todas" ? "" : v);
              limpiarSeleccion("etapa");
            }}
            disabled={!proyectoId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {etapas.data?.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Manzana</Label>
          <Select
            value={manzanaId || "todas"}
            onValueChange={(v) => setManzanaId(v === "todas" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {manzanas.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  Mz. {m.letra}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Buscar</Label>
          <Input
            placeholder="N° de lote o manzana"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={soloPendientes}
              onCheckedChange={(v) => setSoloPendientes(Boolean(v))}
            />
            Solo pendientes de completar
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Manzana</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Área m²</TableHead>
              <TableHead className="text-right">Precio de lista</TableHead>
              <TableHead className="text-right">Frente</TableHead>
              <TableHead className="text-right">Fondo</TableHead>
              <TableHead className="text-right">Lado der.</TableHead>
              <TableHead className="text-right">Lado izq.</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes.isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No hay lotes con estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((l) => (
                <TableRow key={l.id} className={l.anulado ? "opacity-50" : undefined}>
                  <TableCell>Mz. {mapaManzana.get(l.manzana_id) ?? "—"}</TableCell>
                  <TableCell className="num font-medium">{l.numero}</TableCell>
                  <TableCell className="num text-right">{numero(l.area_m2)}</TableCell>
                  <TableCell className="num text-right">{soles(l.precio_lista)}</TableCell>
                  <TableCell className="num text-right">{numero(l.frente_m)}</TableCell>
                  <TableCell className="num text-right">{numero(l.fondo_m)}</TableCell>
                  <TableCell className="num text-right">{numero(l.lado_derecho_m)}</TableCell>
                  <TableCell className="num text-right">{numero(l.lado_izquierdo_m)}</TableCell>
                  <TableCell>
                    {l.anulado ? (
                      <Badge variant="destructive">Anulado</Badge>
                    ) : estaPendiente(l) ? (
                      <Badge variant="outline" className="border-accent text-accent-foreground">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Datos pendientes
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Completo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && !l.anulado ? (
                      <EditarLote lote={l} onListo={() => qc.invalidateQueries({ queryKey: ["lotes"] })} />
                    ) : null}
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

type ManzanaOpcion = { id: string; letra: string; tipo?: string };

function AltaPorRango({
  manzanas,
  onListo,
}: {
  manzanas: ManzanaOpcion[];
  onListo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [manzanaId, setManzanaId] = useState("");
  const [desde, setDesde] = useState("1");
  const [hasta, setHasta] = useState("10");
  const [area, setArea] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const d = Number(desde);
    const h = Number(hasta);
    if (!manzanaId || !Number.isInteger(d) || !Number.isInteger(h) || h < d) {
      toast.error("Revisa la manzana y el rango de numeración");
      return;
    }
    setGuardando(true);
    const filas = [];
    for (let n = d; n <= h; n++) {
      filas.push({
        manzana_id: manzanaId,
        numero: n,
        area_m2: area ? Number(area) : null,
        precio_lista: precio ? Number(precio) : null,
      });
    }
    const { error } = await supabase.from("lote").insert(filas);
    setGuardando(false);
    if (error) { toast.error("No se pudieron crear los lotes", { description: error.message }); return; }
    toast.success(`${filas.length} lote(s) creados`);
    setAbierto(false);
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Alta por rango
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alta rápida por rango</DialogTitle>
          <DialogDescription>
            Crea varios lotes correlativos en una manzana. Los datos que dejes vacíos quedarán como
            pendientes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Manzana</Label>
            <Select value={manzanaId} onValueChange={setManzanaId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una manzana" />
              </SelectTrigger>
              <SelectContent>
                {manzanas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    Mz. {m.letra}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Desde el N°</Label>
              <Input type="number" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hasta el N°</Label>
              <Input type="number" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Área m² (opcional)</Label>
              <Input type="number" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Precio S/ (opcional)</Label>
              <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando}>
            Crear lotes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarLote({ lote, onListo }: { lote: Lote; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState(lote.notas ?? "");

  function abrir() {
    const iniciales: Record<string, string> = {};
    CAMPOS_NUMERICOS.forEach(([campo]) => {
      const v = lote[campo];
      iniciales[campo] = v === null || v === undefined ? "" : String(v);
    });
    setValores(iniciales);
    setNotas(lote.notas ?? "");
  }

  async function guardar() {
    const cambios: Record<string, number | null | string> = { notas };
    CAMPOS_NUMERICOS.forEach(([campo]) => {
      const v = valores[campo];
      cambios[campo] = v === "" || v === undefined ? null : Number(v);
    });
    const { error } = await supabase.from("lote").update(cambios as never).eq("id", lote.id);
    if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
    toast.success("Lote actualizado");
    setAbierto(false);
    onListo();
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) abrir();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lote N° {lote.numero}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {CAMPOS_NUMERICOS.map(([campo, etiqueta]) => (
            <div key={campo} className="space-y-1">
              <Label>{etiqueta}</Label>
              <Input
                type="number"
                step="0.01"
                value={valores[campo] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              />
            </div>
          ))}
          <div className="col-span-2 space-y-1">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportarExcel({
  manzanas,
  onListo,
}: {
  manzanas: ManzanaOpcion[];
  onListo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [manzanaId, setManzanaId] = useState("");
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [procesando, setProcesando] = useState(false);

  async function leerArchivo(archivo: File) {
    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]!]!;
    const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
    setFilas(datos);
    toast.success(`${datos.length} fila(s) leídas del archivo`);
  }

  async function importar() {
    if (!manzanaId) { toast.error("Elige la manzana de destino"); return; }
    const destino = manzanas.find((m) => m.id === manzanaId);
    if (!destino || destino.tipo !== "residencial") {
      toast.error("Solo se pueden importar lotes a manzanas residenciales");
      return;
    }
    const payload = filas
      .map((f) => {
        const obtener = (clave: string) => {
          const entrada = Object.entries(f).find(
            ([k]) => k.trim().toLowerCase() === clave.toLowerCase(),
          );
          return entrada ? String(entrada[1] ?? "") : "";
        };
        return {
          manzana_id: manzanaId,
          numero: obtener("numero") || obtener("lote"),
          area_m2: obtener("area_m2") || obtener("area"),
          precio_lista: obtener("precio_lista") || obtener("precio"),
          frente_m: obtener("frente_m") || obtener("frente"),
          fondo_m: obtener("fondo_m") || obtener("fondo"),
          lado_derecho_m: obtener("lado_derecho_m") || obtener("lado derecho"),
          lado_izquierdo_m: obtener("lado_izquierdo_m") || obtener("lado izquierdo"),
          notas: obtener("notas"),
        };
      })
      .filter((f) => f.numero !== "");

    if (payload.length === 0) { toast.error("El archivo no tiene una columna 'numero' con datos"); return; }

    setProcesando(true);
    const { data, error } = await supabase.rpc("importar_lotes", { p_filas: payload });
    setProcesando(false);
    if (error) { toast.error("No se pudo importar", { description: error.message }); return; }
    const resultado = data as { creados?: number; omitidos?: number } | null;
    toast.success(
      `Importación lista: ${resultado?.creados ?? 0} creados, ${resultado?.omitidos ?? 0} omitidos`,
    );
    setAbierto(false);
    setFilas([]);
    onListo();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-1 h-4 w-4" /> Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar lotes desde Excel</DialogTitle>
          <DialogDescription>
            Columnas reconocidas: numero, area_m2, precio_lista, frente_m, fondo_m, lado_derecho_m,
            lado_izquierdo_m, notas. Los lotes ya existentes se omiten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Manzana de destino</Label>
            <Select value={manzanaId} onValueChange={setManzanaId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una manzana" />
              </SelectTrigger>
              <SelectContent>
                {manzanas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    Mz. {m.letra}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Archivo (.xlsx o .csv)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) leerArchivo(archivo);
              }}
            />
          </div>
          {filas.length > 0 ? (
            <p className="text-sm text-muted-foreground">{filas.length} fila(s) listas para importar.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={importar} disabled={procesando || filas.length === 0}>
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
