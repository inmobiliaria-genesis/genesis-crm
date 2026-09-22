import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const esquema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nombre: z.string().min(1),
  rol: z.enum(["admin", "gerente_ventas", "cobranza", "asesor", "socio"]),
});

export const crearUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => esquema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: yo, error: errorPerfil } = await context.supabase
      .from("perfil")
      .select("rol")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (errorPerfil) throw new Error(errorPerfil.message);
    if (yo?.rol !== "admin") throw new Error("Solo un administrador puede crear usuarios");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: creado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !creado.user) throw new Error(error?.message ?? "No se pudo crear el usuario");

    const { error: errorInsert } = await supabaseAdmin.from("perfil").insert({
      user_id: creado.user.id,
      nombre: data.nombre,
      rol: data.rol,
      creado_por: context.userId,
    });
    if (errorInsert) throw new Error(errorInsert.message);

    return { ok: true as const, userId: creado.user.id };
  });
