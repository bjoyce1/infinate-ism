import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export type CapismEvent = {
  id: string;
  kind: string;
  node_id: string | null;
  node_label: string | null;
  community: number | null;
  payload: JsonValue;
  session_id: string | null;
  created_at: string;
};

export type CapismStats = {
  clicks_total: number;
  clicks_24h: number;
  clicks_60s: number;
  overrides_total: number;
  events_total: number;
  events_60s: number;
  events_24h: number;
  nodes_engaged: number;
};

const EMPTY_STATS: CapismStats = {
  clicks_total: 0,
  clicks_24h: 0,
  clicks_60s: 0,
  overrides_total: 0,
  events_total: 0,
  events_60s: 0,
  events_24h: 0,
  nodes_engaged: 0,
};

let cachedSessionId: string | null = null;
function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === "undefined") return "ssr";
  try {
    const key = "capism.session";
    let sid = window.sessionStorage.getItem(key);
    if (!sid) {
      sid =
        (crypto as { randomUUID?: () => string }).randomUUID?.() ??
        `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      window.sessionStorage.setItem(key, sid);
    }
    cachedSessionId = sid;
    return sid;
  } catch {
    return "anon";
  }
}

/** Fire-and-forget event log. Failures are swallowed (offline / RLS). */
export function logCapismEvent(
  kind: CapismEvent["kind"],
  extra: {
    node_id?: string | null;
    node_label?: string | null;
    community?: number | null;
    payload?: JsonValue;
  } = {},
): void {
  try {
    void supabase.from("capism_events").insert({
      kind,
      session_id: getSessionId(),
      ...extra,
    });
  } catch {
    /* noop */
  }
}

/** Subscribe to the live CAPISM event feed + aggregated stats. */
export function useCapismLive(limit = 8): {
  events: CapismEvent[];
  stats: CapismStats;
  connected: boolean;
} {
  const [events, setEvents] = useState<CapismEvent[]>([]);
  const [stats, setStats] = useState<CapismStats>(EMPTY_STATS);
  const [connected, setConnected] = useState(false);
  const limitRef = useRef(limit);
  limitRef.current = limit;

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      const { data } = await supabase
        .from("capism_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limitRef.current);
      if (!cancelled && data) setEvents(data as CapismEvent[]);
    }
    async function loadStats() {
      const { data } = await supabase.from("capism_stats").select("*").maybeSingle();
      if (!cancelled && data) setStats(data as CapismStats);
    }
    loadEvents();
    loadStats();

    // Poll stats (aggregates aren't published via realtime)
    const statsTimer = window.setInterval(loadStats, 10_000);

    // Realtime for events
    const channel = supabase
      .channel("capism-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "capism_events" },
        (payload) => {
          const row = payload.new as CapismEvent;
          setEvents((prev) => [row, ...prev].slice(0, limitRef.current));
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      window.clearInterval(statsTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  return { events, stats, connected };
}