
-- Live pulse/event log for the CAPISM HUD
CREATE TABLE public.capism_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,
  node_id      text,
  node_label   text,
  community    integer,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX capism_events_created_at_idx ON public.capism_events (created_at DESC);
CREATE INDEX capism_events_kind_idx       ON public.capism_events (kind);

GRANT SELECT, INSERT ON public.capism_events TO anon, authenticated;
GRANT ALL             ON public.capism_events TO service_role;

ALTER TABLE public.capism_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read capism events"
  ON public.capism_events FOR SELECT
  USING (true);

CREATE POLICY "Anyone can log a validated capism event"
  ON public.capism_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    kind = ANY (ARRAY['node_select','node_pulse','community_focus','capture','boot','heartbeat','ask'])
    AND (node_id    IS NULL OR char_length(node_id)    <= 256)
    AND (node_label IS NULL OR char_length(node_label) <= 512)
    AND (session_id IS NULL OR char_length(session_id) <= 128)
    AND octet_length(payload::text) <= 4096
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.capism_events;

-- Aggregate stats view (safe public counters)
CREATE OR REPLACE VIEW public.capism_stats
WITH (security_invoker = on) AS
SELECT
  (SELECT count(*) FROM public.link_clicks)                                           AS clicks_total,
  (SELECT count(*) FROM public.link_clicks WHERE clicked_at > now() - interval '24 hours') AS clicks_24h,
  (SELECT count(*) FROM public.link_clicks WHERE clicked_at > now() - interval '60 seconds') AS clicks_60s,
  (SELECT count(*) FROM public.node_image_overrides)                                  AS overrides_total,
  (SELECT count(*) FROM public.capism_events)                                         AS events_total,
  (SELECT count(*) FROM public.capism_events WHERE created_at > now() - interval '60 seconds') AS events_60s,
  (SELECT count(*) FROM public.capism_events WHERE created_at > now() - interval '24 hours')  AS events_24h,
  (SELECT count(DISTINCT node_id) FROM public.link_clicks)                            AS nodes_engaged;

GRANT SELECT ON public.capism_stats TO anon, authenticated;
