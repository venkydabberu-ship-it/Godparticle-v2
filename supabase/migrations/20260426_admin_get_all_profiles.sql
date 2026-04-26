-- RPC: admin_get_all_profiles
-- SECURITY DEFINER bypasses RLS. Checks JWT metadata role first, then profiles table.
CREATE OR REPLACE FUNCTION admin_get_all_profiles(p_admin_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  result json;
BEGIN
  -- Check JWT metadata first (set by auth fix), then fall back to profiles table
  v_role := auth.jwt() -> 'user_metadata' ->> 'role';
  IF v_role IS DISTINCT FROM 'admin' THEN
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  END IF;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RETURN '[]'::json;
  END IF;

  SELECT json_agg(p ORDER BY p.created_at DESC) INTO result
  FROM profiles p;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
