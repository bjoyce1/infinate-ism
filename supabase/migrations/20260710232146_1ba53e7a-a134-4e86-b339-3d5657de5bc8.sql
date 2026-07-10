
-- Enums (idempotent via DO blocks)
DO $$ BEGIN
  CREATE TYPE public.cc_alert_severity AS ENUM ('info','success','warning','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cc_inbox_category AS ENUM ('urgent','needs_reply','needs_decision','waiting','finance_security','fyi','noise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cc_content_stage AS ENUM ('idea','draft','review','scheduled','published','repurpose');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cc_content_format AS ENUM ('social_post','short_video','article','newsletter','podcast','press_release');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cc_connector_state AS ENUM ('disconnected','connected','error','pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cc_automation_status AS ENUM ('active','paused','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Dashboard preferences
CREATE TABLE IF NOT EXISTS public.cc_dashboard_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden_cards text[] NOT NULL DEFAULT '{}',
  card_order text[] NOT NULL DEFAULT '{}',
  theme_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_dashboard_prefs TO authenticated;
GRANT ALL ON public.cc_dashboard_prefs TO service_role;
ALTER TABLE public.cc_dashboard_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.cc_dashboard_prefs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Alerts
CREATE TABLE IF NOT EXISTS public.cc_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  severity public.cc_alert_severity NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  source text,
  href text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_alerts_user_created_idx ON public.cc_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cc_alerts_unread_idx ON public.cc_alerts(user_id, is_read);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_alerts TO authenticated;
GRANT ALL ON public.cc_alerts TO service_role;
ALTER TABLE public.cc_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts" ON public.cc_alerts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Activity feed
CREATE TABLE IF NOT EXISTS public.cc_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  summary text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_activity_user_created_idx ON public.cc_activity(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_activity TO authenticated;
GRANT ALL ON public.cc_activity TO service_role;
ALTER TABLE public.cc_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity" ON public.cc_activity FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Connector status
CREATE TABLE IF NOT EXISTS public.cc_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  state public.cc_connector_state NOT NULL DEFAULT 'disconnected',
  account_label text,
  last_sync_at timestamptz,
  last_error text,
  scopes text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_connectors TO authenticated;
GRANT ALL ON public.cc_connectors TO service_role;
ALTER TABLE public.cc_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own connectors" ON public.cc_connectors FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Saved views
CREATE TABLE IF NOT EXISTS public.cc_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_saved_views_user_scope_idx ON public.cc_saved_views(user_id, scope);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_saved_views TO authenticated;
GRANT ALL ON public.cc_saved_views TO service_role;
ALTER TABLE public.cc_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own views" ON public.cc_saved_views FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Automation rules
CREATE TABLE IF NOT EXISTS public.cc_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.cc_automation_status NOT NULL DEFAULT 'paused',
  last_run_at timestamptz,
  last_error text,
  is_starter boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_automation_rules TO authenticated;
GRANT ALL ON public.cc_automation_rules TO service_role;
ALTER TABLE public.cc_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules" ON public.cc_automation_rules FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Communications (unified inbox)
CREATE TABLE IF NOT EXISTS public.cc_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text,
  sender text,
  subject text,
  snippet text,
  body text,
  category public.cc_inbox_category NOT NULL DEFAULT 'fyi',
  urgency int NOT NULL DEFAULT 0,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  deadline timestamptz,
  suggested_action text,
  draft text,
  is_demo boolean NOT NULL DEFAULT false,
  is_handled boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS cc_comm_user_received_idx ON public.cc_communications(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS cc_comm_user_cat_idx ON public.cc_communications(user_id, category);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_communications TO authenticated;
GRANT ALL ON public.cc_communications TO service_role;
ALTER TABLE public.cc_communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own comms" ON public.cc_communications FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Follow-ups
CREATE TABLE IF NOT EXISTS public.cc_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  waiting_on text,
  due_date date,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_followups_user_due_idx ON public.cc_followups(user_id, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_followups TO authenticated;
GRANT ALL ON public.cc_followups TO service_role;
ALTER TABLE public.cc_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own followups" ON public.cc_followups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9. Content pipeline
CREATE TABLE IF NOT EXISTS public.cc_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  hook text,
  body text,
  format public.cc_content_format NOT NULL DEFAULT 'social_post',
  stage public.cc_content_stage NOT NULL DEFAULT 'idea',
  platforms text[] NOT NULL DEFAULT '{}',
  source_type text,
  source_id text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_content_user_stage_idx ON public.cc_content_items(user_id, stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_content_items TO authenticated;
GRANT ALL ON public.cc_content_items TO service_role;
ALTER TABLE public.cc_content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own content" ON public.cc_content_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10. Finance alerts
CREATE TABLE IF NOT EXISTS public.cc_finance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  amount_cents bigint,
  currency text NOT NULL DEFAULT 'USD',
  vendor text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  due_date date,
  severity public.cc_alert_severity NOT NULL DEFAULT 'info',
  is_resolved boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_finance_user_due_idx ON public.cc_finance_alerts(user_id, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_finance_alerts TO authenticated;
GRANT ALL ON public.cc_finance_alerts TO service_role;
ALTER TABLE public.cc_finance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own finance" ON public.cc_finance_alerts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11. Daily briefs
CREATE TABLE IF NOT EXISTS public.cc_daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_date date NOT NULL,
  kind text NOT NULL DEFAULT 'morning',
  summary text NOT NULL,
  focus text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brief_date, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_daily_briefs TO authenticated;
GRANT ALL ON public.cc_daily_briefs TO service_role;
ALTER TABLE public.cc_daily_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own briefs" ON public.cc_daily_briefs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers
CREATE TRIGGER cc_prefs_updated BEFORE UPDATE ON public.cc_dashboard_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cc_connectors_updated BEFORE UPDATE ON public.cc_connectors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cc_rules_updated BEFORE UPDATE ON public.cc_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cc_followups_updated BEFORE UPDATE ON public.cc_followups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cc_content_updated BEFORE UPDATE ON public.cc_content_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
