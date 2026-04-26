-- RPC: admin_get_all_profiles
-- SECURITY DEFINER bypasses RLS. Verifies caller is admin before returning data.
CREATE OR REPLACE FUNCTION admin_get_all_profiles(p_admin_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role text;
  result json;
BEGIN
  SELECT role INTO v_admin_role FROM profiles WHERE id = p_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RETURN '[]'::json;
  END IF;

  SELECT json_agg(p ORDER BY p.created_at DESC) INTO result
  FROM profiles p;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
