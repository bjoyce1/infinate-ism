import { type ReactNode, useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { NAV_ITEMS, GROUP_LABELS, type NavItem } from "@/lib/commandCenter/nav";
import { fmtChicagoNow } from "@/lib/commandCenter/format";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Command as CmdIcon, Plus, Bell, ChevronsLeft, ChevronsRight,
  User, LogOut, Sparkles, Circle,
} from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { ChiefOfStaffDrawer } from "./ChiefOfStaffDrawer";
import { QuickCreateDialog } from "./QuickCreateDialog";
import { NotificationCenter } from "./NotificationCenter";

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function SidebarItem({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={[
        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-white/[0.05] text-white"
          : "text-cc-muted hover:text-cc-text hover:bg-white/[0.03]",
      ].join(" ")}
    >
      <span
        className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full transition-opacity"
        style={{ background: item.accent, opacity: active ? 1 : 0 }}
      />
      <Icon
        className="size-[18px] shrink-0"
        style={active ? { color: item.accent } : undefined}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="truncate font-medium">{item.label}</span>}
    </Link>
  );
}

export function CommandShell({ children, hideChrome = false }: { children: ReactNode; hideChrome?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const now = useNow();
  const { date, time } = fmtChicagoNow(now);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAiOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCreateOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => setEmail(session?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const groups = (["core", "work", "intel", "ops"] as const).map((g) => ({
    key: g,
    items: NAV_ITEMS.filter((i) => i.group === g),
  }));

  if (hideChrome) return <div className="h-screen w-full cc-app-bg text-cc-text">{children}</div>;

  return (
    <div className="relative flex h-screen w-full overflow-hidden cc-app-bg text-cc-text font-sora">
      <div className="pointer-events-none absolute inset-0 cc-grid-overlay opacity-40" />

      {/* Mobile scrim */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "z-50 flex h-full shrink-0 flex-col border-r border-cc-border bg-cc-panel/80 backdrop-blur-xl transition-all",
          collapsed ? "w-[68px]" : "w-[248px]",
          "fixed md:relative",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-cc-border px-3">
          <div
            className="grid size-9 shrink-0 place-items-center rounded-lg text-black font-bold text-[13px]"
            style={{ background: "linear-gradient(135deg,#F4B740,#E23E57)" }}
            aria-label="C.A.P.I.S.M. crest"
          >
            C
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold tracking-[0.18em] text-cc-text">
                C.A.P.I.S.M.
              </div>
              <div className="truncate text-[10px] uppercase tracking-[0.22em] text-cc-muted">
                Command Center
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden rounded-md p-1.5 text-cc-muted hover:bg-white/[0.05] hover:text-cc-text md:inline-flex"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g.key} className="mb-4">
              {!collapsed && (
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cc-muted/70">
                  {GROUP_LABELS[g.key]}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <SidebarItem
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    active={
                      item.to === "/"
                        ? pathname === "/"
                        : pathname === item.to || pathname.startsWith(item.to + "/")
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-cc-border p-2">
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-cc-text hover:bg-white/[0.04]"
          >
            <span className="grid size-[26px] place-items-center rounded-md" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(56,189,248,0.15))" }}>
              <Sparkles className="size-[15px]" style={{ color: "var(--cc-violet)" }} strokeWidth={1.75} />
            </span>
            {!collapsed && <span className="truncate">Chief of Staff</span>}
            {!collapsed && <kbd className="ml-auto rounded border border-cc-border bg-black/40 px-1.5 py-0.5 text-[9px] text-cc-muted">⌘J</kbd>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-cc-border bg-cc-panel/60 px-3 backdrop-blur-xl sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="grid size-9 place-items-center rounded-md border border-cc-border text-cc-muted hover:text-cc-text md:hidden"
            aria-label="Open navigation"
          >
            <CmdIcon className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-cc-border bg-black/30 px-3 text-left text-[13px] text-cc-muted transition-colors hover:border-cc-border-2 hover:text-cc-text sm:max-w-[520px]"
          >
            <Search className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Search projects, clients, notes, prompts…</span>
            <kbd className="hidden shrink-0 rounded border border-cc-border bg-black/40 px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right lg:block">
              <div className="font-mono text-[11px] leading-none text-cc-muted">{date}</div>
              <div className="mt-1 font-mono text-[12px] leading-none text-cc-text" title="America/Chicago">
                {time} <span className="text-cc-muted">CT</span>
              </div>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full border border-cc-border bg-black/30 px-2.5 py-1 lg:flex">
              <span className="relative inline-flex size-1.5 rounded-full bg-cc-emerald cc-pulse" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-cc-muted">Live</span>
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="grid size-9 place-items-center rounded-md border border-cc-border text-cc-muted transition-colors hover:border-cc-border-2 hover:text-cc-text"
              aria-label="Quick create"
              title="Quick create (⌘⇧N)"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative grid size-9 place-items-center rounded-md border border-cc-border text-cc-muted transition-colors hover:border-cc-border-2 hover:text-cc-text"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-cc-crimson" />
            </button>
            <div className="hidden items-center gap-2 rounded-full border border-cc-border bg-black/30 px-2 py-1 md:flex">
              <span className="grid size-6 place-items-center rounded-full bg-white/[0.06] text-[11px] text-cc-text">
                <User className="size-3.5" />
              </span>
              <span className="max-w-[140px] truncate font-mono text-[11px] text-cc-muted">{email ?? "guest"}</span>
              {email && (
                <button
                  type="button"
                  onClick={async () => { await supabase.auth.signOut(); location.href = "/auth"; }}
                  className="rounded p-1 text-cc-muted hover:text-cc-crimson"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onAskAi={() => { setPaletteOpen(false); setAiOpen(true); }} />
      <QuickCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <NotificationCenter open={notifOpen} onOpenChange={setNotifOpen} />
      <ChiefOfStaffDrawer open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-cc-muted">
            <Circle className="size-1.5 fill-current" />
            {eyebrow}
          </div>
        )}
        <h1 className="truncate text-[26px] font-semibold leading-tight text-cc-text sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-cc-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}