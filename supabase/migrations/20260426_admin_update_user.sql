-- RPC: admin_update_user_role
-- Allows admin users to update any user's role/credits/subscription fields.
-- SECURITY DEFINER bypasses RLS — the function itself runs as the DB owner.
-- It re-checks that the caller (auth.uid()) has role='admin' before proceeding.

CREATE OR REPLACE FUNCTION admin_update_user_role(
  p_admin_id          uuid,
  p_user_id           uuid,
  p_role              text,
  p_credits           int,
  p_subscription_status text,
  p_subscription_plan text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role text;
BEGIN
  -- Verify caller is admin
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
