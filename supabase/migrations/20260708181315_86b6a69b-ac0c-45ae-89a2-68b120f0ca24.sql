-- =========================================================================
-- Second Brain schema — multi-tenant, per-user isolation via RLS
-- =========================================================================

-- Enums --------------------------------------------------------------------
CREATE TYPE public.brain_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.brain_project_status AS ENUM ('active', 'paused', 'completed', 'archived');
CREATE TYPE public.brain_task_status AS ENUM ('todo', 'doing', 'done', 'blocked');
CREATE TYPE public.brain_capture_type AS ENUM (
  'note', 'idea', 'voice', 'link', 'client_note', 'project_thought',
  'lyrics', 'business_idea', 'file', 'ai_prompt', 'screenshot'
);
CREATE TYPE public.brain_capture_status AS ENUM ('inbox', 'processed', 'archived');
CREATE TYPE public.brain_payment_status AS ENUM ('none', 'unpaid', 'partial', 'paid', 'overdue');
CREATE TYPE public.brain_resource_type AS ENUM (
  'prompt', 'template', 'design_reference', 'sow', 'contract',
  'lyrics', 'brand_asset', 'seo_note', 'research', 'other'
);
CREATE TYPE public.brain_node_kind AS ENUM (
  'project', 'area', 'task', 'note', 'capture', 'client', 'resource', 'prompt'
);

-- Shared updated_at trigger fn (idempotent) --------------------------------
CREATE OR REPLACE FUNCTION public.brain_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Profiles -----------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();

-- Auto-create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Areas --------------------------------------------------------------------
CREATE TABLE public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own areas" ON public.areas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER areas_touch BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX areas_user_idx ON public.areas(user_id);

-- Clients ------------------------------------------------------------------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text,
  website text,
  email text,
  phone text,
  budget_cents bigint,
  payment_status public.brain_payment_status NOT NULL DEFAULT 'none',
  deliverables text,
  follow_up_date date,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clients" ON public.clients FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX clients_user_idx ON public.clients(user_id);
CREATE INDEX clients_follow_up_idx ON public.clients(user_id, follow_up_date);

-- Projects -----------------------------------------------------------------
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  goal text,
  status public.brain_project_status NOT NULL DEFAULT 'active',
  priority public.brain_priority NOT NULL DEFAULT 'medium',
  deadline date,
  next_action text,
  ai_summary text,
  revenue_potential_cents bigint,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX projects_user_idx ON public.projects(user_id);
CREATE INDEX projects_area_idx ON public.projects(area_id);
CREATE INDEX projects_client_idx ON public.projects(client_id);
CREATE INDEX projects_status_idx ON public.projects(user_id, status);

-- Tasks --------------------------------------------------------------------
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status public.brain_task_status NOT NULL DEFAULT 'todo',
  priority public.brain_priority NOT NULL DEFAULT 'medium',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX tasks_user_idx ON public.tasks(user_id);
CREATE INDEX tasks_project_idx ON public.tasks(project_id);
CREATE INDEX tasks_due_idx ON public.tasks(user_id, status, due_date);

-- Notes --------------------------------------------------------------------
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  title text,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX notes_user_idx ON public.notes(user_id);
CREATE INDEX notes_project_idx ON public.notes(project_id);
CREATE INDEX notes_updated_idx ON public.notes(user_id, updated_at DESC);

-- Captures (fast inbox) ----------------------------------------------------
CREATE TABLE public.captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  body text,
  type public.brain_capture_type NOT NULL DEFAULT 'note',
  status public.brain_capture_status NOT NULL DEFAULT 'inbox',
  priority public.brain_priority NOT NULL DEFAULT 'medium',
  tags text[] NOT NULL DEFAULT '{}',
  next_action text,
  source_url text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.captures TO authenticated;
GRANT ALL ON public.captures TO service_role;
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own captures" ON public.captures FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER captures_touch BEFORE UPDATE ON public.captures FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX captures_user_idx ON public.captures(user_id);
CREATE INDEX captures_inbox_idx ON public.captures(user_id, status, created_at DESC);

-- Resources ----------------------------------------------------------------
CREATE TABLE public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  title text NOT NULL,
  type public.brain_resource_type NOT NULL DEFAULT 'other',
  url text,
  content text,
  tags text[] NOT NULL DEFAULT '{}',
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own resources" ON public.resources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER resources_touch BEFORE UPDATE ON public.resources FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX resources_user_idx ON public.resources(user_id);

-- Prompt library -----------------------------------------------------------
CREATE TABLE public.prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text,
  platform text,
  prompt text NOT NULL,
  use_case text,
  rating smallint CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompts TO authenticated;
GRANT ALL ON public.prompts TO service_role;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prompts" ON public.prompts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER prompts_touch BEFORE UPDATE ON public.prompts FOR EACH ROW EXECUTE FUNCTION public.brain_touch_updated_at();
CREATE INDEX prompts_user_idx ON public.prompts(user_id);

-- Node links (constellation edges between any two brain entities) ----------
CREATE TABLE public.node_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind public.brain_node_kind NOT NULL,
  source_id uuid NOT NULL,
  target_kind public.brain_node_kind NOT NULL,
  target_id uuid NOT NULL,
  relation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_kind, source_id, target_kind, target_id, relation)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_links TO authenticated;
GRANT ALL ON public.node_links TO service_role;
ALTER TABLE public.node_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own node_links" ON public.node_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX node_links_user_idx ON public.node_links(user_id);
CREATE INDEX node_links_src_idx ON public.node_links(user_id, source_kind, source_id);
CREATE INDEX node_links_tgt_idx ON public.node_links(user_id, target_kind, target_id);
