
CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, display_name text,
  is_premium boolean NOT NULL DEFAULT false,
  premium_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
CREATE TABLE public.app_settings (id integer PRIMARY KEY DEFAULT 1, config jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.admin_settings (id integer PRIMARY KEY DEFAULT 1, config jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.day_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day integer NOT NULL, amount numeric NOT NULL DEFAULT 0, url text);
CREATE TABLE public.dismissed_cards (user_id uuid NOT NULL, card_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, card_id));
CREATE TABLE public.method_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'frame', position integer NOT NULL DEFAULT 0,
  partie text NOT NULL DEFAULT '', chapitre text NOT NULL DEFAULT '', titre text NOT NULL DEFAULT '', sous_chapitre text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '', cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url text, image_size integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.method_rects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.method_pages(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'text', config jsonb NOT NULL DEFAULT '{}'::jsonb, full_page boolean NOT NULL DEFAULT false,
  x_percent double precision NOT NULL DEFAULT 10, y_percent double precision NOT NULL DEFAULT 10,
  width_percent double precision NOT NULL DEFAULT 30, height_percent double precision NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'simple', amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending', external_ref text, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.premium_content (key text PRIMARY KEY, mode text NOT NULL DEFAULT 'html', html text NOT NULL DEFAULT '', pdf_path text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.activation_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, used_by uuid, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());

GRANT SELECT ON public.profiles, public.user_roles, public.app_settings, public.day_prices, public.method_pages, public.method_rects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.user_roles, public.app_settings, public.admin_settings, public.day_prices, public.dismissed_cards, public.method_pages, public.method_rects, public.orders, public.premium_content, public.activation_codes TO authenticated;
GRANT ALL ON public.profiles, public.user_roles, public.app_settings, public.admin_settings, public.day_prices, public.dismissed_cards, public.method_pages, public.method_rects, public.orders, public.premium_content, public.activation_codes TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.is_premium(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT COALESCE((SELECT is_premium FROM public.profiles WHERE id = _user_id), false) OR public.has_role(_user_id, 'admin') $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dismissed_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.method_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.method_rects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin updates profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manages roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "public reads settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin writes settings" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin only" ON public.admin_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "public reads prices" ON public.day_prices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin writes prices" ON public.day_prices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "own dismissed" ON public.dismissed_cards FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "public reads pages" ON public.method_pages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin writes pages" ON public.method_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "public reads rects" ON public.method_rects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin writes rects" ON public.method_rects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "own orders read" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own pending simple order" ON public.orders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending' AND provider = 'simple');
CREATE POLICY "admin manages orders" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "premium reads content" ON public.premium_content FOR SELECT TO authenticated USING (public.is_premium(auth.uid()));
CREATE POLICY "admin manages content" ON public.premium_content FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manages codes" ON public.activation_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.premium_content_status() RETURNS TABLE(key text, ready boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT key, (mode = 'pdf' AND pdf_path IS NOT NULL) OR (mode <> 'pdf' AND length(html) > 0) FROM public.premium_content $$;

CREATE OR REPLACE FUNCTION public.redeem_activation_code(_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT id INTO cid FROM public.activation_codes WHERE upper(code) = upper(trim(_code)) AND used_by IS NULL FOR UPDATE;
  IF cid IS NULL THEN RETURN false; END IF;
  UPDATE public.activation_codes SET used_by = auth.uid(), used_at = now() WHERE id = cid;
  UPDATE public.profiles SET is_premium = true, premium_since = now() WHERE id = auth.uid();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.order_paid_grants_premium() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.profiles SET is_premium = true, premium_since = COALESCE(premium_since, now()) WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_paid AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.order_paid_grants_premium();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.order_paid_grants_premium() FROM anon, authenticated, public;

INSERT INTO public.app_settings (id, config) VALUES (1, '{}'::jsonb);
INSERT INTO public.admin_settings (id, config) VALUES (1, '{}'::jsonb);
INSERT INTO public.day_prices (day, amount) VALUES (1, 9.99), (2, 14.99), (3, 19.99), (4, 24.99);

CREATE POLICY "admin writes media" ON storage.objects FOR ALL TO authenticated USING (bucket_id IN ('media','premium') AND public.has_role(auth.uid(),'admin')) WITH CHECK (bucket_id IN ('media','premium') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "premium reads premium files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'premium' AND public.is_premium(auth.uid()));
