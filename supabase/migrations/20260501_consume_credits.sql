-- Atomically checks and deducts credits for an operation.
-- Returns {ok, free, credits_used, error}
-- Pro/admin always get ok=true with free=true (no deduction).
-- SECURITY DEFINER so edge function service-role calls work correctly.

CREATE OR REPLACE FUNCTION consume_credits(p_user_id uuid, p_amount int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role    text;
  v_credits int;
BEGIN
  SELECT role, credits
    INTO v_role, v_credits
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;  -- row-level lock prevents race conditions

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found');
  END IF;

  -- Pro and admin always free
  IF v_role IN ('pro', 'admin') THEN
    RETURN jsonb_build_object('ok', true, 'free', true);
  END IF;

  -- Insufficient credits
  IF v_credits < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough credits', 'credits', v_credits, 'needed', p_amount);
  END IF;

  -- Deduct atomically
  UPDATE profiles
     SET credits = credits - p_amount
   WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'free', false, 'credits_used', p_amount, 'credits_left', v_credits - p_amount);
END;
$$;
