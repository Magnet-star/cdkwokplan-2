import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getDiocesanSecretaryName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "diocesan_secretary")
      .limit(2);
    if (roleError) throw new Error(roleError.message);
    if (roleRows.length !== 1) {
      throw new Error("Assign the Diocesan Secretary role to exactly one user before downloading this PDF.");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", roleRows[0].user_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.full_name?.trim()) {
      throw new Error("The Diocesan Secretary user must have a full name in their profile.");
    }

    return profile.full_name.trim();
  });
