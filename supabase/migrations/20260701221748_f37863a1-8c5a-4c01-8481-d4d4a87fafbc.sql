
-- 1. Roles infrastructure
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2. Tighten link_clicks SELECT: admins only
DROP POLICY IF EXISTS "Anyone can read click logs" ON public.link_clicks;

CREATE POLICY "Admins can read click logs"
  ON public.link_clicks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Remove anon SELECT grant since only admins should read
REVOKE SELECT ON public.link_clicks FROM anon;

-- 3. Tighten link_clicks INSERT: replace WITH CHECK (true) with validation
DROP POLICY IF EXISTS "Anyone can log a click" ON public.link_clicks;

CREATE POLICY "Anyone can log a validated click"
  ON public.link_clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(url) BETWEEN 1 AND 2048
    AND char_length(node_id) BETWEEN 1 AND 256
    AND link_type IN ('external_link', 'mailto', 'http')
    AND (node_label IS NULL OR char_length(node_label) <= 512)
    AND (node_category IS NULL OR char_length(node_category) <= 128)
    AND (referrer IS NULL OR char_length(referrer) <= 2048)
  );
