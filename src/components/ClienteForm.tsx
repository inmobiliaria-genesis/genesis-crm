import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampoOrigenLead, ORIGEN_VACIO, nombreClientePorId, type OrigenLead } from "@/lib/leads";
import { useEffect } from "react";
import { TIPOS_DOCUMENTO, ESTADOS_CIVILES, REGIMENES, type Cliente } from "@/lib/ventas";

type Borrador = {
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  telefono1: string;
  telefono2: string;
  email: string;
  distrito: string;
  provincia: string;
  departamento: string;
  estado_civil: string;
  regimen_patrimonial: string;
  ocupacion: string;
  lugar_nacimiento: string;
  fecha_nacimiento: string;
  notas: string;
};

function vacio(): Borrador {
  return {
    tipo_documento: "DNI",
    numero_documento: "",
    nombres: "",
    apellidos: "",
    telefono1: "+51",
    telefono2: "",
    email: "",
    distrito: "",
    provincia: "",
    departamento: "",
    estado_civil: "",
    regimen_patrimonial: "",
    ocupacion: "",
    lugar_nacimiento: "",
    fecha_nacimiento: "",
    notas: "",
  };
}

function desde(c: Cliente): Borrador {
  return {
    tipo_documento: c.tipo_documento,
    numero_documento: c.numero_documento,
    nombres: c.nombres,
    apellidos: c.apellidos,
    telefono1: c.telefono1 ?? "+51",
    telefono2: c.telefono2 ?? "",
    email: c.email ?? "",
    distrito: c.distrito ?? "",
    provincia: c.provincia ?? "",
    departamento: c.departamento ?? "",
    estado_civil: c.estado_civil ?? "",
    regimen_patrimonial: c.regimen_patrimonial ?? "",
    ocupacion: c.ocupacion ?? "",
    lugar_nacimiento: c.lugar_nacimiento ?? "",
    fecha_nacimiento: c.fecha_nacimiento ?? "",
    notas: c.notas ?? "",
  };
}

export function DialogoCliente({
  abierto,
  onCerrar,
  cliente,
  onGuardado,
  inicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  cliente?: Cliente | null;
  onGuardado?: (c: Cliente) => void;
  inicial?: { nombres?: string; telefono1?: string; origen?: OrigenLead };
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<Borrador>(
    cliente ? desde(cliente) : { ...vacio(), nombres: inicial?.nombres ?? "", telefono1: inicial?.telefono1 || "+51" },
  );
  const [origen, setOrigen] = useState<OrigenLead>(
    cliente
      ? { origen: cliente.origen_lead ?? "", referidoId: cliente.referido_por_id, referidoNombre: null }
      : (inicial?.origen ?? ORIGEN_VACIO),
  );
  useEffect(() => {
    if (origen.referidoId && !origen.referidoNombre) {
      nombreClientePorId(origen.referidoId).then((n) => setOrigen((o) => ({ ...o, referidoNombre: n })));
    }
  }, [origen.referidoId, origen.referidoNombre]);
  const [guardando, setGuardando] = useState(false);

  function set<K extends keyof Borrador>(k: K, v: Borrador[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function guardar() {
    if (!f.numero_documento.trim() || !f.nombres.trim() || !f.apellidos.trim()) {
      toast.error("Documento, nombres y apellidos son obligatorios");
      return;
    }
    setGuardando(true);
    const payload = {
      tipo_documento: f.tipo_documento,
      numero_documento: f.numero_documento.trim(),
      nombres: f.nombres.trim(),
      apellidos: f.apellidos.trim(),
      telefono1: f.telefono1.trim() || "+51",
      telefono2: f.telefono2.trim() || null,
      email: f.email.trim() || null,
      distrito: f.distrito.trim() || null,
      provincia: f.provincia.trim() || null,
      departamento: f.departamento.trim() || null,
      estado_civil: f.estado_civil || null,
      regimen_patrimonial: f.regimen_patrimonial || null,
      ocupacion: f.ocupacion.trim() || null,
      lugar_nacimiento: f.lugar_nacimiento.trim() || null,
      fecha_nacimiento: f.fecha_nacimiento || null,
      notas: f.notas.trim() || null,
      origen_lead: origen.origen || null,
      referido_por_id: origen.origen === "referido" ? origen.referidoId : null,
    };
    const docCambia =
      !cliente ||
      cliente.tipo_documento !== payload.tipo_documento ||
      cliente.numero_documento !== payload.numero_documento;
    if (docCambia) {
      const { data: dup } = await supabase.rpc("buscar_cliente_documento" as never, {
        _tipo: payload.tipo_documento,
        _numero: payload.numero_documento,
      } as never);
      if (Array.isArray(dup) && (dup as unknown[]).length > 0) {
        setGuardando(false);
        toast.error(`Ya existe un cliente con este ${payload.tipo_documento}`);
        return;
      }
    }
    const res = cliente
      ? await supabase.from("cliente").update(payload).eq("id", cliente.id).select("*").single()
      : await supabase.from("cliente").insert(payload).select("*").single();
    setGuardando(false);
    if (res.error) {
      const dup = res.error.code === "23505";
      toast.error(dup ? `Ya existe un cliente con este ${payload.tipo_documento}` : "No se pudo guardar", {
        description: dup ? undefined : res.error.message,
      });
      return;
    }
    toast.success(cliente ? "Cliente actualizado" : "Cliente registrado");
    qc.invalidateQueries({ queryKey: ["clientes"] });
    onGuardado?.(res.data);
    onCerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? onCerrar() : null)}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo de documento</Label>
            <Select value={f.tipo_documento} onValueChange={(v) => set("tipo_documento", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Campo label="Número de documento" v={f.numero_documento} s={(v) => set("numero_documento", v)} />
          <Campo label="Nombres" v={f.nombres} s={(v) => set("nombres", v)} />
          <Campo label="Apellidos" v={f.apellidos} s={(v) => set("apellidos", v)} />
          <Campo label="Teléfono 1" v={f.telefono1} s={(v) => set("telefono1", v)} />
          <Campo label="Teléfono 2" v={f.telefono2} s={(v) => set("telefono2", v)} />
          <Campo label="Correo" v={f.email} s={(v) => set("email", v)} />
          <Campo label="Ocupación" v={f.ocupacion} s={(v) => set("ocupacion", v)} />
          <Campo label="Distrito" v={f.distrito} s={(v) => set("distrito", v)} />
          <Campo label="Provincia" v={f.provincia} s={(v) => set("provincia", v)} />
          <Campo label="Departamento" v={f.departamento} s={(v) => set("departamento", v)} />
          <div>
            <Label>Estado civil</Label>
            <Select value={f.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin indicar" />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_CIVILES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Régimen patrimonial</Label>
            <Select value={f.regimen_patrimonial} onValueChange={(v) => set("regimen_patrimonial", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin indicar" />
              </SelectTrigger>
              <SelectContent>
                {REGIMENES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Campo label="Lugar de nacimiento" v={f.lugar_nacimiento} s={(v) => set("lugar_nacimiento", v)} />
          <div>
            <Label>Fecha de nacimiento</Label>
            <Input
              type="date"
              value={f.fecha_nacimiento}
              onChange={(e) => set("fecha_nacimiento", e.target.value)}
            />
          </div>
          <CampoOrigenLead valor={origen} onCambio={setOrigen} />
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea value={f.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, v, s }: { label: string; v: string; s: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => s(e.target.value)} />
    </div>
  );
}
