-- RPC: admin_get_all_profiles
-- SECURITY DEFINER bypasses RLS so admin can see all user rows.
-- Security: requires a valid auth session (auth.uid() not null).
-- App-level gate (isAdmin check in Admin.tsx) prevents non-admins from calling this.
CREATE OR REPLACE FUNCTION admin_get_all_profiles(p_admin_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT json_agg(p ORDER BY p.created_at DESC) INTO result
  FROM profiles p;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
