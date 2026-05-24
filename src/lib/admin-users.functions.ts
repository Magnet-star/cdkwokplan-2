import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(1).max(120),
  departmentId: z.string().uuid().nullable().optional(),
  position: z.string().trim().max(120).optional().nullable(),
  roles: z.array(z.enum(["super_admin", "administrator", "hod", "staff"])).min(1).max(4),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller is super_admin
    const { data: roleRows, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    const isSuper = (roleRows ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper) throw new Error("Only super admins can create users");

    // Create the auth user (auto-confirmed so temp credentials work immediately)
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed to create user");

    const newUserId = created.user.id;

    // Profile is auto-created by handle_new_user trigger; update extras
    await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        department_id: data.departmentId ?? null,
        position: data.position ?? null,
      })
      .eq("id", newUserId);

    // Replace default 'staff' role with requested roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const roleRowsToInsert = data.roles.map((role) => ({ user_id: newUserId, role }));
    const { error: rolesErr } = await supabaseAdmin.from("user_roles").insert(roleRowsToInsert);
    if (rolesErr) throw new Error(rolesErr.message);

    return { ok: true, userId: newUserId };
  });
