import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — Gestión de lotes" },
      { name: "description", content: "Acceso al sistema de gestión de proyectos y lotes." },
      { property: "og:title", content: "Ingresar — Gestión de lotes" },
      { property: "og:description", content: "Acceso al sistema de gestión de proyectos y lotes." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/lotes", replace: true });
    });
  }, [navigate]);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) {
      toast.error("No se pudo ingresar", { description: error.message });
      return;
    }
    navigate({ to: "/lotes", replace: true });
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setCargando(false);
      toast.error("No se pudo crear la cuenta", { description: error.message });
      return;
    }
    if (!data.session) {
      setCargando(false);
      toast.success("Revisa tu correo para confirmar la cuenta.");
      return;
    }
    // El primer usuario del sistema queda como administrador.
    const { error: errorPerfil } = await supabase.from("perfil").insert({
      user_id: data.user!.id,
      nombre: nombre || email,
      rol: "admin",
    });
    setCargando(false);
    if (errorPerfil) {
      toast.info("Cuenta creada", {
        description: "Ya existe un administrador. Pídele que active tu acceso.",
      });
      return;
    }
    toast.success("Cuenta de administrador creada");
    navigate({ to: "/lotes", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Gestión de lotes</CardTitle>
          <CardDescription>Ingresa con tu correo y contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="ingresar">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ingresar">Ingresar</TabsTrigger>
              <TabsTrigger value="registrar">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="ingresar">
              <form className="space-y-4 pt-4" onSubmit={ingresar}>
                <div className="space-y-2">
                  <Label htmlFor="correo">Correo</Label>
                  <Input
                    id="correo"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clave">Contraseña</Label>
                  <Input
                    id="clave"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={cargando}>
                  Ingresar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="registrar">
              <form className="space-y-4 pt-4" onSubmit={registrar}>
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre completo</Label>
                  <Input
                    id="nombre"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="correo-r">Correo</Label>
                  <Input
                    id="correo-r"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clave-r">Contraseña</Label>
                  <Input
                    id="clave-r"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  El primer usuario registrado queda como administrador del sistema.
                </p>
                <Button type="submit" className="w-full" disabled={cargando}>
                  Crear cuenta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
