import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { crearUsuario } from "@/lib/usuarios.functions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import { usePerfil, esAdmin, puedeVerAdmin, NOMBRE_ROL, ROLES, type Rol } from "@/lib/sesion";
import { fecha } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios — Gestión de lotes" },
      { name: "description", content: "Alta, roles y estado de los usuarios del sistema." },
      { property: "og:title", content: "Usuarios — Gestión de lotes" },
      { property: "og:description", content: "Alta, roles y estado de los usuarios del sistema." },
    ],
  }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const { data: perfil, isLoading } = usePerfil();
  const qc = useQueryClient();

  const usuarios = useQuery({
    queryKey: ["usuarios"],
    enabled: puedeVerAdmin(perfil),
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("*").order("creado_en");
      if (error) throw error;
      return data;
    },
  });

  async function cambiarRol(id: string, rol: Rol) {
    const { error } = await supabase.from("perfil").update({ rol }).eq("id", id);
    if (error) { toast.error("No se pudo cambiar el rol", { description: error.message }); return; }
    toast.success("Rol actualizado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  async function cambiarEstado(id: string, activo: boolean) {
    const { error } = await supabase.from("perfil").update({ activo }).eq("id", id);
    if (error) { toast.error("No se pudo actualizar", { description: error.message }); return; }
    toast.success(activo ? "Usuario activado" : "Usuario desactivado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  if (!isLoading && !puedeVerAdmin(perfil)) {
    return (
      <AppShell titulo="Usuarios">
        <p className="text-sm text-muted-foreground">Solo un administrador puede ver esta pantalla.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Usuarios"
      descripcion="Acceso y roles del equipo"
      acciones={esAdmin(perfil) && <NuevoUsuario onListo={() => qc.invalidateQueries({ queryKey: ["usuarios"] })} />}
    >
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nombre}</TableCell>
                <TableCell>
                  <Select disabled={!esAdmin(perfil)} value={u.rol} onValueChange={(v) => cambiarRol(u.id, v as Rol)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {NOMBRE_ROL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {u.activo ? (
                    <Badge variant="secondary">Activo</Badge>
                  ) : (
                    <Badge variant="destructive">Desactivado</Badge>
                  )}
                </TableCell>
                <TableCell>{fecha(u.creado_en)}</TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={u.activo}
                    onCheckedChange={(v) => cambiarEstado(u.id, v)}
                    disabled={!esAdmin(perfil) || u.user_id === perfil?.user_id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}

function NuevoUsuario({ onListo }: { onListo: () => void }) {
  const crear = useServerFn(crearUsuario);
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("asesor");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await crear({ data: { email, password, nombre, rol } });
      toast.success("Usuario creado");
      setAbierto(false);
      setEmail("");
      setPassword("");
      setNombre("");
      onListo();
    } catch (e) {
      toast.error("No se pudo crear el usuario", { description: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-1 h-4 w-4" /> Nuevo usuario
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre completo</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Correo</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contraseña temporal</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
          </div>
          <div className="space-y-1">
            <Label>Rol</Label>
            <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {NOMBRE_ROL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando || !email || password.length < 6 || !nombre}>
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
