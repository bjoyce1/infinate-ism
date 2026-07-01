
CREATE TABLE public.link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL,
  node_label text,
  node_category text,
  link_type text NOT NULL,
  url text NOT NULL,
  referrer text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX link_clicks_url_idx ON public.link_clicks(url);
CREATE INDEX link_clicks_node_id_idx ON public.link_clicks(node_id);
CREATE INDEX link_clicks_clicked_at_idx ON public.link_clicks(clicked_at DESC);

GRANT SELECT, INSERT ON public.link_clicks TO anon;
GRANT SELECT, INSERT ON public.link_clicks TO authenticated;
GRANT ALL ON public.link_clicks TO service_role;

ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a click"
  ON public.link_clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read click logs"
  ON public.link_clicks FOR SELECT
  TO anon, authenticated
  USING (true);
