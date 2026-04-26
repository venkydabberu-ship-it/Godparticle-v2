-- RPC: get_my_profile
-- SECURITY DEFINER bypasses RLS entirely.
-- Uses auth.uid() from the JWT — guaranteed correct UUID, no table permission issues.
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT row_to_json(p) INTO result
  FROM profiles p
  WHERE p.id = auth.uid();

  -- If no profile exists yet, return a safe free default
  IF result IS NULL THEN
    RETURN json_build_object(
      'id', auth.uid(),
      'username', 'user',
      'role', 'free',
      'credits', 0,
      'is_active', true,
      'created_at', now()
    );
  END IF;

  RETURN result;
END;
$$;
