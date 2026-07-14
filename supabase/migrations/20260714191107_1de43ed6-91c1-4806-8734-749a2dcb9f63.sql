DROP POLICY IF EXISTS "Embeddings are readable by anyone" ON public.node_embeddings;

CREATE POLICY "Shared embeddings readable by anyone"
ON public.node_embeddings FOR SELECT
TO anon, authenticated
USING (user_id IS NULL);

CREATE POLICY "Users read own embeddings"
ON public.node_embeddings FOR SELECT
TO authenticated
USING (auth.uid() = user_id);