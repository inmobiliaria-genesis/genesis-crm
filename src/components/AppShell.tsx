import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid,
  Map,
  ShoppingCart,
  Wallet,
  Percent,
  Users2,
  Receipt,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
  LogOut,
  Lock,
  Palette,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePerfil, NOMBRE_ROL, type Rol } from "@/lib/sesion";
import { cn } from "@/lib/utils";

type Item = {
  etiqueta: string;
  icono: typeof Map;
  ruta?: string;
  roles?: Rol[];
  sub?: boolean;
};

const ITEMS: Item[] = [
  { etiqueta: "Estructura", icono: LayoutGrid, ruta: "/estructura" },
  { etiqueta: "Lotes", icono: Map, ruta: "/lotes" },
  { etiqueta: "Plano", icono: Map, ruta: "/plano", sub: true },
  { etiqueta: "Clientes", icono: Users2, ruta: "/clientes" },
  { etiqueta: "Vendedores", icono: UserCog, ruta: "/vendedores" },
  { etiqueta: "Apartados", icono: Receipt, ruta: "/apartados" },
  { etiqueta: "Ventas", icono: ShoppingCart, ruta: "/ventas" },
  { etiqueta: "Cobranza", icono: Wallet, ruta: "/cobranza" },
  { etiqueta: "Desistimientos", icono: Undo2, ruta: "/desistimientos", sub: true },
  { etiqueta: "Comisiones", icono: Percent, ruta: "/comisiones", roles: ["admin", "gerente_ventas", "socio", "asesor"] },
  { etiqueta: "Personal y planilla", icono: Users2 },
  { etiqueta: "Gastos", icono: Receipt },
  { etiqueta: "Reportes", icono: BarChart3 },
  { etiqueta: "Configuración", icono: Settings, ruta: "/configuracion", roles: ["admin", "socio"] },
  {
    etiqueta: "Colores del mapa",
    icono: Palette,
    ruta: "/colores-mapa",
    roles: ["admin", "socio"],
    sub: true,
  },
  { etiqueta: "Usuarios", icono: UserCog, ruta: "/usuarios", roles: ["admin", "socio"] },
  { etiqueta: "Bitácora", icono: ScrollText, ruta: "/bitacora", roles: ["admin", "socio"] },
];

export function AppShell({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  const { data: perfil, isLoading } = usePerfil();
  const navigate = useNavigate();
  const queryClient = useQueryClient();


  async function salir() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!isLoading && !perfil) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-semibold">Tu acceso está pendiente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta existe pero aún no tiene un perfil asignado. Pide a un administrador que te
            registre en la pantalla de Usuarios.
          </p>
          <button
            onClick={salir}
            className="mt-6 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/30"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (

    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-sidebar-primary">INMOBILIARIA GÉNESIS</p>
          <p className="mt-1 text-lg font-semibold text-sidebar-accent-foreground">Gestión de lotes</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ITEMS.map((item) => {
            const visible = !item.roles || (perfil && item.roles.includes(perfil.rol));
            if (!visible) return null;
            const Icono = item.icono;
            if (!item.ruta) {
              return (
                <div
                  key={item.etiqueta}
                  title="Módulo aún no disponible"
                  className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40"
                >
                  <Icono className="h-4 w-4" />
                  <span className="flex-1">{item.etiqueta}</span>
                  <Lock className="h-3 w-3" />
                </div>
              );
            }
            return (
              <Link
                key={item.etiqueta}
                to={item.ruta}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  item.sub && "ml-4 border-l border-sidebar-border pl-4 text-xs",
                )}
                activeProps={{
                  className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                }}
              >
                <Icono className="h-4 w-4" />
                {item.etiqueta}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="text-sm font-medium text-sidebar-accent-foreground">{perfil?.nombre}</p>
          <p className="text-xs text-sidebar-foreground/60">
            {perfil ? NOMBRE_ROL[perfil.rol] : ""}
          </p>
          <button
            onClick={salir}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
            {descripcion ? (
              <p className="text-sm text-muted-foreground">{descripcion}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">{acciones}</div>
        </header>
        <main className={cn("flex-1 overflow-x-auto p-6")}>{children}</main>
      </div>
    </div>
  );
}
