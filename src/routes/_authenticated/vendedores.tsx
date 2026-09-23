import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePerfil, esAdmin } from "@/lib/sesion";
import {
  ETIQUETA_ESTADO_VENDEDOR,
  ETIQUETA_TIPO,
  nombreVendedor,
  useVendedores,
  type Vendedor,
} from "@/lib/vendedores";

export const Route = createFileRoute("/_authenticated/vendedores")({
  head: () => ({
    meta: [
      { title: "Vendedores — Gestión de lotes" },
      { name: "description", content: "Encargados y promotores de ventas, con importación desde Excel." },
      { property: "og:title", content: "Vendedores — Gestión de lotes" },
      { property: "og:description", content: "Encargados y promotores de ventas, con importación desde Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendedoresPage,
});

function VendedoresPage() {
  const { data: perfil } = usePerfil();
  const admin = esAdmin(perfil);
  const vendedores = useVendedores();
  const [tipo, setTipo] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<Vendedor | "nuevo" | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const lista = vendedores.data ?? [];
  const porId = useMemo(() => new Map(lista.map((v) => [v.id, v])), [lista]);

  const filtrados = lista.filter((v) => {
    if (tipo !== "todos" && v.tipo !== tipo) return false;
    if (estado !== "todos" && v.estado !== estado) return false;
    const t = buscar.trim().toLowerCase();
    if (t && ![v.nombre, v.apodo ?? "", v.dni ?? ""].some((x) => x.toLowerCase().includes(t))) return false;
    return true;
  });

  const vFicha = ficha ? porId.get(ficha) : null;

  return (
    <AppShell
      titulo="Vendedores"
      descripcion="Encargados y promotores"
      acciones={
        admin ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setImportando(true)}>
              <Upload className="mr-1 h-4 w-4" /> Importar Excel
            </Button>
            <Button onClick={() => setEditando("nuevo")}>+ Nuevo vendedor</Button>
          </>
        ) : null
      }
    >
      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="encargado">Encargado</SelectItem>
              <SelectItem value="promotor">Promotor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Estado</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="salio">Salió</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Buscar</Label>
          <Input placeholder="Nombre, apodo o DNI" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>DNI</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Encargado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendedores.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin vendedores.</TableCell></TableRow>
            ) : (
              filtrados.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{nombreVendedor(v)}</TableCell>
                  <TableCell>{ETIQUETA_TIPO[v.tipo]}</TableCell>
                  <TableCell>{v.dni ?? "—"}</TableCell>
                  <TableCell>{v.telefono ?? "—"}</TableCell>
                  <TableCell>{v.encargado_id ? nombreVendedor(porId.get(v.encargado_id)) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={v.estado === "activo" ? "secondary" : "outline"}>{ETIQUETA_ESTADO_VENDEDOR[v.estado]}</Badge>
                  </TableCell>
                  <TableCell>{v.usuario_id ? "Vinculada" : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setFicha(v.id)}>Ver</Button>
                    {admin ? <Button size="sm" variant="ghost" onClick={() => setEditando(v)}>Editar</Button> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!vFicha} onOpenChange={(o) => (!o ? setFicha(null) : null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>{nombreVendedor(vFicha)}</SheetTitle></SheetHeader>
          {vFicha ? (
            <div className="mt-4 space-y-2 text-sm">
              <p><span className="text-muted-foreground">Tipo:</span> {ETIQUETA_TIPO[vFicha.tipo]}</p>
              <p><span className="text-muted-foreground">Estado:</span> {ETIQUETA_ESTADO_VENDEDOR[vFicha.estado]}</p>
              <p><span className="text-muted-foreground">DNI:</span> {vFicha.dni ?? "—"}</p>
              <p><span className="text-muted-foreground">Teléfono:</span> {vFicha.telefono ?? "—"}</p>
              <p><span className="text-muted-foreground">Cuenta:</span> {vFicha.usuario_id ? "Vinculada" : "Sin cuenta"}</p>
              {vFicha.notas ? <p><span className="text-muted-foreground">Notas:</span> {vFicha.notas}</p> : null}
              {vFicha.tipo === "promotor" ? (
                <p><span className="text-muted-foreground">Encargado:</span> {vFicha.encargado_id ? nombreVendedor(porId.get(vFicha.encargado_id)) : "Sin encargado"}</p>
              ) : (
                <div className="pt-2">
                  <p className="mb-1 font-medium">Promotores</p>
                  {lista.filter((p) => p.encargado_id === vFicha.id).length === 0 ? (
                    <p className="text-muted-foreground">Sin promotores.</p>
                  ) : (
                    <ul className="list-disc pl-5">
                      {lista.filter((p) => p.encargado_id === vFicha.id).map((p) => <li key={p.id}>{nombreVendedor(p)}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {editando ? (
        <EditarVendedor
          vendedor={editando === "nuevo" ? null : editando}
          encargados={lista.filter((v) => v.tipo === "encargado")}
          vinculadas={new Set(lista.filter((v) => v.usuario_id).map((v) => v.usuario_id!))}
          onCerrar={() => setEditando(null)}
        />
      ) : null}
      {importando ? <ImportarVendedores existentes={lista} onCerrar={() => setImportando(false)} /> : null}
    </AppShell>
  );
}

function EditarVendedor({
  vendedor,
  encargados,
  vinculadas,
  onCerrar,
}: {
  vendedor: Vendedor | null;
  encargados: Vendedor[];
  vinculadas: Set<string>;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState(vendedor?.tipo ?? "encargado");
  const [nombre, setNombre] = useState(vendedor?.nombre ?? "");
  const [apodo, setApodo] = useState(vendedor?.apodo ?? "");
  const [dni, setDni] = useState(vendedor?.dni ?? "");
  const [telefono, setTelefono] = useState(vendedor?.telefono ?? "");
  const [encargadoId, setEncargadoId] = useState(vendedor?.encargado_id ?? "ninguno");
  const [estado, setEstado] = useState(vendedor?.estado ?? "activo");
  const [usuarioId, setUsuarioId] = useState(vendedor?.usuario_id ?? "ninguno");
  const [notas, setNotas] = useState(vendedor?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  const cuentas = useQuery({
    queryKey: ["perfiles-cuentas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("user_id, nombre").eq("anulado", false).order("nombre");
      if (error) throw error;
      return data;
    },
  });

  async function guardar() {
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setGuardando(true);
    const fila = {
      tipo,
      nombre: nombre.trim(),
      apodo: apodo.trim() || null,
      dni: dni.trim() || null,
      telefono: telefono.trim() || null,
      encargado_id: tipo === "promotor" && encargadoId !== "ninguno" ? encargadoId : null,
      estado,
      usuario_id: usuarioId !== "ninguno" ? usuarioId : null,
      notas: notas.trim() || null,
    };
    const { error } = vendedor
      ? await supabase.from("vendedor").update(fila).eq("id", vendedor.id)
      : await supabase.from("vendedor").insert(fila);
    setGuardando(false);
    if (error) {
      const msg = error.message.includes("vendedor_apodo_unico") ? "Ese apodo ya existe" : error.message.includes("usuario_id") ? "Esa cuenta ya está vinculada a otro vendedor" : error.message;
      toast.error("No se pudo guardar", { description: msg });
      return;
    }
    toast.success("Vendedor guardado");
    qc.invalidateQueries({ queryKey: ["vendedores"] });
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{vendedor ? "Editar vendedor" : "Nuevo vendedor"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="encargado">Encargado</SelectItem>
                <SelectItem value="promotor">Promotor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="salio">Salió</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div><Label>Apodo (opcional)</Label><Input value={apodo} onChange={(e) => setApodo(e.target.value)} /></div>
          <div><Label>DNI (opcional)</Label><Input value={dni} onChange={(e) => setDni(e.target.value)} /></div>
          <div><Label>Teléfono (opcional)</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          {tipo === "promotor" ? (
            <div>
              <Label>Encargado (opcional)</Label>
              <Select value={encargadoId} onValueChange={setEncargadoId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin encargado</SelectItem>
                  {encargados.filter((e) => e.id !== vendedor?.id).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{nombreVendedor(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label>Cuenta de acceso (opcional)</Label>
            <Select value={usuarioId} onValueChange={setUsuarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguno">Sin cuenta</SelectItem>
                {(cuentas.data ?? [])
                  .filter((c) => c.user_id === vendedor?.usuario_id || !vinculadas.has(c.user_id))
                  .map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>Notas</Label><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={guardar} disabled={guardando}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS = ["tipo", "nombre", "apodo", "dni", "telefono", "encargado_apodo", "estado", "notas"];

type Fila = { indice: number; tipo: string; nombre: string; apodo: string; encargado: string; error: string | null; omitir: boolean; payload: Record<string, string> | null };

function descargarPlantilla() {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([COLUMNAS]), "vendedores");
  XLSX.writeFile(libro, "plantilla-vendedores.xlsx");
}

function ImportarVendedores({ existentes, onCerrar }: { existentes: Vendedor[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [procesando, setProcesando] = useState(false);

  async function leer(archivo: File) {
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
    const datos = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[libro.SheetNames[0]!]!, { defval: "" });
    const apodosBase = new Map(existentes.filter((v) => v.apodo).map((v) => [v.apodo!.trim().toLowerCase(), v.tipo]));
    const norm = datos.map((f) => {
      const g = (k: string) => {
        const e = Object.entries(f).find(([c]) => c.trim().toLowerCase() === k);
        return e ? String(e[1] ?? "").trim() : "";
      };
      return Object.fromEntries(COLUMNAS.map((c) => [c, g(c)])) as Record<string, string>;
    });
    const encargadosArchivo = new Set(
      norm.filter((f) => f["tipo"]!.toLowerCase() === "encargado" && f["apodo"]).map((f) => f["apodo"]!.toLowerCase()),
    );
    const vistos = new Map<string, number>();
    for (const f of norm) if (f["apodo"]) vistos.set(f["apodo"].toLowerCase(), (vistos.get(f["apodo"].toLowerCase()) ?? 0) + 1);

    setFilas(
      norm.map((f, i) => {
        const tipo = f["tipo"]!.toLowerCase();
        const estado = (f["estado"] || "activo").toLowerCase();
        const apodo = f["apodo"]!;
        const enc = f["encargado_apodo"]!;
        const base: Fila = { indice: i + 2, tipo, nombre: f["nombre"]!, apodo, encargado: enc, error: null, omitir: false, payload: null };
        if (!["encargado", "promotor"].includes(tipo)) return { ...base, error: "Tipo inválido (encargado o promotor)" };
        if (!f["nombre"]) return { ...base, error: "Falta el nombre" };
        if (!["activo", "salio"].includes(estado)) return { ...base, error: "Estado inválido (activo o salio)" };
        if (apodo && (vistos.get(apodo.toLowerCase()) ?? 0) > 1) return { ...base, error: "Apodo repetido en el archivo" };
        if (apodo && apodosBase.has(apodo.toLowerCase())) return { ...base, omitir: true };
        if (enc) {
          if (tipo !== "promotor") return { ...base, error: "Solo un promotor puede tener encargado" };
          const k = enc.toLowerCase();
          if (apodosBase.get(k) !== "encargado" && !encargadosArchivo.has(k)) return { ...base, error: `No existe el encargado "${enc}"` };
        }
        return { ...base, payload: { ...f, tipo, estado } };
      }),
    );
  }

  const validas = filas.filter((f) => f.payload);

  async function importar() {
    setProcesando(true);
    const { data, error } = await supabase.rpc("importar_vendedores", { p_filas: validas.map((f) => f.payload) });
    setProcesando(false);
    if (error) { toast.error("No se pudo importar", { description: error.message }); return; }
    const r = data as { creados?: number; omitidos?: number } | null;
    toast.success(`Importación lista: ${r?.creados ?? 0} creados, ${(r?.omitidos ?? 0) + filas.filter((f) => f.omitir).length} omitidos`);
    qc.invalidateQueries({ queryKey: ["vendedores"] });
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar vendedores desde Excel</DialogTitle>
          <DialogDescription>
            Columnas: {COLUMNAS.join(", ")}. Los apodos que ya existen se omiten sin sobrescribir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={descargarPlantilla}>
            <Download className="mr-1 h-4 w-4" /> Descargar plantilla
          </Button>
          <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const a = e.target.files?.[0]; if (a) leer(a); }} />
          {filas.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {validas.length} se importarán · {filas.filter((f) => f.omitir).length} ya existen · {filas.filter((f) => f.error).length} con error
              </p>
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fila</TableHead><TableHead>Tipo</TableHead><TableHead>Nombre</TableHead>
                      <TableHead>Apodo</TableHead><TableHead>Encargado</TableHead><TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f) => (
                      <TableRow key={f.indice}>
                        <TableCell>{f.indice}</TableCell>
                        <TableCell>{f.tipo || "—"}</TableCell>
                        <TableCell>{f.nombre || "—"}</TableCell>
                        <TableCell>{f.apodo || "—"}</TableCell>
                        <TableCell>{f.encargado || "—"}</TableCell>
                        <TableCell>
                          {f.error ? <Badge variant="destructive">{f.error}</Badge> : f.omitir ? <Badge variant="outline">Ya existe, se omite</Badge> : <Badge variant="secondary">Lista</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={importar} disabled={procesando || validas.length === 0}>
            Importar {validas.length > 0 ? `${validas.length} fila(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
