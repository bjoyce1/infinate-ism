
CREATE TABLE public.node_image_overrides (
  node_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.node_image_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.node_image_overrides TO authenticated;
GRANT ALL ON public.node_image_overrides TO service_role;

ALTER TABLE public.node_image_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read node image overrides"
  ON public.node_image_overrides FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert node image overrides"
  ON public.node_image_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update node image overrides"
  ON public.node_image_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete node image overrides"
  ON public.node_image_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage policies for node-images bucket (admin write, public read is via public bucket)
CREATE POLICY "Admins can upload node images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'node-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update node images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'node-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'node-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete node images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'node-images' AND public.has_role(auth.uid(), 'admin'));
