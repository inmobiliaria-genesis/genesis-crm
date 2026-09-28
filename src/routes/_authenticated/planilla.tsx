import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CamposMetodo, MostrarMetodo } from "@/components/MetodoPago";
import { DialogoEliminar } from "@/components/DialogoEliminar";
import { fecha, soles, hoyLima } from "@/lib/format";
import { usePerfil, puedeGastos, esAdmin } from "@/lib/sesion";
import { mesActual, inicioMes, nombreMes, subirComprobante, abrirComprobante } from "@/lib/gastos";
import type { Database } from "@/integrations/supabase/types";

type Persona = Database["public"]["Tables"]["personal"]["Row"];
type Linea = Database["public"]["Tables"]["planilla_linea"]["Row"];

export const Route = createFileRoute("/_authenticated/planilla")({
  head: () => ({
    meta: [
      { title: "Personal y planilla — Gestión de lotes" },
      { name: "description", content: "Personal, planilla mensual y pagos de sueldos." },
      { property: "og:title", content: "Personal y planilla — Gestión de lotes" },
      { property: "og:description", content: "Personal, planilla mensual y pagos de sueldos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanillaPage,
});

function PlanillaPage() {
  const { data: perfil, isLoading } = usePerfil();
  const qc = useQueryClient();
  const permitido = puedeGastos(perfil);
  const [mes, setMes] = useState(mesActual());
  const [persona, setPersona] = useState<Persona | null | "nueva">(null);
  const [pagar, setPagar] = useState<Linea | null>(null);
  const [eliminarLinea, setEliminarLinea] = useState<Linea | null>(null);
  const [eliminarPersona, setEliminarPersona] = useState<Persona | null>(null);
  const [generando, setGenerando] = useState(false);

  const personal = useQuery({
    queryKey: ["personal"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.from("personal").select("*").eq("anulado", false).order("nombre");
      if (error) throw error;
      return data;
    },
  });
  const lineas = useQuery({
    queryKey: ["planilla", mes],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planilla_linea")
        .select("*")
        .eq("anulado", false)
        .eq("mes", inicioMes(mes));
      if (error) throw error;
      return data;
    },
  });

  const nombre = new Map((personal.data ?? []).map((p) => [p.id, p.nombre]));
  const filas = [...(lineas.data ?? [])].sort((a, b) => (nombre.get(a.personal_id) ?? "").localeCompare(nombre.get(b.personal_id) ?? ""));
  const total = filas.reduce((t, l) => t + Number(l.monto), 0);
  const pagado = filas.filter((l) => l.pagado).reduce((t, l) => t + Number(l.monto), 0);

  function refrescar() {
    qc.invalidateQueries({ queryKey: ["planilla"] });
    qc.invalidateQueries({ queryKey: ["personal"] });
    qc.invalidateQueries({ queryKey: ["gastos-resumen"] });
  }

  async function generar() {
    setGenerando(true);
    const { data, error } = await supabase.rpc("generar_planilla", { _mes: inicioMes(mes) });
    setGenerando(false);
    if (error) { toast.error("No se pudo generar", { description: error.message }); return; }
    toast.success(`Planilla generada con ${data} personas`);
    refrescar();
  }

  async function editarMonto(l: Linea, valor: string) {
    const n = Number(valor);
    if (!(n >= 0) || n === Number(l.monto)) return;
    const { error } = await supabase.from("planilla_linea").update({ monto: n }).eq("id", l.id);
    if (error) toast.error("No se pudo guardar", { description: error.message });
    refrescar();
  }

  async function desmarcar(l: Linea) {
    const { error } = await supabase.from("planilla_linea").update({ pagado: false }).eq("id", l.id);
    if (error) toast.error("No se pudo guardar", { description: error.message });
    refrescar();
  }

  if (!isLoading && !permitido) {
    return (
      <AppShell titulo="Personal y planilla">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Personal y planilla"
      descripcion="Lo pagado se suma a la categoría Planilla en Gastos"
      acciones={<Input type="month" className="w-44" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center gap-4 space-y-0">
            <CardTitle className="mr-auto text-base">Planilla de {nombreMes(mes)}</CardTitle>
            <Resumen etiqueta="Total" valor={total} />
            <Resumen etiqueta="Pagado" valor={pagado} />
            <Resumen etiqueta="Pendiente" valor={total - pagado} />
            {filas.length === 0 && !lineas.isLoading ? (
              <Button size="sm" onClick={generar} disabled={generando}>Generar planilla del mes</Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="w-40 text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {lineas.isLoading ? "Cargando…" : "Aún no se genera la planilla de este mes."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filas.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{nombre.get(l.personal_id)}</TableCell>
                      <TableCell className="text-right">
                        {l.pagado ? (
                          <span className="num">{soles(l.monto)}</span>
                        ) : (
                          <Input key={`${l.id}-${l.monto}`} type="number" step="0.01" min="0" className="num text-right"
                            defaultValue={String(l.monto)} onBlur={(e) => editarMonto(l, e.target.value)} />
                        )}
                      </TableCell>
                      <TableCell>
                        {l.pagado ? <Badge variant="secondary">Pagado</Badge> : <Badge variant="outline">Pendiente</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.pagado ? (
                          <>
                            {fecha(l.fecha_pago)} · <MostrarMetodo metodo={l.metodo} operacion={l.numero_operacion} />
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap text-right">
                        {l.comprobante_path ? (
                          <Button size="sm" variant="ghost" title="Ver comprobante"
                            onClick={() => abrirComprobante(l.comprobante_path!).catch((e) => toast.error(e.message))}>
                            <Paperclip className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {l.pagado ? (
                          <Button size="sm" variant="ghost" onClick={() => desmarcar(l)}>Desmarcar</Button>
                        ) : (
                          <Button size="sm" onClick={() => setPagar(l)}>Marcar pagado</Button>
                        )}
                        {esAdmin(perfil) ? (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setEliminarLinea(l)}>Eliminar</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Personal</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setPersona("nueva")}><Plus className="h-4 w-4" /> Agregar persona</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Monto mensual neto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(personal.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell>{p.dni ?? "—"}</TableCell>
                    <TableCell>{p.cargo ?? "—"}</TableCell>
                    <TableCell className="num text-right">{soles(p.monto_mensual)}</TableCell>
                    <TableCell>{p.activo ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setPersona(p)}>Editar</Button>
                      {esAdmin(perfil) ? (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setEliminarPersona(p)}>Eliminar</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {persona ? <DialogoPersona persona={persona === "nueva" ? null : persona} onCerrar={(ok) => { setPersona(null); if (ok) refrescar(); }} /> : null}
      {pagar ? <DialogoPagar linea={pagar} nombre={nombre.get(pagar.personal_id) ?? ""} onCerrar={(ok) => { setPagar(null); if (ok) refrescar(); }} /> : null}
      <DialogoEliminar
        titulo="Eliminar línea de planilla"
        abierto={!!eliminarLinea}
        onCambio={(o) => { if (!o) setEliminarLinea(null); }}
        onConfirmar={async (motivo) => {
          const { error } = await supabase.from("planilla_linea").update({ anulado: true, motivo_anulacion: motivo }).eq("id", eliminarLinea!.id);
          if (error) return error.message;
          refrescar();
          return null;
        }}
      />
      <DialogoEliminar
        titulo="Eliminar persona"
        abierto={!!eliminarPersona}
        onCambio={(o) => { if (!o) setEliminarPersona(null); }}
        onConfirmar={async (motivo) => {
          const { error } = await supabase.from("personal").update({ anulado: true, motivo_anulacion: motivo }).eq("id", eliminarPersona!.id);
          if (error) return error.message;
          refrescar();
          return null;
        }}
      />
    </AppShell>
  );
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="num font-semibold">{soles(valor)}</p>
    </div>
  );
}

function DialogoPersona({ persona, onCerrar }: { persona: Persona | null; onCerrar: (ok: boolean) => void }) {
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [dni, setDni] = useState(persona?.dni ?? "");
  const [cargo, setCargo] = useState(persona?.cargo ?? "");
  const [monto, setMonto] = useState(persona ? String(persona.monto_mensual) : "");
  const [activo, setActivo] = useState(persona?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{persona ? "Editar persona" : "Agregar persona"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1"><Label>Nombre completo</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>DNI (opcional)</Label><Input value={dni} maxLength={15} onChange={(e) => setDni(e.target.value)} /></div>
            <div className="space-y-1"><Label>Cargo (opcional)</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Monto mensual neto (S/)</Label><Input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCerrar(false)}>Cancelar</Button>
          <Button
            disabled={!nombre.trim() || !(Number(monto) >= 0) || monto === "" || guardando}
            onClick={async () => {
              setGuardando(true);
              const fila = { nombre: nombre.trim(), dni: dni.trim() || null, cargo: cargo.trim() || null, monto_mensual: Number(monto), activo };
              const { error } = persona
                ? await supabase.from("personal").update(fila).eq("id", persona.id)
                : await supabase.from("personal").insert(fila);
              setGuardando(false);
              if (error) { toast.error("No se pudo guardar", { description: error.message }); return; }
              toast.success("Guardado");
              onCerrar(true);
            }}
          >Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoPagar({ linea, nombre, onCerrar }: { linea: Linea; nombre: string; onCerrar: (ok: boolean) => void }) {
  const [fechaP, setFechaP] = useState(hoyLima());
  const [metodo, setMetodo] = useState("");
  const [op, setOp] = useState("");
  const [notas, setNotas] = useState(linea.notas ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar como pagado</DialogTitle></DialogHeader>
        <p className="text-sm">{nombre}: <span className="num font-semibold">{soles(linea.monto)}</span></p>
        <div className="grid gap-3">
          <div className="space-y-1"><Label>Fecha de pago</Label><Input type="date" value={fechaP} onChange={(e) => setFechaP(e.target.value)} /></div>
          <CamposMetodo metodo={metodo} operacion={op} onMetodo={setMetodo} onOperacion={setOp} />
          <div className="space-y-1">
            <Label>Comprobante (opcional, foto o PDF, máx. 10 MB)</Label>
            <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1"><Label>Notas</Label><Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCerrar(false)}>Cancelar</Button>
          <Button
            disabled={!fechaP || !metodo || guardando}
            onClick={async () => {
              setGuardando(true);
              try {
                const comprobante_path = archivo ? await subirComprobante(archivo, "planilla") : linea.comprobante_path;
                const { error } = await supabase.from("planilla_linea").update({
                  pagado: true, fecha_pago: fechaP, metodo,
                  numero_operacion: metodo === "efectivo" ? null : op.trim() || null,
                  comprobante_path, notas: notas.trim() || null,
                }).eq("id", linea.id);
                if (error) throw error;
                toast.success("Pago registrado");
                onCerrar(true);
              } catch (e) {
                toast.error("No se pudo guardar", { description: (e as Error).message });
              } finally {
                setGuardando(false);
              }
            }}
          >Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
