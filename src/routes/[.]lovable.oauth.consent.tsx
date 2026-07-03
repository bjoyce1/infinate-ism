import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type AuthorizationClient = { name?: string; client_name?: string; redirect_uri?: string };
type AuthorizationDetails = {
  client?: AuthorizationClient | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: supabase reads its session from localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.replace(immediate);
      // Return placeholder; navigation happens.
      return data;
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen bg-obsidian-bg text-white grid place-items-center p-6">
      <div className="max-w-md text-sm">
        <h1 className="text-xl font-light mb-2">Authorization error</h1>
        <p className="text-white/70">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";
  const redirectUri = details?.client?.redirect_uri;
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect URL returned by the authorization server.");
      return;
    }
    window.location.replace(target);
  }

  return (
    <main className="min-h-screen bg-obsidian-bg text-white font-sora grid place-items-center px-4">
      <div className="w-full max-w-md border border-obsidian-border bg-obsidian-surface rounded p-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-2">
          Authorize connection
        </div>
        <h1 className="text-2xl font-light mb-4">
          Connect {clientName} to Mnemosyne
        </h1>
        <p className="text-sm text-white/70 mb-4">
          This lets <span className="text-white">{clientName}</span> use Mnemosyne's MCP tools
          (<code className="font-mono text-xs">search_graph</code>,{" "}
          <code className="font-mono text-xs">get_node</code>) as you.
        </p>
        {redirectUri && (
          <div className="text-xs text-muted-text font-mono mb-4 break-all">
            Redirect: {redirectUri}
          </div>
        )}
        {scopes.length > 0 && (
          <ul className="text-xs text-white/70 mb-4 space-y-1">
            {scopes.map((s: string) => (
              <li key={s}>
                • <span className="font-mono">{s}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-text mb-6">
          This does not bypass Mnemosyne's permissions or backend policies.
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-400 mb-4">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 py-3 bg-neon-primary text-obsidian-bg font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 py-3 border border-obsidian-border text-white font-semibold text-xs uppercase tracking-widest rounded hover:bg-white/5 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}