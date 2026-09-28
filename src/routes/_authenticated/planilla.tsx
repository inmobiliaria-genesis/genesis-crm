import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Paperclip, Plus } from "lucide-react";
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
import { usePerfil, puedeGastos } from "@/lib/sesion";
import { soles, fecha, hoyLima } from "@/lib/format";
import { METODOS_PAGO, ETIQUETA_METODO, etiquetaMetodo, llevaOperacion } from "@/lib/cobranza";
import { inicioMes, mesActualLima, subirComprobante, abrirComprobante, CLASE_SELECT } from "@/lib/gastos";
import type { Database } from "@/integrations/supabase/types";

type Personal = Database["public"]["Tables"]["personal"]["Row"];
type Linea = Database["public"]["Tables"]["planilla_linea"]["Row"];

export const Route = createFileRoute("/_authenticated/planilla")({
  head: () => ({
    meta: [
      { title: "Planilla — Gestión de lotes" },
      { name: "description", content: "Personal, planilla mensual y pagos del personal." },
      { property: "og:title", content: "Planilla — Gestión de lotes" },
      { property: "og:description", content: "Personal, planilla mensual y pagos del personal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanillaPage,
});

function PlanillaPage() {
  const { data: perfil, isLoading } = usePerfil();
  const permitido = puedeGastos(perfil);
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesActualLima());
  const [persona, setPersona] = useState<Personal | "nuevo" | null>(null);
  const [pagar, setPagar] = useState<Linea | null>(null);

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
      const { data, error } = await supabase.from("planilla_linea").select("*").eq("anulado", false).eq("mes", inicioMes(mes));
      if (error) throw error;
      return data;
    },
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["planilla"] });
  const nombre = (id: string) => personal.data?.find((p) => p.id === id)?.nombre ?? "—";
  const total = (lineas.data ?? []).reduce((a, l) => a + Number(l.monto), 0);
  const pagado = (lineas.data ?? []).filter((l) => l.pagado).reduce((a, l) => a + Number(l.monto), 0);

  async function generar() {
    const { data, error } = await supabase.rpc("generar_planilla", { _mes: inicioMes(mes) });
    if (error) return toast.error(error.message);
    toast.success(`Planilla generada: ${data} líneas`);
    refrescar();
  }

  async function cambiarMonto(l: Linea, valor: string) {
    const n = Number(valor);
    if (!(n >= 0) || n === Number(l.monto)) return;
    const { error } = await supabase.from("planilla_linea").update({ monto: n }).eq("id", l.id);
    if (error) return toast.error(error.message);
    refrescar();
  }

  async function desmarcar(l: Linea) {
    const { error } = await supabase.from("planilla_linea").update({ pagado: false }).eq("id", l.id);
    if (error) return toast.error(error.message);
    refrescar();
  }

  if (!isLoading && !permitido) {
    return (
      <AppShell titulo="Planilla">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </AppShell>
    );
  }

  const ordenadas = [...(lineas.data ?? [])].sort((a, b) => nombre(a.personal_id).localeCompare(nombre(b.personal_id)));

  return (
    <AppShell
      titulo="Planilla"
      descripcion="Personal y pagos mensuales; lo pagado se suma a Gastos"
      acciones={<Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Planilla del mes</CardTitle>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>Total: <b>{soles(total)}</b></span>
              <span>Pagado: <b>{soles(pagado)}</b></span>
              <span>Pendiente: <b>{soles(total - pagado)}</b></span>
              {lineas.data && lineas.data.length === 0 ? <Button onClick={generar}>Generar planilla del mes</Button> : null}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="w-40">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">La planilla de este mes aún no se generó.</TableCell></TableRow>
                ) : null}
                {ordenadas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{nombre(l.personal_id)}</TableCell>
                    <TableCell>
                      {l.pagado ? soles(l.monto) : (
                        <Input type="number" step="0.01" defaultValue={String(l.monto)} onBlur={(e) => cambiarMonto(l, e.target.value)} />
                      )}
                    </TableCell>
                    <TableCell>{l.pagado ? <Badge>Pagado</Badge> : <Badge variant="outline">Pendiente</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.pagado ? `${fecha(l.fecha_pago)} · ${etiquetaMetodo(l.metodo)}${l.numero_operacion ? ` · ${l.numero_operacion}` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {l.comprobante_path ? (
                        <Button size="sm" variant="ghost" onClick={() => abrirComprobante(l.comprobante_path!).catch((e) => toast.error(e.message))}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {l.pagado ? (
                        <Button size="sm" variant="ghost" onClick={() => desmarcar(l)}>Desmarcar</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setPagar(l)}>Marcar pagado</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Personal</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setPersona("nuevo")}><Plus className="h-4 w-4" /> Agregar</Button>
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(personal.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell>{p.dni ?? "—"}</TableCell>
                    <TableCell>{p.cargo ?? "—"}</TableCell>
                    <TableCell className="text-right">{soles(p.monto_mensual)}</TableCell>
                    <TableCell>{p.activo ? "Activo" : "Inactivo"}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setPersona(p)}>Editar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {persona ? <DialogoPersona persona={persona === "nuevo" ? null : persona} onCerrar={() => setPersona(null)} /> : null}
      {pagar ? <DialogoPago linea={pagar} nombre={nombre(pagar.personal_id)} onCerrar={() => { setPagar(null); refrescar(); }} /> : null}
    </AppShell>
  );
}

function DialogoPersona({ persona, onCerrar }: { persona: Personal | null; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: persona?.nombre ?? "",
    dni: persona?.dni ?? "",
    cargo: persona?.cargo ?? "",
    monto: persona ? String(persona.monto_mensual) : "",
    activo: persona?.activo ?? true,
  });
  async function guardar() {
    if (!f.nombre.trim()) return toast.error("Indica el nombre");
    if (!(Number(f.monto) >= 0) || f.monto === "") return toast.error("Indica el monto mensual");
    const fila = { nombre: f.nombre.trim(), dni: f.dni || null, cargo: f.cargo || null, monto_mensual: Number(f.monto), activo: f.activo };
    const { error } = persona
      ? await supabase.from("personal").update(fila).eq("id", persona.id)
      : await supabase.from("personal").insert(fila);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["personal"] });
    onCerrar();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{persona ? "Editar persona" : "Agregar persona"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Nombre completo</Label><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>DNI (opcional)</Label><Input value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></div>
            <div><Label>Cargo (opcional)</Label><Input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} /></div>
          </div>
          <div><Label>Monto mensual neto (S/)</Label><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoPago({ linea, nombre, onCerrar }: { linea: Linea; nombre: string; onCerrar: () => void }) {
  const [f, setF] = useState({ fecha: hoyLima(), metodo: "transferencia", op: "", notas: linea.notas ?? "" });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      const comprobante_path = archivo ? await subirComprobante(archivo) : linea.comprobante_path;
      const { error } = await supabase
        .from("planilla_linea")
        .update({
          pagado: true,
          fecha_pago: f.fecha,
          metodo: f.metodo,
          numero_operacion: llevaOperacion(f.metodo) ? f.op || null : null,
          comprobante_path,
          notas: f.notas || null,
        })
        .eq("id", linea.id);
      if (error) throw error;
      toast.success("Pago registrado");
      onCerrar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pagar a {nombre} · {soles(linea.monto)}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Fecha</Label><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
          <div>
            <Label>Método</Label>
            <select className={CLASE_SELECT} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
              {METODOS_PAGO.map((m) => <option key={m} value={m}>{ETIQUETA_METODO[m]}</option>)}
            </select>
          </div>
          {llevaOperacion(f.metodo) ? <div><Label>Código de operación (opcional)</Label><Input value={f.op} onChange={(e) => setF({ ...f, op: e.target.value })} /></div> : null}
          <div>
            <Label>Comprobante (opcional, foto o PDF hasta 10 MB)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </div>
          <div><Label>Notas</Label><Textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
