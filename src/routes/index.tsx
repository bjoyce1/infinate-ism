import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Inbox, FolderKanban, Sparkles, Network, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Infinite ISM — Your AI-powered Second Brain" },
      { name: "description", content: "A premium dark-mode command center that turns your notes, ideas, projects, and clients into a living AI-augmented constellation of knowledge." },
      { property: "og:title", content: "Infinite ISM — Your AI-powered Second Brain" },
      { property: "og:description", content: "Capture. Organize. Act. A cyber-intellectual command center for the mind." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#050508] text-[#E5E7EB] font-sora relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-[#3DED97]/15 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[600px] w-[600px] rounded-full bg-[#4C6FFF]/15 blur-[160px]" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,#3DED97_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#3DED97] to-[#4C6FFF] shadow-[0_0_24px_rgba(61,237,151,0.4)]" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">Infinite ISM</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Second Brain</div>
          </div>
        </div>
        <Link to="/auth" className="text-sm text-white/70 hover:text-white">Sign in →</Link>
      </header>

      <section className="relative z-10 max-w-5xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-[#3DED97]/80 border border-[#3DED97]/20 rounded-full px-3 py-1 mb-6">
          <span className="h-1 w-1 rounded-full bg-[#3DED97] animate-pulse" />
          Personal command center · AI-powered
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
          Your entire mind,{" "}
          <span className="bg-gradient-to-r from-[#3DED97] to-[#4C6FFF] bg-clip-text text-transparent">as a constellation</span>.
        </h1>
        <p className="mt-6 text-lg text-white/60 max-w-2xl mx-auto">
          Capture ideas, run projects, manage clients, and let AI summarize, plan and draft — all inside one cinematic dark-mode command center.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-[#3DED97] to-[#2BC77E] text-black font-medium px-5 py-3 text-sm shadow-[0_0_30px_rgba(61,237,151,0.4)] hover:shadow-[0_0_40px_rgba(61,237,151,0.6)] transition-all">
            Enter your Second Brain
          </Link>
          <Link to="/auth" search={{ next: "/dashboard" }} className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] text-white/80 hover:text-white hover:bg-white/[0.06] font-medium px-5 py-3 text-sm">
            Create an account
          </Link>
        </div>
      </section>

      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 pb-24 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: LayoutDashboard, title: "Command Dashboard", desc: "Today's priorities, active projects, follow-ups — all in one glance." },
          { icon: Inbox, title: "Capture Inbox", desc: "Drop anything — notes, links, lyrics, ideas. AI sorts and enriches them." },
          { icon: FolderKanban, title: "Projects & PARA", desc: "Projects, Areas, Resources, Archives. Every node linked, every task tracked." },
          { icon: Sparkles, title: "AI Action Panel", desc: "Summarize, plan next steps, draft emails and SOWs in one tap." },
          { icon: Users, title: "Client Command", desc: "Track budgets, deliverables, follow-ups and payments per client." },
          { icon: Network, title: "Constellation View", desc: "Your knowledge as a living graph you can navigate at the speed of thought." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md p-5 hover:border-[#3DED97]/30 hover:bg-white/[0.04] transition-all">
            <f.icon className="h-5 w-5 text-[#3DED97] mb-3" />
            <div className="text-sm font-semibold">{f.title}</div>
            <div className="text-xs text-white/50 mt-1.5 leading-relaxed">{f.desc}</div>
          </div>
        ))}
      </section>

      <footer className="relative z-10 border-t border-white/[0.05] py-6 text-center text-xs text-white/30">
        Infinite ISM · A premium AI-powered Second Brain
      </footer>
    </div>
  );
}