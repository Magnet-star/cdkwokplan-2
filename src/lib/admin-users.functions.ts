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
  phone: z.string().trim().max(40).optional().nullable(),
  roles: z.array(z.enum(["super_admin", "administrator", "hod", "staff", "driver", "finance_admin", "vicar_general", "procurator"])).min(1).max(8),
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
        phone: data.phone?.trim() ? data.phone.trim() : null,
      })
      .eq("id", newUserId);


    // Replace default 'staff' role with requested roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const roleRowsToInsert = data.roles.map((role) => ({ user_id: newUserId, role }));
    const { error: rolesErr } = await supabaseAdmin.from("user_roles").insert(roleRowsToInsert);
    if (rolesErr) throw new Error(rolesErr.message);

    return { ok: true, userId: newUserId };
  });

const DeleteUserSchema = z.object({ userId: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRows, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    const isSuper = (roleRows ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper) throw new Error("Only super admins can delete users");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    if (data.userId === "788b3a81-1631-4b53-a08d-35ce5d605f4e") {
      throw new Error("This account is protected and cannot be deleted");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateUserSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(255).optional(),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRows, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    const isSuper = (roleRows ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuper) throw new Error("Only super admins can edit users");
    if (data.userId === "788b3a81-1631-4b53-a08d-35ce5d605f4e" && data.userId !== context.userId) {
      throw new Error("This account is protected and cannot be modified");
    }

    const authUpdate: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password && data.password.length >= 8) authUpdate.password = data.password;
    if (data.fullName) authUpdate.user_metadata = { full_name: data.fullName };

    if (Object.keys(authUpdate).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authUpdate);
      if (error) throw new Error(error.message);
    }

    const profileUpdate: { full_name?: string; email?: string } = {};
    if (data.fullName) profileUpdate.full_name = data.fullName;
    if (data.email) profileUpdate.email = data.email;
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
