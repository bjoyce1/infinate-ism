import {
  LayoutDashboard, CalendarDays, Inbox, Target, Users, Calendar,
  Brain, Network, Sparkles, Wallet, Zap, Plug, Settings,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  short: string;
  icon: typeof LayoutDashboard;
  accent: string;
  group: "core" | "work" | "intel" | "ops";
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/command",      label: "Command Overview",    short: "Overview",  icon: LayoutDashboard, accent: "var(--cc-violet)",  group: "core" },
  { to: "/today",        label: "Today",               short: "Today",     icon: CalendarDays,    accent: "var(--cc-gold)",    group: "core" },
  { to: "/inbox",        label: "Unified Inbox",       short: "Inbox",     icon: Inbox,           accent: "var(--cc-cyan)",    group: "core" },
  { to: "/mission",      label: "Mission Control",     short: "Mission",   icon: Target,          accent: "var(--cc-crimson)", group: "work" },
  { to: "/clients",      label: "Clients",             short: "Clients",   icon: Users,           accent: "var(--cc-emerald)", group: "work" },
  { to: "/calendar",     label: "Calendar",            short: "Calendar",  icon: Calendar,        accent: "var(--cc-cyan)",    group: "work" },
  { to: "/brain",        label: "Second Brain",        short: "Brain",     icon: Brain,           accent: "var(--cc-violet)",  group: "intel" },
  { to: "/",             label: "Knowledge Graph",     short: "Graph",     icon: Network,         accent: "var(--cc-violet)",  group: "intel" },
  { to: "/content",      label: "Content Intelligence",short: "Content",   icon: Sparkles,        accent: "var(--cc-gold)",    group: "intel" },
  { to: "/finance",      label: "Finance & Admin",     short: "Finance",   icon: Wallet,          accent: "var(--cc-emerald)", group: "ops" },
  { to: "/automations",  label: "Automations",         short: "Auto",      icon: Zap,             accent: "var(--cc-crimson)", group: "ops" },
  { to: "/integrations", label: "Integrations",        short: "Integrate", icon: Plug,            accent: "var(--cc-cyan)",    group: "ops" },
  { to: "/settings",     label: "Settings",            short: "Settings",  icon: Settings,        accent: "var(--muted-text)", group: "ops" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  core: "Command",
  work: "Work",
  intel: "Intelligence",
  ops: "Operations",
};