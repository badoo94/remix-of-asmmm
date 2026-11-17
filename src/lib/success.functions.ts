import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Grants premium to the signed-in user who reached the hidden /succes page. */
export const grantSuccessPremium = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ is_premium: true }).eq("id", context.userId);
    if (error) throw new Error("Activation impossible");
    return { ok: true };
  });
