import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Mnemosyne" },
      { name: "description", content: "Sign in to save notes and AI summaries in your Second Brain." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const { error } = await fn.call(supabase.auth, {
        email,
        password: pass,
        options: mode === "signup" ? { emailRedirectTo: `${window.location.origin}/` } : undefined,
      });
      if (error) throw error;
      if (mode === "signup") setMsg("Check your email to confirm, then sign in.");
      else navigate({ to: "/" });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-bg text-white font-sora grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="block text-[10px] font-mono uppercase tracking-widest text-muted-text mb-8 hover:text-white">
          ← Back to graph
        </Link>
        <h1 className="text-2xl font-light mb-2">Mnemosyne</h1>
        <p className="text-xs text-muted-text mb-8">
          Sign in to save AI summaries, tags, and notes on any node in your graph.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 bg-obsidian-surface border border-obsidian-border rounded text-sm font-mono outline-none focus:border-neon-primary/60"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full px-3 py-2.5 bg-obsidian-surface border border-obsidian-border rounded text-sm font-mono outline-none focus:border-neon-primary/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-neon-primary text-obsidian-bg font-semibold text-xs uppercase tracking-widest rounded hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        {msg && <p className="mt-4 text-xs text-white/70">{msg}</p>}
      </div>
    </div>
  );
}