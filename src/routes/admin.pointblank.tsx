import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { resyncPointBlank } from "@/lib/resyncPointBlank.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/pointblank")({
  head: () => ({
    meta: [
      { title: "Admin — Resync Point Blank" },
      { name: "description", content: "Refresh the Point Blank node by scraping ogpointblank.com on demand." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

type Report = Awaited<ReturnType<typeof resyncPointBlank>>;

function Page() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const run = useServerFn(resyncPointBlank);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const doResync = async () => {
    setBusy(true);
    try {
      const r = await run({});
      setReport(r);
      toast.success(
        r.logo_assigned ? `Resynced — logo updated (${r.links.length} links found)` : `Resynced — ${r.links.length} links found`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-bg text-white font-sora p-8 max-w-3xl mx-auto">
      <Link to="/admin" className="text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white">
        ← Admin
      </Link>
      <h1 className="text-2xl font-light mt-6 mb-2">Resync · Point Blank</h1>
      <p className="text-sm text-muted-text mb-6">
        Scrapes <code className="font-mono">ogpointblank.com</code> live and mirrors the logo to
        the <code className="font-mono">spc_artist_point_blank</code> node. Shows every link, email
        and social profile it finds so you can decide what to add to the graph.
      </p>

      {signedIn === false && (
        <div className="p-4 bg-white/5 border border-obsidian-border rounded">
          <p className="text-sm mb-3">You must be signed in as an admin.</p>
          <Link to="/auth" className="px-3 py-2 bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest rounded">
            Sign in
          </Link>
        </div>
      )}

      {signedIn && (
        <>
          <button
            type="button"
            onClick={doResync}
            disabled={busy}
            className="w-full py-3 bg-neon-primary text-obsidian-bg font-semibold text-xs uppercase tracking-widest rounded disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Resyncing…" : "◎ Resync from ogpointblank.com"}
          </button>

          {report && (
            <div className="mt-6 space-y-4 text-sm">
              <Row label="Fetched">{new Date(report.fetched_at).toLocaleString()} · HTTP {report.status}</Row>
              <Row label="Final URL"><a className="underline break-all" href={report.final_url} target="_blank" rel="noreferrer">{report.final_url}</a></Row>
              <Row label="Title">{report.title ?? "—"}</Row>
              <Row label="Description">{report.description ?? "—"}</Row>
              <Row label="Logo">
                {report.logo_url ? (
                  <div className="flex items-center gap-3">
                    <img src={report.logo_url} alt="logo" className="size-16 rounded bg-white/5 object-contain" />
                    <div>
                      <div className="break-all text-xs">{report.logo_url}</div>
                      <div className="text-[10px] font-mono uppercase tracking-widest mt-1 text-muted-text">
                        {report.logo_assigned ? "mirrored + assigned" : "found (not mirrored)"}
                      </div>
                    </div>
                  </div>
                ) : "—"}
              </Row>
              <Row label={`Socials (${report.socials.length})`}>
                <ul className="space-y-1">
                  {report.socials.map((l) => (
                    <li key={l.href}><a className="underline break-all" href={l.href} target="_blank" rel="noreferrer">{l.href}</a></li>
                  ))}
                  {report.socials.length === 0 && <li className="text-muted-text">none</li>}
                </ul>
              </Row>
              <Row label={`Emails (${report.emails.length})`}>
                {report.emails.length ? report.emails.join(", ") : <span className="text-muted-text">none</span>}
              </Row>
              <Row label={`All links (${report.links.length})`}>
                <details>
                  <summary className="cursor-pointer text-xs font-mono uppercase tracking-widest text-muted-text">Expand</summary>
                  <ul className="mt-2 space-y-1 max-h-96 overflow-auto pr-2">
                    {report.links.map((l) => (
                      <li key={l.href} className="text-xs">
                        <a className="underline break-all" href={l.href} target="_blank" rel="noreferrer">{l.href}</a>
                        {l.text && <span className="text-muted-text"> — {l.text}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              </Row>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-3 bg-obsidian-surface border border-obsidian-border rounded">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
