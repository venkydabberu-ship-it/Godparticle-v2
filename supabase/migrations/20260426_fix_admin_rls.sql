-- ============================================================
-- FIX ADMIN PANEL: RLS policies + required functions
-- Run this ONCE in Supabase > SQL Editor
-- ============================================================

-- 1. Fix RLS so the app can read profiles
--    (This is the root cause of admin panel disappearing)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- 2. Add credits_reset_at column (for premium monthly resets)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_reset_at timestamptz;

-- 3. get_my_profile: SECURITY DEFINER RPC — bypasses RLS, always returns correct profile
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT row_to_json(p) INTO result
  FROM profiles p
  WHERE p.id = auth.uid();

  RETURN COALESCE(result, json_build_object(
    'id',         auth.uid(),
    'username',   'user',
    'role',       'free',
    'credits',    0,
    'is_active',  true,
    'created_at', now()
  ));
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

-- 4. refresh_monthly_credits: resets premium credits every 30 days
CREATE OR REPLACE FUNCTION refresh_monthly_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_reset_at timestamptz;
BEGIN
  SELECT role, credits_reset_at
  INTO v_role, v_reset_at
  FROM profiles
  WHERE id = p_user_id;

  IF v_role = 'premium' THEN
    IF v_reset_at IS NULL OR v_reset_at < (now() - interval '30 days') THEN
      UPDATE profiles
      SET credits = 1000,
          credits_reset_at = now()
      WHERE id = p_user_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_monthly_credits(uuid) TO authenticated;

-- 5. admin_update_user_role: allows admin to change any user's role/credits
CREATE OR REPLACE FUNCTION admin_update_user_role(
  p_admin_id            uuid,
  p_user_id             uuid,
  p_role                text,
  p_credits             int,
  p_subscription_status text,
  p_subscription_plan   text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role text;
BEGIN
  SELECT role INTO v_admin_role FROM profiles WHERE id = p_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RETURN 'error: not admin';
  END IF;

  UPDATE profiles
  SET
    role                = p_role,
    credits             = p_credits,
    subscription_status = p_subscription_status,
    subscription_plan   = p_subscription_plan,
    credits_reset_at    = CASE WHEN p_role = 'premium' THEN now() ELSE credits_reset_at END
  WHERE id = p_user_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_user_role(uuid, uuid, text, int, text, text) TO authenticated;
