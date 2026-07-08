import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Inbox, FolderKanban, Compass, Users, Sparkles, Library, Star, LogOut, Network } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Capture Inbox", icon: Inbox },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/areas", label: "Areas", icon: Compass },
  { to: "/resources", label: "Resources", icon: Library },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/prompts", label: "Prompts", icon: Sparkles },
  { to: "/constellation", label: "Constellation", icon: Network },
] as const;

export function AppShell({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-[#050508] text-[#E5E7EB] font-sora">
      {/* Ambient cyber background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-[#3DED97]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-[#4C6FFF]/10 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,#3DED97_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex w-60 flex-col border-r border-white/[0.06] bg-black/40 backdrop-blur-xl">
          <div className="px-5 py-6">
            <Link to="/dashboard" className="flex items-center gap-2 group">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#3DED97] to-[#4C6FFF] shadow-[0_0_20px_rgba(61,237,151,0.4)] group-hover:shadow-[0_0_30px_rgba(61,237,151,0.6)] transition-shadow" />
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-wide">Infinite ISM</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Second Brain</div>
              </div>
            </Link>
          </div>
          <nav className="flex-1 px-3 space-y-0.5">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeProps={{ className: "bg-white/[0.06] text-[#3DED97] shadow-[inset_2px_0_0_#3DED97]" }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="p-3 border-t border-white/[0.06]">
            <button onClick={signOut} className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs text-white/50 hover:text-white/90 hover:bg-white/[0.04] transition-colors">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-[#3DED97] shadow-[0_0_8px_#3DED97] animate-pulse" />
              <h1 className="text-lg font-semibold tracking-tight">{title ?? "Command Center"}</h1>
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </header>
          <div className="flex-1 p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_8px_32px_-8px_rgba(0,0,0,0.5)] ${className}`}>
      {children}
    </div>
  );
}

export function NeonButton({ children, onClick, type = "button", variant = "primary", disabled, className = "" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; variant?: "primary" | "ghost" | "danger"; disabled?: boolean; className?: string }) {
  const styles = {
    primary: "bg-gradient-to-b from-[#3DED97] to-[#2BC77E] text-black shadow-[0_0_20px_rgba(61,237,151,0.35)] hover:shadow-[0_0_28px_rgba(61,237,151,0.55)]",
    ghost: "border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06] hover:text-white",
    danger: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}>
      {children}
    </button>
  );
}

export const priorityColor: Record<string, string> = {
  low: "text-white/40 border-white/10",
  medium: "text-blue-300 border-blue-500/30 bg-blue-500/5",
  high: "text-amber-300 border-amber-500/30 bg-amber-500/5",
  urgent: "text-red-300 border-red-500/40 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.3)]",
};

export const statusColor: Record<string, string> = {
  active: "text-[#3DED97] border-[#3DED97]/30 bg-[#3DED97]/5",
  paused: "text-amber-300 border-amber-500/30",
  completed: "text-white/40 border-white/10",
  archived: "text-white/30 border-white/10",
  todo: "text-white/60 border-white/10",
  doing: "text-blue-300 border-blue-500/30 bg-blue-500/5",
  done: "text-[#3DED97] border-[#3DED97]/30 bg-[#3DED97]/5",
  blocked: "text-red-300 border-red-500/30 bg-red-500/5",
  inbox: "text-[#3DED97] border-[#3DED97]/30 bg-[#3DED97]/5",
  processed: "text-white/40 border-white/10",
};