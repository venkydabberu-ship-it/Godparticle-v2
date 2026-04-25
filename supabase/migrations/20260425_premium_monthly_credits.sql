-- Add credits_reset_at column to track when premium credits were last refreshed
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_reset_at timestamptz;

-- RPC: called on login for premium users — resets credits to 1000 if 30 days have passed
CREATE OR REPLACE FUNCTION refresh_monthly_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
