ALTER TABLE public.node_notes
  ADD COLUMN IF NOT EXISTS related_node_id text;

ALTER TABLE public.node_embeddings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS node_embeddings_user_id_idx
  ON public.node_embeddings(user_id);

GRANT INSERT, UPDATE, DELETE ON public.node_embeddings TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='node_embeddings' AND policyname='Users insert own embeddings'
  ) THEN
    CREATE POLICY "Users insert own embeddings"
      ON public.node_embeddings
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='node_embeddings' AND policyname='Users update own embeddings'
  ) THEN
    CREATE POLICY "Users update own embeddings"
      ON public.node_embeddings
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='node_embeddings' AND policyname='Users delete own embeddings'
  ) THEN
    CREATE POLICY "Users delete own embeddings"
      ON public.node_embeddings
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.match_nodes(vector, integer);

CREATE OR REPLACE FUNCTION public.match_nodes(query_embedding vector, match_count integer DEFAULT 10)
 RETURNS TABLE(node_id text, label text, similarity double precision, user_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ne.node_id, ne.label,
         1 - (ne.embedding <=> query_embedding) AS similarity,
         ne.user_id
  FROM public.node_embeddings ne
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
$function$;