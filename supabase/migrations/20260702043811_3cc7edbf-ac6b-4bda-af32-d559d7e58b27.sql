
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings (public read for semantic search; admin write via service_role)
CREATE TABLE public.node_embeddings (
  node_id text PRIMARY KEY,
  label text,
  text_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.node_embeddings TO anon, authenticated;
GRANT ALL ON public.node_embeddings TO service_role;
ALTER TABLE public.node_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Embeddings are readable by anyone"
  ON public.node_embeddings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX node_embeddings_hnsw
  ON public.node_embeddings USING hnsw (embedding vector_cosine_ops);

-- Per-user node notes
CREATE TABLE public.node_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  summary text,
  tags text[] NOT NULL DEFAULT '{}',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_notes TO authenticated;
GRANT ALL ON public.node_notes TO service_role;
ALTER TABLE public.node_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notes"
  ON public.node_notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notes"
  ON public.node_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notes"
  ON public.node_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notes"
  ON public.node_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER node_notes_updated_at
  BEFORE UPDATE ON public.node_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Similarity search RPC
CREATE OR REPLACE FUNCTION public.match_nodes(
  query_embedding vector(1536),
  match_count int DEFAULT 10
) RETURNS TABLE (node_id text, label text, similarity float)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT ne.node_id, ne.label, 1 - (ne.embedding <=> query_embedding) AS similarity
  FROM public.node_embeddings ne
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
$$;
GRANT EXECUTE ON FUNCTION public.match_nodes(vector, int) TO anon, authenticated;
