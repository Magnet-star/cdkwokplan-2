import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Schema = z.object({ phone: z.string().trim().min(3).max(40) });

export const lookupEmailByPhone = createServerFn({ method: "POST" })
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: email, error } = await supabaseAdmin.rpc("lookup_email_by_phone", {
      _phone: data.phone,
    });
    if (error) throw new Error(error.message);
    return { email: (email as string | null) ?? null };
  });
