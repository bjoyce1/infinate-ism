import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setNodeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        node_id: z.string().min(1).max(512),
        image_url: z.string().url().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");

    const { error } = await supabaseAdmin
      .from("node_image_overrides")
      .upsert({
        node_id: data.node_id,
        image_url: data.image_url,
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true, node_id: data.node_id, image_url: data.image_url };
  });