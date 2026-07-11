
-- Enums
DO $$ BEGIN
  CREATE TYPE public.brain_page_type AS ENUM ('person','company','concept','content','project','personal','skill','routine','application');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.brain_department AS ENUM ('Community','Product','Content','Personal','Business');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend capture status enum
ALTER TYPE public.brain_capture_status ADD VALUE IF NOT EXISTS 'enriched';
ALTER TYPE public.brain_capture_status ADD VALUE IF NOT EXISTS 'filed';

-- brain_pages
CREATE TABLE IF NOT EXISTS public.brain_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  type public.brain_page_type NOT NULL DEFAULT 'concept',
  department public.brain_department,
  body text NOT NULL DEFAULT '',
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
CREATE INDEX IF NOT EXISTS brain_pages_user_updated_idx ON public.brain_pages (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS brain_pages_user_type_idx ON public.brain_pages (user_id, type);
CREATE INDEX IF NOT EXISTS brain_pages_user_department_idx ON public.brain_pages (user_id, department);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_pages TO authenticated;
GRANT ALL ON public.brain_pages TO service_role;
ALTER TABLE public.brain_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brain pages" ON public.brain_pages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER brain_pages_updated_at BEFORE UPDATE ON public.brain_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- page_links
CREATE TABLE IF NOT EXISTS public.page_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_page_id uuid NOT NULL REFERENCES public.brain_pages(id) ON DELETE CASCADE,
  target_page_id uuid NOT NULL REFERENCES public.brain_pages(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'mentions',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_page_id, target_page_id, relation)
);
CREATE INDEX IF NOT EXISTS page_links_source_idx ON public.page_links (source_page_id);
CREATE INDEX IF NOT EXISTS page_links_target_idx ON public.page_links (target_page_id);
CREATE INDEX IF NOT EXISTS page_links_user_idx ON public.page_links (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_links TO authenticated;
GRANT ALL ON public.page_links TO service_role;
ALTER TABLE public.page_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own page links" ON public.page_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- captures.page_id
ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.brain_pages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS captures_page_id_idx ON public.captures (page_id);
