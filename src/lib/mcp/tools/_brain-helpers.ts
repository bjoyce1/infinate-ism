import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function supabaseForUser(ctx: ToolContext): SupabaseClient | null {
  const token = ctx.getToken?.();
  if (!token) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireAuth(ctx: ToolContext) {
  const uid = ctx.getUserId?.();
  const sb = supabaseForUser(ctx);
  if (!uid || !sb) return null;
  return { userId: uid, sb };
}

export function unauth() {
  return { content: [{ type: "text" as const, text: "Not authenticated. Sign in to your C.A.P.I.S.M. account through the MCP OAuth flow." }], isError: true };
}